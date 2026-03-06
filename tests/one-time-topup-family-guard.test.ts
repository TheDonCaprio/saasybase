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

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/teams', () => ({ creditOrganizationSharedTokens: creditOrganizationSharedTokensMock }));
vi.mock('../lib/notifications', () => ({ sendBillingNotification: vi.fn(), sendAdminNotificationEmail: vi.fn() }));
vi.mock('../lib/settings', () => ({ getDefaultTokenLabel: vi.fn(async () => 'tokens') }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { processOneTimeRecurringTopup } from '../lib/payment/one-time-topup';

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
      } as any,
      resolvedAmountCents: 500,
      resolvedSubtotalCents: 500,
      resolvedDiscountCents: 0,
      couponCode: null,
      session: {
        id: 'sess_1',
        metadata: { activeClerkOrgId: 'org_clerk_1' },
      } as any,
      finalPaymentIntent: 'pi_1',
      providerKey: 'stripe',
      mergeIdMap: () => null,
      resolveOrganizationContext: (vi.fn(async () => ({
        role: 'OWNER',
        organization: { id: 'org_db_1', name: 'Team Org' },
        membership: null,
      })) as any),
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
      } as any,
      resolvedAmountCents: 900,
      resolvedSubtotalCents: 900,
      resolvedDiscountCents: 0,
      couponCode: null,
      session: {
        id: 'sess_2',
        metadata: { activeClerkOrgId: 'org_clerk_1' },
      } as any,
      finalPaymentIntent: 'pi_2',
      providerKey: 'stripe',
      mergeIdMap: () => null,
      resolveOrganizationContext: (vi.fn(async () => ({
        role: 'OWNER',
        organization: { id: 'org_db_1', name: 'Team Org' },
        membership: null,
      })) as any),
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
});
