export type PricingPlanFamily = 'personal' | 'team';

export type ActiveRecurringPlan = {
  planId: string;
  priceCents: number | null;
  recurringInterval: string | null;
} | null;

export type ActiveRecurringPlansByFamily = {
  personal: ActiveRecurringPlan;
  team: ActiveRecurringPlan;
};

export type ScheduledPlanIdsByFamily = {
  personal: string | null;
  team: string | null;
};

type PricingCardSubscriptionStatusInput = {
  status: string;
  plan: {
    id: string;
    priceCents: number | null;
    recurringInterval: string | null;
    supportsOrganizations?: boolean | null;
    autoRenew?: boolean | null;
  };
  scheduledPlan?: {
    id: string;
  } | null;
};

export function getPricingPlanFamily(supportsOrganizations?: boolean | null): PricingPlanFamily {
  return supportsOrganizations === true ? 'team' : 'personal';
}

export function createEmptyActiveRecurringPlansByFamily(): ActiveRecurringPlansByFamily {
  return {
    personal: null,
    team: null,
  };
}

export function createEmptyScheduledPlanIdsByFamily(): ScheduledPlanIdsByFamily {
  return {
    personal: null,
    team: null,
  };
}

export function buildPricingCardRecurringState(
  subscriptions: PricingCardSubscriptionStatusInput[],
): {
  activeRecurringPlansByFamily: ActiveRecurringPlansByFamily;
  scheduledPlanIdsByFamily: ScheduledPlanIdsByFamily;
} {
  const activeRecurringPlansByFamily = createEmptyActiveRecurringPlansByFamily();
  const scheduledPlanIdsByFamily = createEmptyScheduledPlanIdsByFamily();

  for (const subscription of subscriptions) {
    if (subscription.status !== 'ACTIVE' || subscription.plan.autoRenew !== true) {
      continue;
    }

    const family = getPricingPlanFamily(subscription.plan.supportsOrganizations);
    if (!activeRecurringPlansByFamily[family]) {
      activeRecurringPlansByFamily[family] = {
        planId: subscription.plan.id,
        priceCents: subscription.plan.priceCents,
        recurringInterval: subscription.plan.recurringInterval,
      };
    }

    if (!scheduledPlanIdsByFamily[family] && subscription.scheduledPlan?.id) {
      scheduledPlanIdsByFamily[family] = subscription.scheduledPlan.id;
    }
  }

  for (const subscription of subscriptions) {
    if (subscription.status !== 'PENDING' || subscription.plan.autoRenew !== true) {
      continue;
    }

    const family = getPricingPlanFamily(subscription.plan.supportsOrganizations);
    if (!scheduledPlanIdsByFamily[family]) {
      scheduledPlanIdsByFamily[family] = subscription.plan.id;
    }
  }

  return {
    activeRecurringPlansByFamily,
    scheduledPlanIdsByFamily,
  };
}