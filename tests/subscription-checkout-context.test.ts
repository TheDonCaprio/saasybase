import { describe, expect, it } from 'vitest';

import { buildSubscriptionCheckoutPaymentContext } from '../lib/payment/subscription-checkout-context';

describe('subscription checkout payment context', () => {
  it('preserves reset-on-renewal intent for provisional recurring switch activations', () => {
    const context = buildSubscriptionCheckoutPaymentContext({
      session: {
        id: 'cs_paystack_switch_now',
        mode: 'subscription',
        metadata: {},
        paymentIntentId: 'pi_paystack_switch_now',
        paymentStatus: 'paid',
      },
      userId: 'user_1',
      dbSubscriptionId: 'sub_db_1',
      planToUse: {
        id: 'plan_team_target',
        name: 'Team Pro',
        priceCents: 5000,
        tokenLimit: 250,
        autoRenew: true,
      } as never,
      desiredStatus: 'ACTIVE',
      organizationContext: {
        role: 'OWNER',
        organization: {
          id: 'org_1',
          name: 'Org',
          tokenPoolStrategy: 'SHARED_FOR_ORG',
        },
      } as never,
      replacedRecurringSubscription: null,
      resetTokensOnRenewal: false,
      isPendingRecurringSwitchActivation: true,
    });

    expect(context.tokensToGrant).toBe(250);
    expect(context.shouldResetTokensOnRenewal).toBe(true);
    expect(context.subscriptionPaymentBase.organizationId).toBe('org_1');
  });
});