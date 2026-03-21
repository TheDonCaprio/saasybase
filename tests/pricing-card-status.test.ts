import { describe, expect, it } from 'vitest';

import { buildPricingCardRecurringState } from '../lib/pricing-card-status';

describe('pricing card recurring state', () => {
  it('tracks personal and team recurring plans independently', () => {
    const result = buildPricingCardRecurringState([
      {
        status: 'ACTIVE',
        plan: {
          id: 'plan_personal_pro',
          priceCents: 2000,
          recurringInterval: 'month',
          supportsOrganizations: false,
          autoRenew: true,
        },
      },
      {
        status: 'ACTIVE',
        plan: {
          id: 'plan_team_pro',
          priceCents: 10000,
          recurringInterval: 'week',
          supportsOrganizations: true,
          autoRenew: true,
        },
      },
    ]);

    expect(result.activeRecurringPlansByFamily.personal?.planId).toBe('plan_personal_pro');
    expect(result.activeRecurringPlansByFamily.team?.planId).toBe('plan_team_pro');
    expect(result.scheduledPlanIdsByFamily.personal).toBeNull();
    expect(result.scheduledPlanIdsByFamily.team).toBeNull();
  });

  it('marks pending recurring subscriptions as scheduled for the matching family', () => {
    const result = buildPricingCardRecurringState([
      {
        status: 'ACTIVE',
        plan: {
          id: 'plan_team_current',
          priceCents: 10000,
          recurringInterval: 'week',
          supportsOrganizations: true,
          autoRenew: true,
        },
        scheduledPlan: { id: 'plan_team_scheduled' },
      },
      {
        status: 'PENDING',
        plan: {
          id: 'plan_personal_scheduled',
          priceCents: 3000,
          recurringInterval: 'month',
          supportsOrganizations: false,
          autoRenew: true,
        },
      },
    ]);

    expect(result.scheduledPlanIdsByFamily.team).toBe('plan_team_scheduled');
    expect(result.scheduledPlanIdsByFamily.personal).toBe('plan_personal_scheduled');
  });
});