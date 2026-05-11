import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	subscription: {
		findFirst: vi.fn(),
		findUnique: vi.fn(),
	},
	payment: {
		create: vi.fn(),
		findFirst: vi.fn(),
		findMany: vi.fn(),
		update: vi.fn(),
	},
	user: {
		update: vi.fn(),
		findUnique: vi.fn(),
	},
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../lib/teams', () => ({ creditOrganizationSharedTokens: vi.fn(async () => undefined) }));
vi.mock('../lib/payment/registry', () => ({ getActiveCurrencyAsync: vi.fn(async () => 'ngn') }));
vi.mock('../lib/utils/currency', () => ({ formatCurrency: vi.fn(() => '₦100.00') }));
vi.mock('../lib/notifications', () => ({
	sendBillingNotification: vi.fn(async () => ({ ok: true })),
	sendAdminNotificationEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../lib/settings', () => ({ getDefaultTokenLabel: vi.fn(async () => 'tokens') }));
vi.mock('../lib/payments', () => ({ updateSubscriptionLastPaymentAmount: vi.fn(async () => undefined) }));
vi.mock('../lib/paidTokens', () => ({ shouldClearPaidTokensOnRenewal: vi.fn(async () => true) }));

import { sendBillingNotification } from '../lib/notifications';
import { recordPendingSubscriptionPaymentFallback } from '../lib/payment/subscription-payment-linking';
import type { StandardizedCheckoutSession } from '../lib/payment/types';

describe('Paystack pending subscription activation email', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.payment.findFirst.mockResolvedValue(null);
		prismaMock.payment.findMany.mockResolvedValue([]);
		prismaMock.user.findUnique.mockResolvedValue({ email: 'buyer@example.com', name: 'Buyer' });
	});

	it('includes the linked subscription expiry date in the activation email', async () => {
		const startedAt = new Date('2026-03-21T10:00:00.000Z');
		const expiresAt = new Date('2026-04-20T10:00:00.000Z');

		prismaMock.subscription.findUnique.mockResolvedValue({
			startedAt,
			expiresAt,
		});

		const session: StandardizedCheckoutSession = {
			id: 'txn_paystack_123',
			mode: 'subscription',
			subscriptionId: 'SUB_paystack_123',
			userId: 'user_123',
			userEmail: 'buyer@example.com',
			customerId: 'CUS_123',
			amountTotal: 10000,
			currency: 'NGN',
			paymentStatus: 'paid',
			lineItems: [{ priceId: 'PLN_team_24h', quantity: 1 }],
		};

		await recordPendingSubscriptionPaymentFallback({
			session,
			userId: 'user_123',
			plan: {
				id: 'plan_team_24h',
				name: '24 Hour Team',
				tokenLimit: 0,
				tokenName: null,
				supportsOrganizations: true,
			},
			providerKey: 'paystack',
			finalPaymentIntent: '5956644355',
			amountCents: 10000,
			mergeIdMap: (_existing: unknown, _key: string, value?: string | null) =>
				value ? JSON.stringify({ paystack: value }) : null,
			consumeCouponRedemptionFromMetadata: vi.fn(async () => undefined),
			findRecentCancelledRecurringSubscription: vi.fn(async () => null),
			resolveOrganizationContext: vi.fn(async () => null),
			syncOrganizationEligibilityForUser: vi.fn(async () => undefined),
			restoreSuspendedOrganizationById: vi.fn(async () => undefined),
			findSubscriptionByProviderId: vi.fn(async () => ({
				id: 'sub_db_123',
				userId: 'user_123',
				planId: 'plan_team_24h',
			})),
			getPendingSubscriptionLookbackDate: vi.fn(() => new Date('2026-03-21T00:00:00.000Z')),
		});

		expect(sendBillingNotification).toHaveBeenCalledWith(
			expect.objectContaining({
				templateKey: 'subscription_activated',
				variables: expect.objectContaining({
					startedAt: 'March 21, 2026',
					expiresAt: 'April 20, 2026',
				}),
			}),
		);
	});
});