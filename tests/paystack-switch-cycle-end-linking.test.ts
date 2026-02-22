import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => {
	const tx = {
		payment: { create: vi.fn() },
		user: { update: vi.fn() },
		organization: { update: vi.fn() },
	};

	return {
		__tx: tx,
		subscription: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
		},
		payment: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
		},
		user: {
			update: vi.fn(),
			findUnique: vi.fn(),
		},
		paymentAuthorization: {
			findFirst: vi.fn(),
		},
		$transaction: vi.fn(async (fn: any) => fn(tx)),
	};
});

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../lib/payments', () => ({ updateSubscriptionLastPaymentAmount: vi.fn(async () => undefined) }));
vi.mock('../lib/paidTokens', () => ({ shouldClearPaidTokensOnRenewal: vi.fn(async () => true) }));
vi.mock('../lib/teams', () => ({ creditOrganizationSharedTokens: vi.fn(async () => undefined) }));
vi.mock('../lib/payment/registry', () => ({ getActiveCurrencyAsync: vi.fn(async () => 'usd') }));
vi.mock('../lib/utils/currency', () => ({ formatCurrency: vi.fn(() => '$0.00') }));
vi.mock('../lib/notifications', () => ({
	sendBillingNotification: vi.fn(async () => ({ ok: true })),
	sendAdminNotificationEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../lib/settings', () => ({ getDefaultTokenLabel: vi.fn(async () => 'tokens') }));

import { tryRecordPaystackRenewalStyleCharge } from '../lib/payment/subscription-payment-linking';
import type { StandardizedCheckoutSession } from '../lib/payment/types';
import { sendBillingNotification, sendAdminNotificationEmail } from '../lib/notifications';

describe('Paystack switch-at-cycle-end payment linking', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('records the first charge for a pre-created unpaid subscription as SUCCEEDED', async () => {
		const now = Date.now();
		prismaMock.subscription.findFirst.mockResolvedValue({
			id: 'sub_db_new',
			organizationId: null,
			externalSubscriptionId: 'SUB_paystack_new',
			status: 'PENDING',
			expiresAt: new Date(now + 10 * 60 * 1000), // within activation window
		});

		// No succeeded payments yet for the subscription.
		prismaMock.payment.findFirst.mockResolvedValue(null);

		const session: StandardizedCheckoutSession = {
			id: 'txn_ref_1',
			mode: 'subscription',
			subscriptionId: undefined,
			userId: 'user_1',
			userEmail: 'test@example.com',
			customerId: 'CUS_123',
			amountTotal: 5000,
			currency: 'NGN',
			paymentStatus: 'paid',
			lineItems: [{ priceId: 'PLN_monthly', quantity: 1 }],
		};

		const refreshSubscriptionExpiryFromProvider = vi.fn(async () => ({
			refreshedPeriodEnd: new Date(now + 31 * 24 * 60 * 60 * 1000),
		}));
		const markSubscriptionActive = vi.fn(async () => undefined);

		const didHandle = await tryRecordPaystackRenewalStyleCharge({
			session,
			userId: 'user_1',
			plan: {
				id: 'plan_new',
				name: 'Pro',
				autoRenew: true,
				supportsOrganizations: false,
				tokenLimit: 0,
				durationHours: 24 * 30,
			},
			providerKey: 'paystack',
			finalPaymentIntent: 'txn_ref_1',
			amountCents: 5000,
			mergeIdMap: (_existing: unknown, _key: string, value?: string | null) => (value ? JSON.stringify({ paystack: value }) : null),
			resolveOrganizationContext: vi.fn(async () => null),
			refreshSubscriptionExpiryFromProvider,
			markSubscriptionActive,
			findRecentNotificationByExactMessage: vi.fn(async () => null),
			consumeCouponRedemptionFromMetadata: vi.fn(async () => undefined),
		});

		expect(didHandle).toBe(true);
		expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
		expect(prismaMock.__tx.payment.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					subscriptionId: 'sub_db_new',
					status: 'SUCCEEDED',
					externalPaymentId: 'txn_ref_1',
					paymentProvider: 'paystack',
				}),
			}),
		);

		expect(refreshSubscriptionExpiryFromProvider).toHaveBeenCalledWith(
			expect.objectContaining({
				dbSubscriptionId: 'sub_db_new',
				providerSubscriptionId: 'SUB_paystack_new',
			}),
		);
		expect(markSubscriptionActive).toHaveBeenCalledWith('sub_db_new', expect.any(Date));
		expect(sendBillingNotification).toHaveBeenCalledWith(
			expect.objectContaining({ title: 'Subscription Activated' }),
		);
		expect(sendAdminNotificationEmail).toHaveBeenCalled();
	});

	it('does not treat unrelated older unpaid subscriptions as activation charges', async () => {
		prismaMock.subscription.findFirst.mockResolvedValue({
			id: 'sub_db_old',
			organizationId: null,
			externalSubscriptionId: 'SUB_paystack_old',
			status: 'PENDING',
			expiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // outside activation window
		});
		prismaMock.payment.findFirst.mockResolvedValue(null);

		const session: StandardizedCheckoutSession = {
			id: 'txn_ref_2',
			mode: 'subscription',
			userId: 'user_1',
			userEmail: 'test@example.com',
			customerId: 'CUS_123',
			amountTotal: 5000,
			currency: 'NGN',
			paymentStatus: 'paid',
			lineItems: [{ priceId: 'PLN_monthly', quantity: 1 }],
		};

		const didHandle = await tryRecordPaystackRenewalStyleCharge({
			session,
			userId: 'user_1',
			plan: {
				id: 'plan_new',
				name: 'Pro',
				autoRenew: true,
				supportsOrganizations: false,
				tokenLimit: 0,
				durationHours: 24 * 30,
			},
			providerKey: 'paystack',
			finalPaymentIntent: 'txn_ref_2',
			amountCents: 5000,
			mergeIdMap: () => null,
			resolveOrganizationContext: vi.fn(async () => null),
			refreshSubscriptionExpiryFromProvider: vi.fn(async () => ({ refreshedPeriodEnd: null })),
			markSubscriptionActive: vi.fn(async () => undefined),
			findRecentNotificationByExactMessage: vi.fn(async () => null),
			consumeCouponRedemptionFromMetadata: vi.fn(async () => undefined),
		});

		expect(didHandle).toBe(false);
		expect(prismaMock.$transaction).not.toHaveBeenCalled();
	});
});
