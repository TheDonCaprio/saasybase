import { describe, expect, it, vi } from 'vitest';

import { processSubscriptionCreatedExistingRecord } from '../lib/payment/subscription-paystack-post-processing';
import { deriveSubscriptionWebhookState } from '../lib/payment/subscription-webhook-state';

describe('Paystack provisional subscription.created handling', () => {
  it('keeps switch-now provisional subscriptions pending when subscription.created arrives before payment confirmation handling completes', async () => {
    const applySubscriptionCreatedExistingRecordUpdate = vi.fn(async (params) => ({
      dbSub: {
        id: 'sub_db_1',
        userId: 'user_1',
        status: params.effectiveStatus,
        prorationPendingSince: new Date('2026-03-17T10:00:00.000Z'),
        canceledAt: null,
        expiresAt: params.effectiveExpiresAt,
        cancelAtPeriodEnd: params.nextCancelAtPeriodEnd,
        createdAt: new Date('2026-03-17T10:00:00.000Z'),
        plan: { autoRenew: true },
      },
      wasTransitioningToActive: params.effectiveStatus === 'ACTIVE',
    }));
    const handlePaystackActiveSubscriptionPostProcessing = vi.fn(async () => false);
    const processSubscriptionCreatedPendingPaymentLink = vi.fn(async () => false);

    const result = await processSubscriptionCreatedExistingRecord({
      subscriptionId: 'SUB_paystack_new',
      providerKey: 'paystack',
      dbSub: {
        id: 'sub_db_1',
        userId: 'user_1',
        status: 'PENDING',
        prorationPendingSince: new Date('2026-03-17T10:00:00.000Z'),
        canceledAt: null,
        expiresAt: new Date('2026-04-17T10:00:00.000Z'),
        cancelAtPeriodEnd: false,
        createdAt: new Date('2026-03-17T10:00:00.000Z'),
        plan: { autoRenew: true },
      },
      subscription: {
        status: 'active',
        currentPeriodEnd: new Date('2026-04-17T10:00:00.000Z'),
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    }, {
      deriveSubscriptionWebhookState,
      applySubscriptionCreatedExistingRecordUpdate,
      isProviderSubscriptionActiveStatus: (status: string) => status === 'active',
      handlePaystackActiveSubscriptionPostProcessing,
      processSubscriptionCreatedPendingPaymentLink,
      linkPendingPaymentToSubscription: vi.fn(async () => false),
      syncOrganizationEligibilityForUser: vi.fn(async () => undefined),
    });

    expect(applySubscriptionCreatedExistingRecordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveStatus: 'PENDING',
      }),
    );
    expect(handlePaystackActiveSubscriptionPostProcessing).not.toHaveBeenCalled();
    expect(processSubscriptionCreatedPendingPaymentLink).not.toHaveBeenCalled();
    expect(result.wasTransitioningToActive).toBe(false);
  });
});