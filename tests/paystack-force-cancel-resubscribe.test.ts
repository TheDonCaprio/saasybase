import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => {
	const tx = {
		payment: { create: vi.fn() },
		user: { update: vi.fn() },
		organization: { update: vi.fn() },
	};
	type TransactionClient = typeof tx;

	return {
		__tx: tx,
		subscription: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
		},
		payment: {
			findFirst: vi.fn(),
		},
		user: {
			update: vi.fn(),
		},
		$transaction: vi.fn(async <T>(fn: (client: TransactionClient) => Promise<T>) => fn(tx)),
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

describe('Paystack force-cancel → re-subscribe activation email', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('uses subscription_activated template when activation charge follows a force-cancelled subscription', async () => {
		const now = Date.now();

		// After force-cancel, a new PENDING subscription is pre-created for the
		// re-subscribe flow.  The old CANCELLED row should NOT be matched because
		// the tightened query now prefers PENDING rows.
		prismaMock.subscription.findFirst
			// First call: PENDING query — returns the freshly pre-created sub
			.mockResolvedValueOnce({
				id: 'sub_db_fresh',
				organizationId: null,
				externalSubscriptionId: 'SUB_paystack_fresh',
				status: 'PENDING',
				expiresAt: new Date(now + 10 * 60 * 1000),
			});

		// No succeeded payments for the new sub → treated as activation.
		prismaMock.payment.findFirst.mockResolvedValue(null);

		// The refreshed sub lookup for the notification section.
		prismaMock.subscription.findUnique.mockResolvedValue({
			expiresAt: new Date(now + 31 * 24 * 60 * 60 * 1000),
		});

		const session: StandardizedCheckoutSession = {
			id: 'txn_resubscribe_1',
			mode: 'subscription',
			subscriptionId: undefined,
			userId: 'user_force_cancel',
			userEmail: 'test@example.com',
			customerId: 'CUS_456',
			amountTotal: 5000,
			currency: 'NGN',
			paymentStatus: 'paid',
			lineItems: [{ priceId: 'PLN_monthly', quantity: 1 }],
		};

		const didHandle = await tryRecordPaystackRenewalStyleCharge({
			session,
			userId: 'user_force_cancel',
			plan: {
				id: 'plan_pro',
				name: 'Pro',
				autoRenew: true,
				supportsOrganizations: false,
				tokenLimit: 100,
				durationHours: 24 * 30,
			},
			providerKey: 'paystack',
			finalPaymentIntent: 'txn_resubscribe_1',
			amountCents: 5000,
			mergeIdMap: (_existing: unknown, _key: string, value?: string | null) =>
				value ? JSON.stringify({ paystack: value }) : null,
			resolveOrganizationContext: vi.fn(async () => null),
			refreshSubscriptionExpiryFromProvider: vi.fn(async () => ({
				refreshedPeriodEnd: new Date(now + 31 * 24 * 60 * 60 * 1000),
			})),
			markSubscriptionActive: vi.fn(async () => undefined),
			findRecentNotificationByExactMessage: vi.fn(async () => null),
			consumeCouponRedemptionFromMetadata: vi.fn(async () => undefined),
		});

		expect(didHandle).toBe(true);

		// The billing notification should use the activation template, NOT renewal.
		expect(sendBillingNotification).toHaveBeenCalledWith(
			expect.objectContaining({
				title: 'Subscription Activated',
				templateKey: 'subscription_activated',
			}),
		);

		// Admin notification should flag it as a new purchase, not a renewal.
		expect(sendAdminNotificationEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				title: 'Subscription activated',
				alertType: 'new_purchase',
			}),
		);
	});

	it('still uses subscription_renewed template for genuine renewals', async () => {
		const now = Date.now();

		// First PENDING query — no pending subs.
		prismaMock.subscription.findFirst
			.mockResolvedValueOnce(null)
			// Second query (ACTIVE|EXPIRED fallback) — an active sub with prior payments.
			.mockResolvedValueOnce({
				id: 'sub_db_active',
				organizationId: null,
				externalSubscriptionId: 'SUB_paystack_active',
				status: 'ACTIVE',
				expiresAt: new Date(now + 5 * 24 * 60 * 60 * 1000),
			});

		// Has a prior succeeded payment → treated as renewal.
		prismaMock.payment.findFirst.mockResolvedValue({ id: 'pay_prev' });

		prismaMock.subscription.findUnique.mockResolvedValue({
			expiresAt: new Date(now + 31 * 24 * 60 * 60 * 1000),
		});

		const session: StandardizedCheckoutSession = {
			id: 'txn_renewal_1',
			mode: 'subscription',
			subscriptionId: undefined,
			userId: 'user_renewal',
			userEmail: 'renewal@example.com',
			customerId: 'CUS_789',
			amountTotal: 5000,
			currency: 'NGN',
			paymentStatus: 'paid',
			lineItems: [{ priceId: 'PLN_monthly', quantity: 1 }],
		};

		const didHandle = await tryRecordPaystackRenewalStyleCharge({
			session,
			userId: 'user_renewal',
			plan: {
				id: 'plan_pro',
				name: 'Pro',
				autoRenew: true,
				supportsOrganizations: false,
				tokenLimit: 100,
				durationHours: 24 * 30,
			},
			providerKey: 'paystack',
			finalPaymentIntent: 'txn_renewal_1',
			amountCents: 5000,
			mergeIdMap: (_existing: unknown, _key: string, value?: string | null) =>
				value ? JSON.stringify({ paystack: value }) : null,
			resolveOrganizationContext: vi.fn(async () => null),
			refreshSubscriptionExpiryFromProvider: vi.fn(async () => ({
				refreshedPeriodEnd: new Date(now + 31 * 24 * 60 * 60 * 1000),
			})),
			markSubscriptionActive: vi.fn(async () => undefined),
			findRecentNotificationByExactMessage: vi.fn(async () => null),
			consumeCouponRedemptionFromMetadata: vi.fn(async () => undefined),
		});

		expect(didHandle).toBe(true);

		expect(sendBillingNotification).toHaveBeenCalledWith(
			expect.objectContaining({
				title: 'Subscription Renewed',
				templateKey: 'subscription_renewed',
			}),
		);

		expect(sendAdminNotificationEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				title: 'Subscription renewed',
				alertType: 'renewal',
			}),
		);
	});
});
