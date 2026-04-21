import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	user: {
		findUnique: vi.fn(),
		update: vi.fn(),
	},
	subscription: {
		findFirst: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
	},
	plan: {
		findUnique: vi.fn(),
	},
	organization: {
		findUnique: vi.fn(),
		update: vi.fn(),
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
vi.mock('../lib/auth-provider', () => ({ authService: { getSession: vi.fn(async () => ({ userId: 'user_1', orgId: null })) } }));
vi.mock('../lib/payment/service', () => ({ paymentService: paymentServiceMock }));
vi.mock('../lib/settings', () => ({
	isRecurringProrationEnabled: vi.fn(async () => true),
	shouldResetPaidTokensOnRenewalForPlanAutoRenew: vi.fn(async () => false),
}));
vi.mock('../lib/notifications', () => ({ sendBillingNotification: vi.fn(async () => ({ ok: true })), sendAdminNotificationEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock('../lib/plans', () => ({ PLAN_DEFINITIONS: [], resolvePlanPriceEnv: vi.fn(), syncPlanExternalPriceIds: vi.fn(async () => undefined) }));
vi.mock('../lib/payment/registry', () => ({ getActiveCurrency: () => 'usd', getActiveCurrencyAsync: async () => 'usd' }));
vi.mock('../lib/utils/currency', () => ({ formatCurrency: () => '$0.00' }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../lib/teams', () => ({
	creditOrganizationSharedTokens: vi.fn(async () => undefined),
	resetOrganizationSharedTokens: vi.fn(async () => undefined),
}));
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

import { GET, POST } from '../app/api/subscription/proration/route';
import { sendBillingNotification } from '../lib/notifications';
import { shouldResetPaidTokensOnRenewalForPlanAutoRenew } from '../lib/settings';
import { resetOrganizationSharedTokens } from '../lib/teams';
import { NextRequest } from 'next/server';

type RouteProvider = typeof providerMock;
type MutableError = Error & { originalError?: { code?: string; decline_code?: string } };

function toNextRequest(request: Request): NextRequest {
	return new NextRequest(request);
}

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
			plan: { id: 'plan_current', name: 'Current', priceCents: 1000, autoRenew: true, tokenLimit: 100 },
		});

		prismaMock.plan.findUnique.mockResolvedValue({
			id: 'plan_target',
			name: 'Target',
			priceCents: 2000,
			autoRenew: true,
			tokenLimit: 100,
			externalPriceId: null,
			externalPriceIds: JSON.stringify({ razorpay: 'plan_rzp_target' }),
		});

		prismaMock.organization.findUnique.mockResolvedValue(null);
	});

	it('sets the new finite allotment when switching from unlimited to limited recurring access', async () => {
		prismaMock.subscription.findFirst.mockResolvedValueOnce({
			id: 'sub_db_1',
			planId: 'plan_current',
			expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
			status: 'ACTIVE',
			externalSubscriptionId: 'sub_rzp_1',
			externalSubscriptionIds: JSON.stringify({ razorpay: 'sub_rzp_1' }),
			paymentProvider: 'razorpay',
			plan: { id: 'plan_current', name: 'Unlimited Current', priceCents: 1000, autoRenew: true, tokenLimit: null },
		});

		providerMock.updateSubscriptionPlan.mockResolvedValue({
			success: true,
			newPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
			invoiceId: 'in_unlimited_to_limited',
			amountPaid: 1500,
		});

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target' }),
		});

		const res = await POST(toNextRequest(req));
		expect(res.status).toBe(200);
		expect(prismaMock.user.update).toHaveBeenCalledWith({
			where: { id: 'user_1' },
			data: { tokenBalance: 100 },
		});
	});

	it('schedules provider-native plan change and bookmarks scheduled plan in DB', async () => {
		providerMock.scheduleSubscriptionPlanChange.mockResolvedValue({
			success: true,
			newPeriodEnd: new Date('2026-02-10T00:00:00.000Z'),
		});

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target', scheduleAt: 'cycle_end' }),
		});

		const res = await POST(toNextRequest(req));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.scheduled).toBe(true);
		expect(body.newPlan?.id).toBe('plan_target');
		expect(body.currentPeriodEnd).toBe('2026-02-10T00:00:00.000Z');

		expect(providerMock.scheduleSubscriptionPlanChange).toHaveBeenCalledWith('sub_rzp_1', 'plan_rzp_target', 'user_1');
		// The only DB update should bookmark the scheduled plan — not change planId itself.
		expect(prismaMock.subscription.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ scheduledPlanId: 'plan_target' }),
			}),
		);
	});

	it('returns 409 when provider does not implement scheduling', async () => {
		paymentServiceMock.getProviderForRecord.mockReturnValue({
			...providerMock,
			scheduleSubscriptionPlanChange: undefined,
		} as unknown as RouteProvider);

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target', scheduleAt: 'cycle_end' }),
		});

		const res = await POST(toNextRequest(req));
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.prorationEnabled).toBe(false);
		expect(body.code).toBe('PROVIDER_SCHEDULED_PLAN_CHANGE_UNSUPPORTED');
	});

	it('maps Razorpay remaining_count scheduling error to 409', async () => {
		providerMock.scheduleSubscriptionPlanChange.mockRejectedValue(
			new Error('Razorpay API request failed (400): BAD_REQUEST_ERROR: remaining_count should be present to update to new plan which has different period')
		);

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target', scheduleAt: 'cycle_end' }),
		});

		const res = await POST(toNextRequest(req));
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.code).toBe('RAZORPAY_REMAINING_COUNT_REQUIRED');
	});

	it('maps Razorpay non-updatable subscription state error to 409', async () => {
		providerMock.scheduleSubscriptionPlanChange.mockRejectedValue(
			new Error("Razorpay API request failed (400): BAD_REQUEST_ERROR: Can't update subscription when subscription is not in Authenticated or Active state (field: status)")
		);

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target', scheduleAt: 'cycle_end' }),
		});

		const res = await POST(toNextRequest(req));
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.code).toBe('RAZORPAY_SUBSCRIPTION_NOT_UPDATABLE_STATE');
	});

	it('immediate switch maps Razorpay remaining_count error to 409', async () => {
		providerMock.updateSubscriptionPlan.mockRejectedValue(
			new Error('Razorpay API request failed (400): BAD_REQUEST_ERROR: remaining_count should be present to update to new plan which has different period')
		);

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target' }),
		});

		const res = await POST(toNextRequest(req));
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.code).toBe('RAZORPAY_REMAINING_COUNT_REQUIRED');
	});

	it('immediate switch maps Razorpay non-updatable state error to 409', async () => {
		providerMock.updateSubscriptionPlan.mockRejectedValue(
			new Error("Razorpay API request failed (400): BAD_REQUEST_ERROR: Can't update subscription when subscription is not in Authenticated or Active state (field: status)")
		);

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target' }),
		});

		const res = await POST(toNextRequest(req));
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.code).toBe('RAZORPAY_SUBSCRIPTION_NOT_UPDATABLE_STATE');
	});

	it('immediate switch returns requiresAction when provider signals SCA', async () => {
		providerMock.updateSubscriptionPlan.mockResolvedValue({
			success: true,
			requiresAction: true,
			clientSecret: 'pi_secret_abc123',
			newPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
			invoiceId: 'in_123',
			amountPaid: 500,
		});

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target' }),
		});

		const res = await POST(toNextRequest(req));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.requiresAction).toBe(true);
		expect(body.clientSecret).toBe('pi_secret_abc123');
		expect(body.newPlan?.id).toBe('plan_target');

		// DB should NOT be updated yet — webhook handles it after SCA completes
		expect(prismaMock.subscription.update).not.toHaveBeenCalled();
	});

	it('immediate switch updates DB and returns success when no SCA required', async () => {
		providerMock.updateSubscriptionPlan.mockResolvedValue({
			success: true,
			newPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
			invoiceId: 'in_456',
			amountPaid: 1500,
		});

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target' }),
		});

		const res = await POST(toNextRequest(req));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.requiresAction).toBeUndefined();
		expect(body.invoiceId).toBe('in_456');
		expect(body.actualAmountCharged).toBe(1500);

		// DB should be updated immediately
		expect(prismaMock.subscription.update).toHaveBeenCalled();
	});

	it('Paystack switch-now creates a provisional pending subscription and defers activation side effects', async () => {
		prismaMock.user.findUnique.mockResolvedValueOnce({
			id: 'user_1',
			externalCustomerId: 'cust_ps_1',
			externalCustomerIds: JSON.stringify({ paystack: 'cust_ps_1' }),
		});

		prismaMock.subscription.findFirst.mockResolvedValueOnce({
			id: 'sub_db_paystack_current',
			planId: 'plan_current',
			expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
			status: 'ACTIVE',
			externalSubscriptionId: 'sub_ps_current',
			externalSubscriptionIds: JSON.stringify({ paystack: 'sub_ps_current' }),
			paymentProvider: 'paystack',
			organizationId: null,
			plan: { id: 'plan_current', name: 'Current', priceCents: 1000, autoRenew: true, recurringInterval: 'month', recurringIntervalCount: 1, tokenLimit: 100 },
		});

		prismaMock.plan.findUnique.mockResolvedValueOnce({
			id: 'plan_target_paystack',
			name: 'Target Pro',
			priceCents: 3000,
			autoRenew: true,
			recurringInterval: 'month',
			recurringIntervalCount: 1,
			tokenLimit: 500,
			supportsOrganizations: false,
			externalPriceId: null,
			externalPriceIds: JSON.stringify({ paystack: 'plan_ps_target' }),
		});

		providerMock.updateSubscriptionPlan.mockResolvedValueOnce({
			success: true,
			newExternalSubscriptionId: 'sub_ps_new',
			newPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
		});

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target_paystack' }),
		});

		const res = await POST(toNextRequest(req));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.pendingConfirmation).toBe(true);

		expect(prismaMock.subscription.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'sub_db_paystack_current' },
				data: expect.objectContaining({ status: 'CANCELLED' }),
			}),
		);

		expect(prismaMock.subscription.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					planId: 'plan_target_paystack',
					status: 'PENDING',
					externalSubscriptionId: 'sub_ps_new',
					prorationPendingSince: expect.any(Date),
				}),
			}),
		);

		const tokenBalanceCalls = prismaMock.user.update.mock.calls.filter(
			(call: unknown[]) => {
				const arg = call[0] as { data?: { tokenBalance?: unknown } };
				return arg?.data?.tokenBalance !== undefined;
			},
		);
		expect(tokenBalanceCalls).toHaveLength(0);
		expect(sendBillingNotification).not.toHaveBeenCalled();
	});

	it('maps Stripe card_declined error to 402', async () => {
		const stripeError = new Error('Failed to update subscription plan');
		(stripeError as MutableError).originalError = { code: 'card_declined', decline_code: 'insufficient_funds' };
		providerMock.updateSubscriptionPlan.mockRejectedValue(stripeError);

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target' }),
		});

		const res = await POST(toNextRequest(req));
		expect(res.status).toBe(402);
		const body = await res.json();
		expect(body.code).toBe('STRIPE_PAYMENT_FAILED');
		expect(body.error).toContain('insufficient_funds');
	});

	it('maps Stripe authentication_required error to 402', async () => {
		const stripeError = new Error('Failed to update subscription plan');
		(stripeError as MutableError).originalError = { code: 'authentication_required' };
		providerMock.updateSubscriptionPlan.mockRejectedValue(stripeError);

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target' }),
		});

		const res = await POST(toNextRequest(req));
		expect(res.status).toBe(402);
		const body = await res.json();
		expect(body.code).toBe('STRIPE_AUTHENTICATION_REQUIRED');
	});

	it('auto-schedules at cycle end when Razorpay "no captured payments" error occurs', async () => {
		providerMock.updateSubscriptionPlan.mockRejectedValue(
			new Error('RAZORPAY_NO_CAPTURED_PAYMENTS: The current invoice has no captured payment, so an immediate plan change cannot be processed.')
		);
		providerMock.scheduleSubscriptionPlanChange.mockResolvedValue({
			success: true,
			newPeriodEnd: new Date('2026-03-01T00:00:00Z'),
		});

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target' }),
		});

		const res = await POST(toNextRequest(req));
		// Falls back to schedule at cycle end
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.scheduled).toBe(true);
		expect(body.noCapturedPaymentsFallback).toBe(true);
		expect(providerMock.scheduleSubscriptionPlanChange).toHaveBeenCalled();
	});

	it('maps Razorpay cycle-not-started error to 409', async () => {
		providerMock.updateSubscriptionPlan.mockRejectedValue(
			new Error('RAZORPAY_CYCLE_NOT_STARTED: Your new billing cycle has not started yet. Please wait a few minutes and try again.')
		);

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target' }),
		});

		const res = await POST(toNextRequest(req));
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.code).toBe('RAZORPAY_CYCLE_NOT_STARTED');
		expect(body.error).toContain('billing cycle hasn\'t started yet');
	});

	it('Paystack cycle_end: marks DB cancelAtPeriodEnd BEFORE calling provider', async () => {
		// Track the order of calls
		const callOrder: string[] = [];

		prismaMock.subscription.update.mockImplementation(async () => {
			callOrder.push('db_update');
			return {};
		});

		const paystackProvider = {
			name: 'paystack',
			supportsFeature: vi.fn(() => true),
			scheduleSubscriptionPlanChange: vi.fn(async () => {
				callOrder.push('provider_call');
				return { success: true, newPeriodEnd: new Date('2026-03-01') };
			}),
		};

		paymentServiceMock.getProviderForRecord.mockReturnValue(paystackProvider);

		// Override user to have a Paystack customer ID
		prismaMock.user.findUnique.mockResolvedValue({
			id: 'user_1',
			externalCustomerId: 'cust_pstk_1',
			externalCustomerIds: JSON.stringify({ paystack: 'cust_pstk_1' }),
		});

		// Override subscription to use Paystack provider with cancelAtPeriodEnd = false
		prismaMock.subscription.findFirst.mockResolvedValue({
			id: 'sub_db_1',
			planId: 'plan_current',
			expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
			status: 'ACTIVE',
			externalSubscriptionId: 'sub_pstk_1',
			externalSubscriptionIds: JSON.stringify({ paystack: 'sub_pstk_1' }),
			paymentProvider: 'paystack',
			cancelAtPeriodEnd: false,
			plan: { id: 'plan_current', name: 'Current', priceCents: 1000, autoRenew: true },
		});

		// Override plan to have a Paystack price ID
		prismaMock.plan.findUnique.mockResolvedValue({
			id: 'plan_target',
			name: 'Target',
			priceCents: 2000,
			autoRenew: true,
			externalPriceId: null,
			externalPriceIds: JSON.stringify({ paystack: 'plan_pstk_target' }),
		});

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target', scheduleAt: 'cycle_end' }),
		});

		const res = await POST(toNextRequest(req));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.scheduled).toBe(true);

		// DB update must happen BEFORE the provider call to avoid webhook race.
		// A third db_update follows the provider call to persist the scheduledPlanId.
		expect(callOrder[0]).toBe('db_update');
		expect(callOrder[1]).toBe('provider_call');
		expect(callOrder).toContain('db_update');
		expect(callOrder).toContain('provider_call');

		// DB should have been updated with cancelAtPeriodEnd
		expect(prismaMock.subscription.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'sub_db_1' },
				data: expect.objectContaining({ cancelAtPeriodEnd: true }),
			}),
		);
	});

	it('GET returns local proration estimate with isEstimate=true when provider lacks proration', async () => {
		// Provider supports subscription_updates but NOT proration
		providerMock.supportsFeature.mockImplementation((f: string) => f === 'subscription_updates');

		const now = Date.now();
		const startedAt = new Date(now - 15 * 24 * 3600 * 1000); // 15 days ago
		const expiresAt = new Date(now + 15 * 24 * 3600 * 1000);  // 15 days from now

		prismaMock.subscription.findFirst.mockResolvedValue({
			id: 'sub_db_1',
			planId: 'plan_current',
			startedAt,
			expiresAt,
			status: 'ACTIVE',
			externalSubscriptionId: 'sub_rzp_1',
			externalSubscriptionIds: JSON.stringify({ razorpay: 'sub_rzp_1' }),
			paymentProvider: 'razorpay',
			plan: { id: 'plan_current', name: 'Basic', priceCents: 1000, autoRenew: true },
		});

		prismaMock.plan.findUnique.mockResolvedValue({
			id: 'plan_target',
			name: 'Pro',
			priceCents: 2000,
			autoRenew: true,
			externalPriceId: null,
			externalPriceIds: JSON.stringify({ razorpay: 'plan_rzp_pro' }),
		});

		const req = new NextRequest('http://localhost/api/subscription/proration?planId=plan_target');
		const res = await GET(req);
		const body = await res.json();
		expect(res.status).toBe(200);

		expect(body.prorationEnabled).toBe(true);
		expect(body.isEstimate).toBe(true);
		expect(body.supportsInlineSwitch).toBe(true);
		expect(body.currency).toBe('usd');
		expect(body.currentPeriodEnd).toBeTruthy();

		// ~50% of cycle remaining, so credit ≈ 500, charge ≈ 1000, amountDue ≈ 500
		expect(body.amountDue).toBeGreaterThan(0);
		expect(body.lineItems).toHaveLength(2);
		expect(body.lineItems[0].amount).toBeLessThan(0); // credit (negative)
		expect(body.lineItems[1].amount).toBeGreaterThan(0); // charge
		expect(body.currentPlan.name).toBe('Basic');
		expect(body.targetPlan.name).toBe('Pro');
		expect(body.isDowngrade).toBe(false);
		expect(body.downgradeScheduledAtCycleEnd).toBe(false);
	});

	it('GET returns isDowngrade=true for Razorpay downgrade (immediate switch supported)', async () => {
		// Provider supports subscription_updates but NOT proration
		providerMock.supportsFeature.mockImplementation((f: string) => f === 'subscription_updates');

		const now = Date.now();
		const startedAt = new Date(now - 15 * 24 * 3600 * 1000);
		const expiresAt = new Date(now + 15 * 24 * 3600 * 1000);

		// Current plan is more expensive -> downgrade scenario
		prismaMock.subscription.findFirst.mockResolvedValue({
			id: 'sub_db_1',
			planId: 'plan_current',
			startedAt,
			expiresAt,
			status: 'ACTIVE',
			externalSubscriptionId: 'sub_rzp_1',
			externalSubscriptionIds: JSON.stringify({ razorpay: 'sub_rzp_1' }),
			paymentProvider: 'razorpay',
			plan: { id: 'plan_current', name: 'Pro', priceCents: 2000, autoRenew: true },
		});

		prismaMock.plan.findUnique.mockResolvedValue({
			id: 'plan_target',
			name: 'Basic',
			priceCents: 1000,
			autoRenew: true,
			externalPriceId: null,
			externalPriceIds: JSON.stringify({ razorpay: 'plan_rzp_basic' }),
		});

		const req = new NextRequest('http://localhost/api/subscription/proration?planId=plan_target');
		const res = await GET(req);
		const body = await res.json();
		expect(res.status).toBe(200);

		expect(body.prorationEnabled).toBe(true);
		expect(body.isEstimate).toBe(true);
		expect(body.isDowngrade).toBe(true);
		expect(body.downgradeScheduledAtCycleEnd).toBe(false);
		// Razorpay supports immediate downgrades, so amountDue reflects proration
		expect(typeof body.amountDue).toBe('number');
		// Two proration line items (unused time credit + new plan charge)
		expect(body.lineItems).toHaveLength(2);
		expect(body.currentPlan.name).toBe('Pro');
		expect(body.targetPlan.name).toBe('Basic');
	});

	it('POST with downgradeScheduledAtCycleEnd=true goes directly to schedule', async () => {
		providerMock.supportsFeature.mockReturnValue(true);
		providerMock.scheduleSubscriptionPlanChange.mockResolvedValue({
			success: true,
			newPeriodEnd: new Date('2025-08-01'),
		});

		const req = new NextRequest('http://localhost/api/subscription/proration', {
			method: 'POST',
			body: JSON.stringify({ planId: 'plan_target', downgradeScheduledAtCycleEnd: true }),
			headers: { 'Content-Type': 'application/json' },
		});
		const res = await POST(req);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.scheduled).toBe(true);
		// Should call scheduleSubscriptionPlanChange, NOT updateSubscriptionPlan
		expect(providerMock.scheduleSubscriptionPlanChange).toHaveBeenCalled();
		expect(providerMock.updateSubscriptionPlan).not.toHaveBeenCalled();
	});

	it('immediate org plan switch resets org token bucket instead of user balance', async () => {
		vi.mocked(shouldResetPaidTokensOnRenewalForPlanAutoRenew).mockResolvedValueOnce(true);

		prismaMock.subscription.findFirst.mockResolvedValueOnce({
			id: 'sub_db_org',
			planId: 'plan_current',
			expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
			status: 'ACTIVE',
			externalSubscriptionId: 'sub_rzp_org',
			externalSubscriptionIds: JSON.stringify({ razorpay: 'sub_rzp_org' }),
			paymentProvider: 'razorpay',
			organizationId: 'org_team_1',
			plan: { id: 'plan_current', name: 'Team Basic', priceCents: 2000, autoRenew: true, recurringInterval: 'month', recurringIntervalCount: 1, tokenLimit: 100 },
		});

		prismaMock.plan.findUnique.mockResolvedValueOnce({
			id: 'plan_target_org',
			name: 'Team Pro',
			priceCents: 5000,
			autoRenew: true,
			recurringInterval: 'month',
			recurringIntervalCount: 1,
			tokenLimit: 500,
			organizationSeatLimit: 10,
			organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
			supportsOrganizations: true,
			externalPriceId: null,
			externalPriceIds: JSON.stringify({ razorpay: 'plan_rzp_team_pro' }),
		});

		prismaMock.organization.findUnique.mockResolvedValueOnce({
			id: 'org_team_1',
			providerOrganizationId: null,
			planId: 'plan_current',
			seatLimit: 5,
			tokenPoolStrategy: 'SHARED_FOR_ORG',
		});

		providerMock.updateSubscriptionPlan.mockResolvedValue({
			success: true,
			newPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
			invoiceId: 'in_org_switch',
			amountPaid: 3000,
		});

		const req = new Request('http://localhost/api/subscription/proration', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId: 'plan_target_org' }),
		});

		const res = await POST(toNextRequest(req));
		expect(res.status).toBe(200);

		// Org bucket should be reset, NOT user balance.
		expect(resetOrganizationSharedTokens).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: 'org_team_1' }),
		);
		expect(prismaMock.organization.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'org_team_1' },
				data: { tokenBalance: 500 },
			}),
		);
		// user.update should only be called for paymentsCount, not token balance
		const userUpdateCalls = prismaMock.user.update.mock.calls;
		const tokenBalanceCalls = userUpdateCalls.filter(
			(call: unknown[]) => {
				const arg = call[0] as { data?: { tokenBalance?: unknown } };
				return arg?.data?.tokenBalance !== undefined;
			},
		);
		expect(tokenBalanceCalls).toHaveLength(0);
	});
});
