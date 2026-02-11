import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	user: {
		findUnique: vi.fn(),
	},
	subscription: {
		findFirst: vi.fn(),
		update: vi.fn(),
	},
	plan: {
		findUnique: vi.fn(),
	},
}));

const providerMock = vi.hoisted(() => ({
	supportsFeature: vi.fn(),
	scheduleSubscriptionPlanChange: vi.fn(),
	updateSubscriptionPlan: vi.fn(),
}));

const paymentServiceMock = vi.hoisted(() => ({
	getProviderForRecord: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@clerk/nextjs/server', () => ({ auth: () => ({ userId: 'user_1' }) }));
vi.mock('../lib/payment/service', () => ({ paymentService: paymentServiceMock }));
vi.mock('../lib/settings', () => ({
	isRecurringProrationEnabled: vi.fn(async () => true),
	shouldResetPaidTokensOnRenewalForPlanAutoRenew: vi.fn(async () => false),
}));
vi.mock('../lib/notifications', () => ({ sendBillingNotification: vi.fn(async () => ({ ok: true })) }));
vi.mock('../lib/plans', () => ({ PLAN_DEFINITIONS: [], resolvePlanPriceEnv: vi.fn(), syncPlanExternalPriceIds: vi.fn(async () => undefined) }));
vi.mock('../lib/payment/registry', () => ({ getActiveCurrency: () => 'usd' }));
vi.mock('../lib/utils/currency', () => ({ formatCurrency: () => '$0.00' }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../lib/utils/provider-ids', () => ({
	findProviderByValue: vi.fn(() => null),
	getCurrentProviderKey: vi.fn(() => 'razorpay'),
	getIdByProvider: vi.fn((json: string | null | undefined, providerKey: string) => {
		if (!json) return null;
		try {
			const parsed = JSON.parse(json);
			return parsed?.[providerKey] ?? null;
		} catch {
			return null;
		}
	}),
}));

import { POST } from '../app/api/subscription/proration/route';

describe('POST /api/subscription/proration (scheduleAt=cycle_end)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		paymentServiceMock.getProviderForRecord.mockReturnValue(providerMock);
		providerMock.supportsFeature.mockReturnValue(true);

		prismaMock.user.findUnique.mockResolvedValue({
			id: 'user_1',
			externalCustomerId: 'cust_1',
			externalCustomerIds: JSON.stringify({ razorpay: 'cust_1' }),
		});

		prismaMock.subscription.findFirst.mockResolvedValue({
			id: 'sub_db_1',
			planId: 'plan_current',
			expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
			status: 'ACTIVE',
			externalSubscriptionId: 'sub_rzp_1',
			externalSubscriptionIds: JSON.stringify({ razorpay: 'sub_rzp_1' }),
			paymentProvider: 'razorpay',
			plan: { id: 'plan_current', name: 'Current', priceCents: 1000, autoRenew: true },
		});

		prismaMock.plan.findUnique.mockResolvedValue({
			id: 'plan_target',
			name: 'Target',
			priceCents: 2000,
			autoRenew: true,
			externalPriceId: null,
			stripePriceId: null,
			externalPriceIds: JSON.stringify({ razorpay: 'plan_rzp_target' }),
		});
	});

	it('schedules provider-native plan change and does not mutate DB subscription immediately', async () => {
		providerMock.scheduleSubscriptionPlanChange.mockResolvedValue({
			success: true,
			newPeriodEnd: new Date('2026-02-10T00:00:00.000Z'),
		});

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target', scheduleAt: 'cycle_end' }),
		});

		const res = await POST(req as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.scheduled).toBe(true);
		expect(body.newPlan?.id).toBe('plan_target');
		expect(body.currentPeriodEnd).toBe('2026-02-10T00:00:00.000Z');

		expect(providerMock.scheduleSubscriptionPlanChange).toHaveBeenCalledWith('sub_rzp_1', 'plan_rzp_target', 'user_1');
		expect(prismaMock.subscription.update).not.toHaveBeenCalled();
	});

	it('returns 409 when provider does not implement scheduling', async () => {
		(paymentServiceMock.getProviderForRecord as any).mockReturnValue({
			...providerMock,
			scheduleSubscriptionPlanChange: undefined,
		});

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target', scheduleAt: 'cycle_end' }),
		});

		const res = await POST(req as any);
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.prorationEnabled).toBe(false);
		expect(body.code).toBe('PROVIDER_SCHEDULED_PLAN_CHANGE_UNSUPPORTED');
	});
});
