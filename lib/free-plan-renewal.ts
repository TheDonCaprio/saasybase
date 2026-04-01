export type FreePlanRenewalType = 'unlimited' | 'daily' | 'monthly' | 'one-time';

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function requiresFreePlanResetTracking(renewalType: FreePlanRenewalType): boolean {
  return renewalType === 'daily' || renewalType === 'monthly';
}

export function shouldResetFreePlanTokensAt(params: {
  renewalType: FreePlanRenewalType;
  freeTokensLastResetAt?: Date | null;
  now?: Date;
}): boolean {
  const { renewalType, freeTokensLastResetAt = null, now = new Date() } = params;

  if (!requiresFreePlanResetTracking(renewalType)) {
    return false;
  }

  if (!freeTokensLastResetAt) {
    return true;
  }

  if (renewalType === 'daily') {
    return freeTokensLastResetAt < startOfDay(now);
  }

  return freeTokensLastResetAt < startOfMonth(now);
}
