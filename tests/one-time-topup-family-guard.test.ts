import { beforeEach, describe, expect, it, vi } from 'vitest';

const txMock = vi.hoisted(() => ({
  payment: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  user: {
    update: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<void>) => fn(txMock)),
}));

const creditOrganizationSharedTokensMock = vi.hoisted(() => vi.fn(async () => undefined));
const creditAllocatedPerMemberTokensMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/teams', () => ({
  creditOrganizationSharedTokens: creditOrganizationSharedTokensMock,
  creditAllocatedPerMemberTokens: creditAllocatedPerMemberTokensMock,
}));
vi.mock('../lib/notifications', () => ({ sendBillingNotification: vi.fn(), sendAdminNotificationEmail: vi.fn() }));
vi.mock('../lib/settings', () => ({ getDefaultTokenLabel: vi.fn(async () => 'tokens') }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { processOneTimeRecurringTopup } from '../lib/payment/one-time-topup';

type ProcessOneTimeTopupInput = Parameters<typeof processOneTimeRecurringTopup>[0];
type ResolvedOrganizationContext = NonNullable<Awaited<ReturnType<ProcessOneTimeTopupInput['resolveOrganizationContext']>>>;

function createCheckoutSession(id: string): ProcessOneTimeTopupInput['session'] {
  return {
    id,
    mode: 'payment',
    paymentStatus: 'paid',
    metadata: { activeClerkOrgId: 'org_clerk_1' },
  };
}

function createResolvedOrganizationContext(): ResolvedOrganizationContext {
  return {
    role: 'OWNER',
    organization: { id: 'org_db_1', name: 'Team Org', tokenPoolStrategy: 'SHARED_FOR_ORG' },
    membership: null,
  } as ResolvedOrganizationContext;
}

describe('processOneTimeRecurringTopup plan-family guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txMock.payment.findUnique.mockResolvedValue(null);
    txMock.payment.create.mockResolvedValue({ id: 'pay_1' });
    txMock.user.update.mockResolvedValue({ id: 'user_1' });
  });

  it('credits user balance (not workspace) for non-team one-time purchase even with owner org context', async () => {
    await processOneTimeRecurringTopup({
      userId: 'user_1',
      planToUse: {
        id: 'plan_non_team',
        name: 'Personal Topup',
        tokenLimit: 50,
        supportsOrganizations: false,
      } as ProcessOneTimeTopupInput['planToUse'],
      resolvedAmountCents: 500,
      resolvedSubtotalCents: 500,
      resolvedDiscountCents: 0,
      couponCode: null,
      session: createCheckoutSession('sess_1'),
      finalPaymentIntent: 'pi_1',
      providerKey: 'stripe',
      mergeIdMap: () => null,
      resolveOrganizationContext: vi.fn(async () => createResolvedOrganizationContext()),
    });

    expect(creditOrganizationSharedTokensMock).not.toHaveBeenCalled();
    expect(txMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenBalance: { increment: 50 },
        }),
      })
    );
  });

  it('credits workspace shared pool for team one-time purchase with owner org context', async () => {
    await processOneTimeRecurringTopup({
      userId: 'user_1',
      planToUse: {
        id: 'plan_team',
        name: 'Team Topup',
        tokenLimit: 30,
        supportsOrganizations: true,
      } as ProcessOneTimeTopupInput['planToUse'],
      resolvedAmountCents: 900,
      resolvedSubtotalCents: 900,
      resolvedDiscountCents: 0,
      couponCode: null,
      session: createCheckoutSession('sess_2'),
      finalPaymentIntent: 'pi_2',
      providerKey: 'stripe',
      mergeIdMap: () => null,
      resolveOrganizationContext: vi.fn(async () => createResolvedOrganizationContext()),
    });

    expect(creditOrganizationSharedTokensMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_db_1', amount: 30 })
    );
    expect(txMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ tokenBalance: expect.anything() }),
      })
    );
  });

  it('credits each active member when workspace top-up uses ALLOCATED_PER_MEMBER', async () => {
    const allocatedContext = {
      ...createResolvedOrganizationContext(),
      organization: { id: 'org_db_1', name: 'Team Org', tokenPoolStrategy: 'ALLOCATED_PER_MEMBER' },
    } as ResolvedOrganizationContext;

    await processOneTimeRecurringTopup({
      userId: 'user_1',
      planToUse: {
        id: 'plan_team',
        name: 'Team Topup',
        tokenLimit: 30,
        supportsOrganizations: true,
      } as ProcessOneTimeTopupInput['planToUse'],
      resolvedAmountCents: 900,
      resolvedSubtotalCents: 900,
      resolvedDiscountCents: 0,
      couponCode: null,
      session: createCheckoutSession('sess_3'),
      finalPaymentIntent: 'pi_3',
      providerKey: 'stripe',
      mergeIdMap: () => null,
      resolveOrganizationContext: vi.fn(async () => allocatedContext),
    });

    expect(creditAllocatedPerMemberTokensMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_db_1', amount: 30 })
    );
    expect(creditOrganizationSharedTokensMock).not.toHaveBeenCalled();
  });
});
