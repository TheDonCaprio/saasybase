import type { Plan } from '@/lib/prisma-client';

const LIFETIME_ACCESS_ISO = '2999-12-31T23:59:59.000Z';

type LifetimePlanLike = {
  autoRenew?: boolean | null;
  isLifetime?: boolean | null;
  durationHours?: number | null;
};

export function getLifetimeAccessExpiresAt(): Date {
  return new Date(LIFETIME_ACCESS_ISO);
}

export function isLifetimePlan(plan?: LifetimePlanLike | null): boolean {
  return plan?.autoRenew !== true && plan?.isLifetime === true;
}

export function getSubscriptionExpiryForPlan(params: {
  plan: LifetimePlanLike;
  baseDate?: Date;
  periodMs?: number;
}): Date {
  if (isLifetimePlan(params.plan)) {
    return getLifetimeAccessExpiresAt();
  }

  const baseDate = params.baseDate ?? new Date();
  const fallbackPeriodMs = Math.max(0, (params.plan.durationHours ?? 0) * 60 * 60 * 1000);
  const periodMs = Math.max(0, params.periodMs ?? fallbackPeriodMs);
  return new Date(baseDate.getTime() + periodMs);
}

export function isLifetimeSubscription(record?: { isLifetime?: boolean | null; plan?: LifetimePlanLike | null } | null): boolean {
  return record?.isLifetime === true || isLifetimePlan(record?.plan);
}

export function getDurationHoursForDisplay(plan?: LifetimePlanLike | null): number | null {
  if (isLifetimePlan(plan)) return null;
  return typeof plan?.durationHours === 'number' ? plan.durationHours : null;
}

export function getPlanAccessLabel(plan?: Plan | LifetimePlanLike | null): string {
  return isLifetimePlan(plan) ? 'Lifetime access' : 'One-time access';
}
