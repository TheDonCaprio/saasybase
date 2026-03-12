import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
}));

const creditOrganizationSharedTokensMock = vi.hoisted(() => vi.fn(async () => undefined));
const updateSubscriptionLastPaymentAmountMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/teams', () => ({ creditOrganizationSharedTokens: creditOrganizationSharedTokensMock }));
vi.mock('../lib/payments', () => ({ updateSubscriptionLastPaymentAmount: updateSubscriptionLastPaymentAmountMock }));
vi.mock('../lib/payment/invoice-payment-state-updates', () => ({ applyInvoicePaymentStateUpdates: vi.fn(async ({ dbSub }) => dbSub) }));
vi.mock('../lib/payment/invoice-payment-expiry-refresh', () => ({ refreshInvoicePaymentSubscriptionExpiry: vi.fn(async ({ dbSub }) => ({ dbSub, refreshedExpiresAt: null })) }));
vi.mock('../lib/payment/invoice-payment-notifications', () => ({ processInvoicePaidNotifications: vi.fn(async () => ({ shouldReturnEarly: false })) }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import {
  resolveInvoicePaidProcessingContext,
  recordInvoicePaymentAndApplyTokens,
} from '../lib/payment/invoice-payment-recording';

describe('invoice payment org resolution for NextAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves active organization from local organization metadata key', async () => {
    const resolveOrganizationContext = vi.fn(async (_userId: string, orgRef?: string | null) => ({
      role: 'OWNER' as const,
      organization: { id: orgRef || 'org_fallback' },
    }));

    const result = await resolveInvoicePaidProcessingContext({
      invoice: {
        id: 'inv_1',
        subscriptionId: 'sub_provider_1',
        paymentIntentId: 'pi_1',
        billingReason: 'subscription_create',
        metadata: {
          activeOrganizationId: 'org_local_1',
        },
      } as any,
      findSubscriptionByProviderId: vi.fn(async () => ({
        id: 'sub_db_1',
        userId: 'user_1',
        planId: 'plan_team',
        organizationId: null,
        plan: { autoRenew: true, tokenLimit: 100, supportsOrganizations: true },
      })),
      ensureProviderBackedSubscription: vi.fn(async () => null),
      resolveOrganizationContext,
      shouldClearPaidTokensOnRenewal: vi.fn(async () => true),
    });

    expect(resolveOrganizationContext).toHaveBeenCalledWith('user_1', 'org_local_1');
    expect(result.shouldSkip).toBe(false);
    expect(result.resolvedOrganizationId).toBe('org_local_1');
  });

  it('credits shared org tokens for initial invoice payments when a local org is resolved', async () => {
    prismaMock.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        payment: {
          findUnique: vi.fn(async () => null),
          count: vi.fn(async () => 0),
          create: vi.fn(async (args) => ({ id: 'pay_1', externalPaymentId: args.data.externalPaymentId })),
        },
        user: {
          update: vi.fn(async () => undefined),
        },
        organization: {
          update: vi.fn(async () => undefined),
        },
      };
      return cb(tx);
    });

    const result = await recordInvoicePaymentAndApplyTokens({
      dbSub: {
        id: 'sub_db_1',
        userId: 'user_1',
        planId: 'plan_team',
        plan: { tokenLimit: 100, supportsOrganizations: true },
      },
      invoice: {
        id: 'inv_1',
        amountPaid: 5000,
        subtotal: 5000,
        amountDiscount: 0,
        billingReason: 'subscription_create',
      } as any,
      paymentIntentId: 'pi_1',
      subscriptionId: 'sub_provider_1',
      resolvedOrganizationId: 'org_local_1',
      shouldResetTokensOnRenewal: false,
      providerKey: 'stripe',
      mergeIdMap: (_existing: unknown, _key: string, value?: string | null) => value ?? null,
    });

    expect(result.created).toBe(true);
    expect(creditOrganizationSharedTokensMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_local_1',
        amount: 100,
      })
    );
  });

  it('credits the org bucket on renewal via subscription.organizationId after provisioning when renewal metadata has no org id', async () => {
    prismaMock.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        payment: {
          findUnique: vi.fn(async () => null),
          count: vi.fn(async () => 1),
          create: vi.fn(async (args) => ({ id: 'pay_renew_1', externalPaymentId: args.data.externalPaymentId })),
        },
        user: {
          update: vi.fn(async () => undefined),
        },
        organization: {
          update: vi.fn(async () => undefined),
        },
      };
      return cb(tx);
    });

    const resolveOrganizationContext = vi.fn(async () => null);
    const preflight = await resolveInvoicePaidProcessingContext({
      invoice: {
        id: 'inv_renew_1',
        subscriptionId: 'sub_provider_1',
        paymentIntentId: 'pi_renew_1',
        billingReason: 'subscription_recurring',
        metadata: {},
      } as any,
      findSubscriptionByProviderId: vi.fn(async () => ({
        id: 'sub_db_1',
        userId: 'user_1',
        planId: 'plan_team',
        organizationId: 'org_after_provision',
        plan: { autoRenew: true, tokenLimit: 100, supportsOrganizations: true },
      })),
      ensureProviderBackedSubscription: vi.fn(async () => null),
      resolveOrganizationContext,
      shouldClearPaidTokensOnRenewal: vi.fn(async () => false),
    });

    expect(preflight.shouldSkip).toBe(false);
    expect(preflight.resolvedOrganizationId).toBe('org_after_provision');
    expect(resolveOrganizationContext).toHaveBeenCalledWith('user_1', null);

    const result = await recordInvoicePaymentAndApplyTokens({
      dbSub: {
        id: 'sub_db_1',
        userId: 'user_1',
        planId: 'plan_team',
        plan: { tokenLimit: 100, supportsOrganizations: true },
      },
      invoice: {
        id: 'inv_renew_1',
        amountPaid: 5000,
        subtotal: 5000,
        amountDiscount: 0,
        billingReason: 'subscription_recurring',
      } as any,
      paymentIntentId: 'pi_renew_1',
      subscriptionId: 'sub_provider_1',
      resolvedOrganizationId: preflight.resolvedOrganizationId ?? null,
      shouldResetTokensOnRenewal: false,
      providerKey: 'paddle',
      mergeIdMap: (_existing: unknown, _key: string, value?: string | null) => value ?? null,
    });

    expect(result.created).toBe(true);
    expect(creditOrganizationSharedTokensMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_after_provision',
        amount: 100,
      })
    );
  });
});
