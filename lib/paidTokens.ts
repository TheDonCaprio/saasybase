import { shouldResetPaidTokensOnExpiryForUser, shouldResetPaidTokensOnRenewalForPlanAutoRenew } from './settings';

type SubLike = { id?: string; userId?: string; planId?: string; clearPaidTokensOnExpiry?: boolean | null };

/**
 * Decide whether paid tokens should be cleared when a subscription expires.
 * Precedence: explicit requestFlag (true/false) -> recorded subscription intent -> per-user/global setting.
 */
export async function shouldClearPaidTokensOnExpiry(opts: { userId?: string; subscription?: SubLike; requestFlag?: boolean }) {
  const { userId, subscription, requestFlag } = opts || {};
  if (requestFlag === true) return true;
  if (requestFlag === false) return false;

  if (subscription && typeof (subscription as SubLike).clearPaidTokensOnExpiry === 'boolean') {
    return Boolean((subscription as SubLike).clearPaidTokensOnExpiry);
  }

  if (!userId) return false;
  return await shouldResetPaidTokensOnExpiryForUser(userId);
}

/**
 * Decide whether paid tokens should be cleared on renewal. Honors explicit requestFlag first,
 * then falls back to plan-type (autoRenew) global setting.
 */
export async function shouldClearPaidTokensOnRenewal(planAutoRenew: boolean, requestFlag?: boolean) {
  if (requestFlag === true) return true;
  if (requestFlag === false) return false;
  return await shouldResetPaidTokensOnRenewalForPlanAutoRenew(planAutoRenew);
}

const paidTokens = { shouldClearPaidTokensOnExpiry, shouldClearPaidTokensOnRenewal };
export default paidTokens;
