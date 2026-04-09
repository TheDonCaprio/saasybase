import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
}));

const creditOrganizationSharedTokensMock = vi.hoisted(() => vi.fn(async () => undefined));
const creditAllocatedPerMemberTokensMock = vi.hoisted(() => vi.fn(async () => undefined));
const resetAllocatedPerMemberTokensMock = vi.hoisted(() => vi.fn(async () => undefined));
const updateSubscriptionLastPaymentAmountMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/teams', () => ({
  creditOrganizationSharedTokens: creditOrganizationSharedTokensMock,
  creditAllocatedPerMemberTokens: creditAllocatedPerMemberTokensMock,
  resetAllocatedPerMemberTokens: resetAllocatedPerMemberTokensMock,
}));
vi.mock('../lib/payments', () => ({ updateSubscriptionLastPaymentAmount: updateSubscriptionLastPaymentAmountMock }));
vi.mock('../lib/payment/invoice-payment-state-updates', () => ({ applyInvoicePaymentStateUpdates: vi.fn(async ({ dbSub }) => dbSub) }));
vi.mock('../lib/payment/invoice-payment-expiry-refresh', () => ({ refreshInvoicePaymentSubscriptionExpiry: vi.fn(async ({ dbSub }) => ({ dbSub, refreshedExpiresAt: null })) }));
vi.mock('../lib/payment/invoice-payment-notifications', () => ({ processInvoicePaidNotifications: vi.fn(async () => ({ shouldReturnEarly: false })) }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import {
  resolveInvoicePaidProcessingContext,
  recordInvoicePaymentAndApplyTokens,
} from '../lib/payment/invoice-payment-recording';
import type { StandardizedInvoice } from '../lib/payment/types';

function createInvoice(overrides: Partial<StandardizedInvoice>): StandardizedInvoice {
  return {
    id: 'inv_test',
    amountPaid: 0,
    amountDue: 0,
    amountDiscount: 0,
    subtotal: 0,
    total: 0,
    currency: 'usd',
    status: 'paid',
    ...overrides,
  };
}

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
      invoice: createInvoice({
        id: 'inv_1',
        subscriptionId: 'sub_provider_1',
        paymentIntentId: 'pi_1',
        billingReason: 'subscription_create',
        metadata: {
          activeOrganizationId: 'org_local_1',
        },
      }),
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
    prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
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
      type TransactionClient = typeof tx;
      return (cb as (tx: TransactionClient) => unknown)(tx);
    });

    const result = await recordInvoicePaymentAndApplyTokens({
      dbSub: {
        id: 'sub_db_1',
        userId: 'user_1',
        planId: 'plan_team',
        plan: { tokenLimit: 100, supportsOrganizations: true },
      },
      invoice: createInvoice({
        id: 'inv_1',
        amountPaid: 5000,
        subtotal: 5000,
        amountDiscount: 0,
        billingReason: 'subscription_create',
      }),
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
    prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
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
      type TransactionClient = typeof tx;
      return (cb as (tx: TransactionClient) => unknown)(tx);
    });

    const resolveOrganizationContext = vi.fn(async () => null);
    const preflight = await resolveInvoicePaidProcessingContext({
      invoice: createInvoice({
        id: 'inv_renew_1',
        subscriptionId: 'sub_provider_1',
        paymentIntentId: 'pi_renew_1',
        billingReason: 'subscription_recurring',
        metadata: {},
      }),
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
      invoice: createInvoice({
        id: 'inv_renew_1',
        amountPaid: 5000,
        subtotal: 5000,
        amountDiscount: 0,
        billingReason: 'subscription_recurring',
      }),
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

  it('increments per-member balances on renewal when the team plan uses allocated-per-member tokens', async () => {
    prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
      const tx = {
        payment: {
          findUnique: vi.fn(async () => null),
          count: vi.fn(async () => 1),
          create: vi.fn(async (args) => ({ id: 'pay_alloc_renew_1', externalPaymentId: args.data.externalPaymentId })),
        },
        user: {
          update: vi.fn(async () => undefined),
        },
        organization: {
          update: vi.fn(async () => undefined),
        },
      };
      type TransactionClient = typeof tx;
      return (cb as (tx: TransactionClient) => unknown)(tx);
    });

    await recordInvoicePaymentAndApplyTokens({
      dbSub: {
        id: 'sub_db_alloc_1',
        userId: 'user_1',
        planId: 'plan_team_alloc',
        plan: { tokenLimit: 75, supportsOrganizations: true, organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER' },
      },
      invoice: createInvoice({
        id: 'inv_alloc_renew_1',
        amountPaid: 5000,
        subtotal: 5000,
        amountDiscount: 0,
        billingReason: 'subscription_recurring',
      }),
      paymentIntentId: 'pi_alloc_renew_1',
      subscriptionId: 'sub_provider_alloc_1',
      resolvedOrganizationId: 'org_alloc_1',
      shouldResetTokensOnRenewal: false,
      providerKey: 'stripe',
      mergeIdMap: (_existing: unknown, _key: string, value?: string | null) => value ?? null,
    });

    expect(creditAllocatedPerMemberTokensMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_alloc_1',
        amount: 75,
      })
    );
    expect(creditOrganizationSharedTokensMock).not.toHaveBeenCalled();
  });

  it('still follows renewal policy before expiry-grace cleanup has run for allocated-per-member recurring plans', async () => {
    prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
      const tx = {
        payment: {
          findUnique: vi.fn(async () => null),
          count: vi.fn(async () => 1),
          create: vi.fn(async (args) => ({ id: 'pay_alloc_grace_1', externalPaymentId: args.data.externalPaymentId })),
        },
        user: {
          update: vi.fn(async () => undefined),
        },
        organization: {
          update: vi.fn(async () => undefined),
        },
      };
      type TransactionClient = typeof tx;
      return (cb as (tx: TransactionClient) => unknown)(tx);
    });

    // This locks down the current semantics: even if expiry cleanup has not run yet
    // because the workspace is still inside the natural-expiry grace window, the
    // recurring renewal path uses only the renewal policy for token handling.
    await recordInvoicePaymentAndApplyTokens({
      dbSub: {
        id: 'sub_db_alloc_grace_1',
        userId: 'user_1',
        planId: 'plan_team_alloc',
        plan: { tokenLimit: 75, supportsOrganizations: true, organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER' },
      },
      invoice: createInvoice({
        id: 'inv_alloc_grace_1',
        amountPaid: 5000,
        subtotal: 5000,
        amountDiscount: 0,
        billingReason: 'subscription_recurring',
      }),
      paymentIntentId: 'pi_alloc_grace_1',
      subscriptionId: 'sub_provider_alloc_grace_1',
      resolvedOrganizationId: 'org_alloc_1',
      shouldResetTokensOnRenewal: false,
      providerKey: 'stripe',
      mergeIdMap: (_existing: unknown, _key: string, value?: string | null) => value ?? null,
    });

    expect(creditAllocatedPerMemberTokensMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_alloc_1',
        amount: 75,
      })
    );
    expect(resetAllocatedPerMemberTokensMock).not.toHaveBeenCalled();
    expect(creditOrganizationSharedTokensMock).not.toHaveBeenCalled();
  });

  it('resets per-member balances on renewal when reset-on-renewal is enabled for allocated-per-member plans', async () => {
    prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
      const tx = {
        payment: {
          findUnique: vi.fn(async () => null),
          count: vi.fn(async () => 1),
          create: vi.fn(async (args) => ({ id: 'pay_alloc_reset_1', externalPaymentId: args.data.externalPaymentId })),
        },
        user: {
          update: vi.fn(async () => undefined),
        },
        organization: {
          update: vi.fn(async () => undefined),
        },
      };
      type TransactionClient = typeof tx;
      return (cb as (tx: TransactionClient) => unknown)(tx);
    });

    await recordInvoicePaymentAndApplyTokens({
      dbSub: {
        id: 'sub_db_alloc_reset_1',
        userId: 'user_1',
        planId: 'plan_team_alloc',
        plan: { tokenLimit: 75, supportsOrganizations: true, organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER' },
      },
      invoice: createInvoice({
        id: 'inv_alloc_reset_1',
        amountPaid: 5000,
        subtotal: 5000,
        amountDiscount: 0,
        billingReason: 'subscription_recurring',
      }),
      paymentIntentId: 'pi_alloc_reset_1',
      subscriptionId: 'sub_provider_alloc_reset_1',
      resolvedOrganizationId: 'org_alloc_1',
      shouldResetTokensOnRenewal: true,
      providerKey: 'stripe',
      mergeIdMap: (_existing: unknown, _key: string, value?: string | null) => value ?? null,
    });

    expect(resetAllocatedPerMemberTokensMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_alloc_1',
        amount: 75,
      })
    );
    expect(creditOrganizationSharedTokensMock).not.toHaveBeenCalled();
  });
});
