import { prisma } from './prisma';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import { getPaidTokensNaturalExpiryGraceHours, shouldResetPaidTokensOnExpiryForPlanAutoRenew } from './settings';
import { resetOrganizationSharedTokens } from './teams';

export async function maybeClearPaidTokensAfterNaturalExpiryGrace(opts: { userId: string; graceHours?: number }) {
  const { userId } = opts;
  const graceHours = Number.isFinite(opts.graceHours)
    ? (opts.graceHours as number)
    : await getPaidTokensNaturalExpiryGraceHours();
  const now = new Date();
  const cutoff = new Date(now.getTime() - graceHours * 3600 * 1000);

  try {
    // Only clear if the user has no currently-valid subscription.
    const hasValid = await prisma.subscription.findFirst({
      where: {
        userId,
        // Treat any non-EXPIRED subscription with time remaining as valid.
        // This prevents cancel-at-period-end (and other provider status mappings)
        // from being interpreted as "no valid subscription" while expiresAt is still in the future.
        status: { not: 'EXPIRED' },
        expiresAt: { gt: now },
      },
      select: { id: true },
    });

    if (hasValid) {
      return { cleared: false as const, reason: 'has_valid_subscription' as const };
    }

    // Only clear after grace window has passed since the (latest) natural expiry.
    // Treat both EXPIRED and CANCELLED as ended states.
    const latestEndedBeyondGrace = await prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ['EXPIRED', 'CANCELLED'] },
        expiresAt: { lt: cutoff },
      },
      orderBy: { expiresAt: 'desc' },
      include: {
        plan: {
          select: {
            autoRenew: true,
            supportsOrganizations: true,
          },
        },
      },
    });

    if (!latestEndedBeyondGrace) {
      return { cleared: false as const, reason: 'within_grace_or_no_expired' as const };
    }

    // Policy: explicit per-subscription override wins; otherwise consult plan-type settings.
    let shouldClear: boolean;

    // IMPORTANT: Many subscription rows are created without an explicit token-clear decision.
    // In those cases `clearPaidTokensOnExpiry` often defaults to false; treating that as a hard
    // override would prevent cleanup indefinitely.
    // We therefore:
    // - Always honor explicit overrides for EXPIRED subscriptions (admin/manual expirations).
    // - For CANCELLED subscriptions, only treat a TRUE value as an explicit override; otherwise
    //   fall back to the plan-type settings.
    if (latestEndedBeyondGrace.status === 'EXPIRED' && typeof latestEndedBeyondGrace.clearPaidTokensOnExpiry === 'boolean') {
      shouldClear = latestEndedBeyondGrace.clearPaidTokensOnExpiry;
    } else if (latestEndedBeyondGrace.status === 'CANCELLED' && latestEndedBeyondGrace.clearPaidTokensOnExpiry === true) {
      shouldClear = true;
    } else {
      const planAutoRenew = latestEndedBeyondGrace.plan?.autoRenew === true;
      shouldClear = await shouldResetPaidTokensOnExpiryForPlanAutoRenew(planAutoRenew);
    }

    if (!shouldClear) {
      return { cleared: false as const, reason: 'policy_no_clear' as const };
    }

    await prisma.user.update({ where: { id: userId }, data: { tokenBalance: 0 } });

    // If org/team plans have ended beyond grace, also reset the shared pool for owned orgs.
    const expiredOrgSubs = await prisma.subscription.findMany({
      where: {
        userId,
        status: { in: ['EXPIRED', 'CANCELLED'] },
        expiresAt: { lt: cutoff },
        organizationId: { not: null },
        plan: { supportsOrganizations: true },
      },
      select: { organizationId: true },
    });

    const orgIds = Array.from(
      new Set(
        expiredOrgSubs
          .map((s) => s.organizationId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );

    if (orgIds.length > 0) {
      const owned = await prisma.organization.findMany({
        where: { id: { in: orgIds }, ownerUserId: userId },
        select: { id: true },
      });

      for (const org of owned) {
        await resetOrganizationSharedTokens({ organizationId: org.id });
      }
    }

    return { cleared: true as const, reason: 'cleared' as const };
  } catch (err: unknown) {
    Logger.warn('maybeClearPaidTokensAfterNaturalExpiryGrace failed', { userId, error: toError(err).message });
    return { cleared: false as const, reason: 'error' as const };
  }
}
