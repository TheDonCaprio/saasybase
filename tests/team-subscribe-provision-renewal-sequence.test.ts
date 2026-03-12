import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const basePlan = {
    id: 'plan_team',
    name: 'Team',
    autoRenew: true,
    tokenLimit: 100,
    supportsOrganizations: true,
    organizationSeatLimit: 5,
    organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
  };

  return {
    plan: basePlan,
    user: null as null | Record<string, unknown>,
    organization: null as null | Record<string, unknown>,
    subscriptions: [] as Array<Record<string, unknown>>,
    payments: [] as Array<Record<string, unknown>>,
    reset() {
      this.user = {
        id: 'user_1',
        name: 'Owner',
        email: 'owner@example.com',
        tokenBalance: 0,
        paymentsCount: 0,
        externalCustomerId: null,
        externalCustomerIds: null,
        paymentProvider: null,
      };
      this.organization = null;
      this.subscriptions = [];
      this.payments = [];
    },
  };
});

const prismaMock = vi.hoisted(() => {
  const findMatchingSubscription = (where: Record<string, any>) => {
    return state.subscriptions
      .filter((subscription) => {
        const planWhere = where.plan as Record<string, unknown> | undefined;
        const subscriptionPlan = subscription.plan as Record<string, unknown> | undefined;
        if (where.userId && subscription.userId !== where.userId) return false;
        if (where.planId && subscription.planId !== where.planId) return false;
        if (where.organizationId === null && subscription.organizationId !== null) return false;
        if (where.organizationId?.in && !where.organizationId.in.includes(subscription.organizationId)) return false;
        if (where.id?.in && !where.id.in.includes(subscription.id)) return false;
        if (where.externalSubscriptionId && subscription.externalSubscriptionId !== where.externalSubscriptionId) return false;
        if (where.paymentProvider && subscription.paymentProvider !== where.paymentProvider) return false;
        if (where.status) {
          if (typeof where.status === 'string' && subscription.status !== where.status) return false;
          if (where.status.in && !where.status.in.includes(subscription.status)) return false;
          if (where.status.not && subscription.status === where.status.not) return false;
        }
        if (where.expiresAt?.gt && !(new Date(String(subscription.expiresAt)) > where.expiresAt.gt)) return false;
        if (where.expiresAt?.gte && !(new Date(String(subscription.expiresAt)) >= where.expiresAt.gte)) return false;
        if (planWhere?.['supportsOrganizations'] === true && subscriptionPlan?.['supportsOrganizations'] !== true) return false;
        return true;
      })
      .sort((a, b) => new Date(String(b.expiresAt)).getTime() - new Date(String(a.expiresAt)).getTime());
  };

  const tx = {
    payment: {
      findUnique: vi.fn(async ({ where }: any) => state.payments.find((payment) => payment.externalPaymentId === where.externalPaymentId) ?? null),
      count: vi.fn(async ({ where }: any) => state.payments.filter((payment) => payment.subscriptionId === where.subscriptionId && payment.status === where.status).length),
      create: vi.fn(async ({ data }: any) => {
        const payment = { id: `pay_${state.payments.length + 1}`, ...data };
        state.payments.push(payment);
        return payment;
      }),
    },
    user: {
      update: vi.fn(async ({ data }: any) => {
        if (!state.user) return null;
        if (typeof data.tokenBalance === 'number') state.user.tokenBalance = data.tokenBalance;
        if (data.tokenBalance?.increment) state.user.tokenBalance = Number(state.user.tokenBalance ?? 0) + data.tokenBalance.increment;
        if (data.paymentsCount?.increment) state.user.paymentsCount = Number(state.user.paymentsCount ?? 0) + data.paymentsCount.increment;
        return state.user;
      }),
    },
    organization: {
      update: vi.fn(async ({ where, data }: any) => {
        if (!state.organization || state.organization.id !== where.id) {
          state.organization = {
            id: where.id,
            ownerUserId: 'user_1',
            tokenBalance: 0,
            planId: state.plan.id,
            seatLimit: state.plan.organizationSeatLimit,
            tokenPoolStrategy: 'SHARED_FOR_ORG',
          };
        }
        if (typeof data.tokenBalance === 'number') state.organization.tokenBalance = data.tokenBalance;
        if (data.tokenBalance?.increment) state.organization.tokenBalance = Number(state.organization.tokenBalance ?? 0) + data.tokenBalance.increment;
        if (data.planId !== undefined) state.organization.planId = data.planId;
        if (data.seatLimit !== undefined) state.organization.seatLimit = data.seatLimit;
        if (data.tokenPoolStrategy !== undefined) state.organization.tokenPoolStrategy = data.tokenPoolStrategy;
        return state.organization;
      }),
    },
  };

  return {
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (!state.user) return null;
        if (where.id && state.user.id === where.id) return state.user;
        if (where.externalCustomerId && state.user.externalCustomerId === where.externalCustomerId) return { id: state.user.id };
        return null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        if (!state.user || state.user.id !== where.id) return null;
        Object.assign(state.user, data);
        return state.user;
      }),
    },
    subscription: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id) return state.subscriptions.find((subscription) => subscription.id === where.id) ?? null;
        if (where.externalSubscriptionId) return state.subscriptions.find((subscription) => subscription.externalSubscriptionId === where.externalSubscriptionId) ?? null;
        return null;
      }),
      findFirst: vi.fn(async ({ where }: any) => findMatchingSubscription(where ?? {})[0] ?? null),
      findMany: vi.fn(async ({ where }: any) => findMatchingSubscription(where ?? {})),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const existing = state.subscriptions.find((subscription) => subscription.externalSubscriptionId === where.externalSubscriptionId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = {
          id: `sub_db_${state.subscriptions.length + 1}`,
          ...create,
          plan: { ...state.plan },
        };
        state.subscriptions.push(created);
        return created;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = findMatchingSubscription(where ?? {});
        for (const subscription of matches) {
          Object.assign(subscription, data);
        }
        return { count: matches.length };
      }),
    },
    organization: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (!state.organization) return null;
        if (where.ownerUserId && state.organization.ownerUserId !== where.ownerUserId) return null;
        return state.organization;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        if (!state.organization) return null;
        if (where.id && state.organization.id === where.id) return state.organization;
        if (where.clerkOrganizationId && state.organization.clerkOrganizationId === where.clerkOrganizationId) return state.organization;
        return null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        if (!state.organization || state.organization.id !== where.id) {
          state.organization = {
            id: where.id,
            ownerUserId: 'user_1',
            name: 'Provisioned Team',
            slug: 'provisioned-team',
            tokenBalance: 0,
          };
        }
        Object.assign(state.organization, data);
        return state.organization;
      }),
    },
    organizationMembership: {
      aggregate: vi.fn(async () => ({ _sum: { memberTokenUsage: 0 } })),
    },
    payment: {
      findFirst: vi.fn(async ({ where }: any) => {
        return state.payments.find((payment) => {
          if (where.userId && payment.userId !== where.userId) return false;
          if (where.planId && payment.planId !== where.planId) return false;
          if (where.subscriptionId && payment.subscriptionId !== where.subscriptionId) return false;
          if (where.status && payment.status !== where.status) return false;
          if (where.organizationId === null && payment.organizationId !== null) return false;
          return true;
        }) ?? null;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = state.payments.filter((payment) => {
          if (where.subscriptionId?.in && !where.subscriptionId.in.includes(payment.subscriptionId)) return false;
          if (where.organizationId === null && payment.organizationId !== null) return false;
          return true;
        });
        for (const payment of matches) {
          Object.assign(payment, data);
        }
        return { count: matches.length };
      }),
    },
    $transaction: vi.fn(async (arg: any) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg(tx);
    }),
    __tx: tx,
  };
});

const creditOrganizationSharedTokensMock = vi.hoisted(() => vi.fn(async ({ organizationId, amount }: { organizationId: string; amount: number }) => {
  if (!state.organization || state.organization.id !== organizationId) return false;
  state.organization.tokenBalance = Number(state.organization.tokenBalance ?? 0) + amount;
  return true;
}));

const workspaceServiceMock = vi.hoisted(() => ({
  providerName: 'nextauth',
  createProviderOrganization: vi.fn(async () => ({
    id: 'org_prov_1',
    name: 'Provisioned Team',
    slug: 'provisioned-team',
  })),
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../lib/workspace-service', () => ({ workspaceService: workspaceServiceMock }));
vi.mock('../lib/settings', () => ({
  getPaidTokensNaturalExpiryGraceHours: vi.fn(async () => 24),
}));
vi.mock('../lib/teams', () => ({
  creditOrganizationSharedTokens: creditOrganizationSharedTokensMock,
  upsertOrganization: vi.fn(async () => null),
  syncOrganizationMembership: vi.fn(async () => null),
}));
vi.mock('../lib/payments', () => ({ updateSubscriptionLastPaymentAmount: vi.fn(async () => undefined) }));
vi.mock('../lib/payment/invoice-payment-state-updates', () => ({ applyInvoicePaymentStateUpdates: vi.fn(async ({ dbSub }: any) => dbSub) }));
vi.mock('../lib/payment/invoice-payment-expiry-refresh', () => ({ refreshInvoicePaymentSubscriptionExpiry: vi.fn(async ({ dbSub }: any) => ({ dbSub, refreshedExpiresAt: null })) }));
vi.mock('../lib/payment/invoice-payment-notifications', () => ({ processInvoicePaidNotifications: vi.fn(async () => ({ shouldReturnEarly: false })) }));

import { ensureTeamOrganization } from '../lib/organization-access';
import { processInvoicePaidEvent } from '../lib/payment/invoice-payment-recording';
import { persistSubscriptionCheckoutState } from '../lib/payment/subscription-checkout-state';

describe('team subscribe -> provision -> renew sequence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.reset();
  });

  it('backfills the provisioned org onto the subscription and credits the org bucket on a later renewal without org metadata', async () => {
    const dbSub = await persistSubscriptionCheckoutState({
      userId: 'user_1',
      subscription: {
        id: 'sub_provider_1',
        customerId: 'cus_1',
        canceledAt: null,
      } as any,
      planToUse: state.plan as any,
      organizationId: null,
      desiredStatus: 'ACTIVE',
      effectiveStartedAt: new Date('2026-03-01T00:00:00.000Z'),
      effectiveExpiresAt: new Date('2026-04-01T00:00:00.000Z'),
      providerKey: 'paddle',
      mergeIdMap: (_existing: unknown, _key: string, value?: string | null) => value ?? null,
    });

    state.payments.push({
      id: 'pay_initial_1',
      userId: 'user_1',
      subscriptionId: dbSub.id,
      planId: state.plan.id,
      organizationId: null,
      status: 'SUCCEEDED',
      externalPaymentId: 'pi_initial_1',
    });

    expect(state.subscriptions[0]?.organizationId ?? null).toBeNull();

    await ensureTeamOrganization('user_1');

    expect(state.organization?.id).toBe('org_prov_1');
    expect(state.subscriptions[0]?.organizationId).toBe('org_prov_1');
    expect(state.payments[0]?.organizationId).toBe('org_prov_1');
    expect(state.organization?.tokenBalance).toBe(100);

    await processInvoicePaidEvent({
      invoice: {
        id: 'inv_renew_1',
        subscriptionId: 'sub_provider_1',
        paymentIntentId: 'pi_renew_1',
        amountPaid: 5000,
        subtotal: 5000,
        amountDiscount: 0,
        billingReason: 'subscription_recurring',
        metadata: {},
      } as any,
      providerKey: 'paddle',
      mergeIdMap: (_existing: unknown, _key: string, value?: string | null) => value ?? null,
      findSubscriptionByProviderId: vi.fn(async (subscriptionId: string) => {
        return state.subscriptions.find((subscription) => subscription.externalSubscriptionId === subscriptionId) as any;
      }),
      ensureProviderBackedSubscription: vi.fn(async () => null),
      resolveOrganizationContext: vi.fn(async () => null),
      shouldClearPaidTokensOnRenewal: vi.fn(async () => false),
      refreshSubscriptionExpiryFromProvider: vi.fn(async () => ({ refreshedPeriodEnd: null, resurrected: false })),
      findRecentNotificationByTitles: vi.fn(async () => null),
      findRecentNotificationByExactMessage: vi.fn(async () => null),
    });

    expect(state.organization?.tokenBalance).toBe(200);
    expect(state.payments.find((payment) => payment.externalPaymentId === 'pi_renew_1')?.organizationId).toBe('org_prov_1');
  });
});