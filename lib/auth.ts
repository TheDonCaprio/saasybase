import { prisma } from './prisma';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import { notifyExpiredSubscriptions, sendBillingNotification } from './notifications';
import { syncOrganizationEligibilityForUser } from './organization-access';
import { creditOrganizationSharedTokens, creditAllocatedPerMemberTokens } from './teams';
import { getDefaultTokenLabel } from './settings';
import {
  buildAdminLikePermissions,
  fetchModeratorPermissions,
  moderatorHasAccess,
  type ModeratorPermissions,
  type ModeratorSection
} from './moderator';
import { raiseAuthGuardError } from './auth-guard-error';
import { authService } from './auth-provider';
import { isLocalhostDevBypassEnabled } from './dev-admin-bypass';

export { AuthGuardError, isAuthGuardError, toAuthGuardErrorResponse } from './auth-guard-error';

export type UserRole = 'USER' | 'ADMIN' | 'MODERATOR';

export async function getAuthSafe(): Promise<{ userId: string | null; orgId?: string | null }> {
  // Route through the auth provider abstraction layer.
  // This delegates to whichever provider is configured (Clerk by default).
  return authService.getSession();
}

export async function getCurrentUserSafe(): Promise<{ id: string } | null> {
  // Route through the auth provider abstraction layer.
  const user = await authService.getCurrentUser();
  if (!user) return null;
  return { id: user.id };
}

export async function requireUser() {
  const { userId } = await getAuthSafe();
  if (!userId) {
    raiseAuthGuardError('UNAUTHENTICATED', {
      source: 'requireUser',
      reason: 'missing-session'
    });
  }
  return userId;
}

async function resolveUserRole(userId: string): Promise<UserRole | null> {
  const record = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!record || typeof record.role !== 'string') return null;
  const normalized = record.role.toUpperCase();
  if (normalized === 'ADMIN' || normalized === 'MODERATOR' || normalized === 'USER') {
    return normalized as UserRole;
  }
  return 'USER';
}

export async function getUserRole(userId: string): Promise<UserRole | null> {
  return resolveUserRole(userId);
}

export async function requireAdmin() {
  // Only allow the DEV_ADMIN_ID bypass in explicitly localhost-only environments.
  if (isLocalhostDevBypassEnabled()) {
    try {
      const devId = process.env.DEV_ADMIN_ID;
      if (devId) {
        const dbDev = await prisma.user.findUnique({ where: { id: devId } });
        if (dbDev && dbDev.role === 'ADMIN') return devId;
      }
    } catch {
      // ignore and fall through to normal auth
    }
  }

  let userId: string | null = null;

  const user = await getCurrentUserSafe();
  if (user?.id) {
    userId = user.id;
  } else {
    const auth = await getAuthSafe();
    if (auth.userId) {
      Logger.warn('requireAdmin falling back to auth() context');
      userId = auth.userId;
    }
  }

  if (!userId) {
    raiseAuthGuardError('UNAUTHENTICATED', {
      source: 'requireAdmin',
      reason: 'missing-current-user'
    });
  }
  const role = await resolveUserRole(userId);
  if (role !== 'ADMIN') {
    raiseAuthGuardError('FORBIDDEN', {
      source: 'requireAdmin',
      reason: 'role-mismatch',
      userId,
      extra: { resolvedRole: role ?? 'UNKNOWN' }
    });
  }
  return userId;
}

export interface AdminOrModeratorContext {
  userId: string;
  role: UserRole;
  permissions: ModeratorPermissions;
}

export async function requireAdminOrModerator(section?: ModeratorSection): Promise<AdminOrModeratorContext> {
  if (isLocalhostDevBypassEnabled()) {
    const devId = process.env.DEV_ADMIN_ID;
    if (devId) {
      try {
        const devRecord = await prisma.user.findUnique({ where: { id: devId }, select: { role: true } });
        if (devRecord?.role === 'ADMIN') {
          return {
            userId: devId,
            role: 'ADMIN',
            permissions: buildAdminLikePermissions()
          };
        }
      } catch {
        // Fall through to standard auth path when the lookup fails.
      }
    }
  }

  let userId: string | null = null;

  const user = await getCurrentUserSafe();
  if (user?.id) {
    userId = user.id;
  } else {
    const auth = await getAuthSafe();
    if (auth.userId) {
      Logger.warn('requireAdminOrModerator falling back to auth() context', { section: section ?? 'none' });
      userId = auth.userId;
    }
  }

  if (!userId) {
    raiseAuthGuardError('UNAUTHENTICATED', {
      source: 'requireAdminOrModerator',
      reason: 'missing-current-user',
      section
    });
  }

  const role = await resolveUserRole(userId);
  if (!role) {
    raiseAuthGuardError('FORBIDDEN', {
      source: 'requireAdminOrModerator',
      reason: 'role-lookup-failed',
      userId,
      section
    });
  }

  if (role === 'ADMIN') {
    return {
      userId,
      role,
      permissions: buildAdminLikePermissions()
    };
  }

  if (role === 'MODERATOR') {
    const permissions = await fetchModeratorPermissions();
    if (!section) {
      if (Object.values(permissions).some(Boolean)) {
        return { userId, role, permissions };
      }
      raiseAuthGuardError('FORBIDDEN', {
        source: 'requireAdminOrModerator',
        reason: 'moderator-no-permissions',
        userId
      });
    } else if (moderatorHasAccess(permissions, section)) {
      return { userId, role, permissions };
    }

    raiseAuthGuardError('FORBIDDEN', {
      source: 'requireAdminOrModerator',
      reason: 'moderator-section-denied',
      userId,
      section,
      extra: { granted: permissions[section] ?? false }
    });
  }

  raiseAuthGuardError('FORBIDDEN', {
    source: 'requireAdminOrModerator',
    reason: 'role-not-authorized',
    userId,
    section,
    extra: { resolvedRole: role }
  });
}

export async function getActiveSubscription(userId: string) {
  const now = new Date();
  
  // First, activate any PENDING subscriptions whose start time has arrived
  await activatePendingSubscriptions(userId);

  // Return the active subscription (ACTIVE) if present
  return prisma.subscription.findFirst({
    where: { 
      userId, 
      status: 'ACTIVE',
      startedAt: { lte: now },
      expiresAt: { gt: now } 
    },
    include: { plan: true },
    orderBy: { expiresAt: 'asc' } // Get the one expiring soonest
  });
}

export async function activatePendingSubscriptions(
  userId: string,
  opts?: {
    sendNotifications?: boolean;
    source?: string;
  }
) {
  const now = new Date();
  const sendNotifications = opts?.sendNotifications === true;

  // Find PENDING subscriptions whose start time has arrived
  const subscriptionsToActivate = await prisma.subscription.findMany({
    where: {
      userId,
      status: 'PENDING',
      startedAt: { lte: now },
      expiresAt: { gt: now },
      // Only auto-activate subscriptions with payment evidence.
      // This prevents abandoned checkout placeholders from granting access.
      payments: { some: { status: 'SUCCEEDED' } },
    },
    include: { plan: true, organization: { select: { tokenPoolStrategy: true } } },
  });

  // Find PENDING subscriptions that have ended (need to expire and notify)
  const expiredPendingSubs = await prisma.subscription.findMany({
    where: {
      userId,
      status: 'PENDING',
      expiresAt: { lte: now }
    },
    select: { id: true }
  });

  const expiredPendingResult = await prisma.subscription.updateMany({
    where: {
      userId,
      status: 'PENDING',
      expiresAt: { lte: now }
    },
    data: {
      status: 'EXPIRED',
      canceledAt: now
    }
  });

  if (expiredPendingSubs.length > 0) {
    notifyExpiredSubscriptions(expiredPendingSubs.map(s => s.id)).catch(err => {
      Logger.warn('Failed to notify expired subscriptions', { error: toError(err).message });
    });
  }

  if (subscriptionsToActivate.length === 0) {
    if (expiredPendingResult.count > 0) {
      try {
        await syncOrganizationEligibilityForUser(userId);
      } catch (err: unknown) {
        Logger.warn('Failed to sync organization eligibility after pending subscription expiry', {
          userId,
          error: toError(err).message,
          source: opts?.source,
        });
      }
    }
    return;
  }

  Logger.info('Activating pending subscriptions', {
    userId,
    subscriptionCount: subscriptionsToActivate.length,
    source: opts?.source,
  });

  let activatedCount = 0;

  for (const pending of subscriptionsToActivate) {
    try {
      // Transition guard: only activate once.
      const transitioned = await prisma.subscription.updateMany({
        where: { id: pending.id, status: 'PENDING' },
        data: { status: 'ACTIVE' },
      });

      if (transitioned.count !== 1) continue;
      activatedCount += 1;

      const plan = pending.plan;
      const tokenLimit = typeof plan.tokenLimit === 'number' ? plan.tokenLimit : 0;

      // Grant tokens at activation time (PENDING subscriptions intentionally do not grant on purchase).
      if (tokenLimit > 0) {
        await prisma.$transaction(async (tx) => {
          if (pending.organizationId) {
            const poolStrategy = (
              pending.plan?.organizationTokenPoolStrategy
              || pending.organization?.tokenPoolStrategy
              || 'SHARED_FOR_ORG'
            ).toUpperCase();
            if (poolStrategy === 'ALLOCATED_PER_MEMBER') {
              await creditAllocatedPerMemberTokens({
                organizationId: pending.organizationId,
                amount: tokenLimit,
                tx,
              });
            } else {
              await creditOrganizationSharedTokens({
                organizationId: pending.organizationId,
                amount: tokenLimit,
                tx,
              });
            }
          } else {
            await tx.user.update({
              where: { id: userId },
              data: { tokenBalance: { increment: tokenLimit } },
            });
          }
        });
      }

      if (sendNotifications) {
        try {
          const tokenName = (plan.tokenName || '').trim() || await getDefaultTokenLabel();
          const tokenInfo = tokenLimit ? ` with ${tokenLimit} ${tokenName}` : '';
          await sendBillingNotification({
            userId,
            title: 'Subscription Activated',
            message: `Your subscription to ${plan.name}${tokenInfo} is now active.`,
            templateKey: 'subscription_activated',
            variables: {
              planName: plan.name,
              amount: '—',
              transactionId: pending.id,
              tokenBalance: String(tokenLimit),
              tokenName,
              startedAt: pending.startedAt.toLocaleDateString(),
              expiresAt: pending.expiresAt.toLocaleDateString(),
            },
          });
        } catch (err) {
          Logger.warn('Failed to send activation notification for pending subscription', {
            userId,
            subscriptionId: pending.id,
            error: toError(err).message,
          });
        }
      }
    } catch (err) {
      Logger.warn('Failed to activate pending subscription', {
        userId,
        subscriptionId: pending.id,
        error: toError(err).message,
      });
    }
  }

  if (expiredPendingResult.count > 0 || activatedCount > 0) {
    try {
      await syncOrganizationEligibilityForUser(userId);
    } catch (err: unknown) {
      Logger.warn('Failed to sync organization eligibility after pending subscription updates', {
        userId,
        error: toError(err).message,
        source: opts?.source,
      });
    }
  }
}
