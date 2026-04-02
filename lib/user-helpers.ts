import { prisma } from './prisma';
import { authService } from './auth-provider';
import { isLocalhostDevBypassEnabled } from './dev-admin-bypass';
import type { AuthUser } from './auth-provider';
import { initializeNewUserTokens, resetUserTokensIfNeeded } from './settings';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import type { Prisma } from '@/lib/prisma-client';
import { notifyExpiredSubscriptions } from './notifications';
import { syncOrganizationEligibilityForUser } from './organization-access';
import { maybeClearPaidTokensAfterNaturalExpiryGrace } from './paidTokenCleanup';
type LocalUser = {
  id: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  role: string;
  createdAt: Date;
  tokenBalance: number;
  freeTokenBalance?: number | null;
  freeTokensLastResetAt?: Date | null;
};

/**
 * Internal user shape — now mapped from AuthUser instead of raw Clerk type.
 * Kept as a distinct alias so downstream code continues to work unchanged.
 */
type ClerkCurrentUser = AuthUser | null;

function getErrorStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const maybe = error as { status?: unknown; statusCode?: unknown; clerkError?: { status?: unknown; statusCode?: unknown } };
  const candidates = [maybe.status, maybe.statusCode, maybe.clerkError?.status, maybe.clerkError?.statusCode];
  for (const candidate of candidates) {
    if (typeof candidate === 'number') return candidate;
    if (typeof candidate === 'string') {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function isClerkRateLimitError(error: unknown): boolean {
  const status = getErrorStatusCode(error);
  if (status === 429) return true;
  const message = toError(error).message.toLowerCase();
  return message.includes('too many requests') || message.includes('rate limit');
}

async function safeCurrentUserForEnsure(userId: string): Promise<{ user: ClerkCurrentUser; rateLimited: boolean }> {
  try {
    const user = await authService.getCurrentUser();
    return { user, rateLimited: false };
  } catch (err: unknown) {
    const error = toError(err);
    const rateLimited = isClerkRateLimitError(err);
    Logger.warn('ensureUserExists: currentUser failed', {
      userId,
      rateLimited,
      status: getErrorStatusCode(err) ?? 'unknown',
      error: error.message,
    });
    return { user: null, rateLimited };
  }
}

async function safeCurrentUserForSync(userId: string): Promise<ClerkCurrentUser> {
  try {
    return await authService.getCurrentUser();
  } catch (err: unknown) {
    const error = toError(err);
    Logger.warn('syncUserFromClerk: currentUser failed', {
      userId,
      rateLimited: isClerkRateLimitError(err),
      status: getErrorStatusCode(err) ?? 'unknown',
      error: error.message,
    });
    return null;
  }
}

function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

function pickClerkEmail(user: ClerkCurrentUser): string | null {
  if (!user) return null;
  // AuthUser already resolves the primary email in the provider adapter.
  return normalizeEmail(user.email);
}

const isMissingFreeTokenColumns = (msg: string) =>
  msg.includes('freeTokenBalance') || msg.includes('freeTokensLastResetAt') || msg.includes('does not exist');

const isUniqueEmailConstraintError = (msg: string) =>
  msg.includes('Unique constraint failed') && msg.includes('email');

export async function ensureUserExists(opts?: { userId?: string; emailOverride?: string }) {
  const session = await authService.getSession();
  let userId = session.userId;
  if (opts?.userId) userId = opts.userId;
  if (!userId) return null;

  // Get the current user data via the auth provider abstraction;
  // fall back to direct fetch when userId differs from auth context
  const currentUserResult = await safeCurrentUserForEnsure(userId);
  let clerkUser = currentUserResult.user;
  if ((!clerkUser || clerkUser.id !== userId) && !currentUserResult.rateLimited) {
    try {
      clerkUser = await authService.getUser(userId);
    } catch (err: unknown) {
      const error = toError(err);
      Logger.warn('ensureUserExists: failed to load user directly', {
        userId,
        rateLimited: isClerkRateLimitError(err),
        status: getErrorStatusCode(err) ?? 'unknown',
        error: error.message,
      });
      clerkUser = null;
    }
  }

  // Check if user exists in database. The project may have updated the Prisma
  // schema with `freeTokenBalance` but the runtime database hasn't been
  // migrated yet. Attempt the extended select first and gracefully fall back
  // to the legacy select if the column is missing.
  let user: LocalUser | null = null;
  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        imageUrl: true,
        role: true,
        createdAt: true,
        tokenBalance: true,
        freeTokenBalance: true,
        freeTokensLastResetAt: true,
      } as Prisma.UserSelect,
    }) as unknown as LocalUser;
  } catch (err: unknown) {
    // If the error mentions the new column not existing, fall back to the
    // older select shape so the app can continue running until the DB is
    // migrated. We intentionally swallow the error and return a partial
    // user object with default free-token fields populated.
    const msg = String((err as { message?: string })?.message ?? err);
    if (msg.includes('freeTokenBalance') || msg.includes('freeTokensLastResetAt') || msg.includes('does not exist')) {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, imageUrl: true, role: true, createdAt: true, tokenBalance: true } as Prisma.UserSelect
      }) as LocalUser | null;
      // Ensure downstream code can reference freeTokenBalance / freeTokensLastResetAt
      // without crashing by providing conservative defaults.
      if (user) {
        (user as LocalUser).freeTokenBalance = 0;
        (user as LocalUser).freeTokensLastResetAt = null;
      }
    } else {
      throw err;
    }
  }

  // If user doesn't exist, create them with Clerk data
  if (!user) {
    try {
      const normalizedEmail = opts?.emailOverride ? normalizeEmail(opts.emailOverride) : pickClerkEmail(clerkUser);
      // Check if this user should be an admin (matches DEV_ADMIN_ID in development)
      const shouldBeAdmin = isLocalhostDevBypassEnabled() &&
        process.env.DEV_ADMIN_ID &&
        userId === process.env.DEV_ADMIN_ID;
      const defaultSelect = {
        id: true,
        email: true,
        name: true,
        imageUrl: true,
        role: true,
        createdAt: true,
        tokenBalance: true,
        freeTokenBalance: true,
        freeTokensLastResetAt: true,
      } as Prisma.UserSelect;

      const legacySelect = {
        id: true,
        email: true,
        name: true,
        imageUrl: true,
        role: true,
        createdAt: true,
        tokenBalance: true,
      } as Prisma.UserSelect;

      const baseData = {
        id: userId,
        name: clerkUser?.fullName || clerkUser?.firstName || '',
        imageUrl: clerkUser?.imageUrl || null,
        role: shouldBeAdmin ? 'ADMIN' : 'USER',
      } as const;

      const createArgs = (select: Prisma.UserSelect, emailValue: string | null) => ({
        data: {
          ...baseData,
          email: emailValue,
        },
        select,
      });

      const attemptCreate = async (select: Prisma.UserSelect): Promise<LocalUser> => {
        try {
          return await prisma.user.create(createArgs(select, normalizedEmail)) as unknown as LocalUser;
        } catch (err: unknown) {
          const msg = String((err as { message?: string })?.message ?? err);
          if (isUniqueEmailConstraintError(msg)) {
            Logger.warn('ensureUserExists: duplicate email detected, storing null', { userId, email: normalizedEmail ?? 'null' });
            return await prisma.user.create(createArgs(select, null)) as unknown as LocalUser;
          }
          throw err;
        }
      };

      try {
        user = await attemptCreate(defaultSelect);
      } catch (err: unknown) {
        const msg = String((err as { message?: string })?.message ?? err);
        if (isMissingFreeTokenColumns(msg)) {
          user = await attemptCreate(legacySelect);
          if (user) {
            (user as LocalUser).freeTokenBalance = 0;
            (user as LocalUser).freeTokensLastResetAt = null;
          }
        } else {
          throw err;
        }
      }

      // Initialize tokens for new users
      await initializeNewUserTokens(userId);
    } catch (error) {
      // User might have been created by another request
      void error;
      try {
        user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, imageUrl: true, role: true, createdAt: true, tokenBalance: true, freeTokenBalance: true, freeTokensLastResetAt: true } as Prisma.UserSelect
        }) as unknown as LocalUser;
      } catch {
        // Fall back to legacy select if necessary
        user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, imageUrl: true, role: true, createdAt: true, tokenBalance: true }
        }) as unknown as LocalUser;
        if (user) {
          (user as LocalUser).freeTokenBalance = 0;
          (user as LocalUser).freeTokensLastResetAt = null;
        }
      }
    }
  } else {
    // For existing users, first expire any stale ACTIVE subscriptions
    // (on-access cleanup) so token balances reflect wall-clock time.
    await expireStaleActiveSubscriptionsForUser(userId);

    // Then check if a scheduled free-token reset is needed
    await resetUserTokensIfNeeded(userId);
  }

  return user;
}

export async function syncUserFromClerk() {
  const { userId } = await authService.getSession();
  if (!userId) return null;

  const clerkUser = await safeCurrentUserForSync(userId);
  if (!clerkUser) return null;

  const normalizedEmail = pickClerkEmail(clerkUser);

  // Check if this user should be an admin (matches DEV_ADMIN_ID in development)
  const shouldBeAdmin = isLocalhostDevBypassEnabled() &&
    process.env.DEV_ADMIN_ID &&
    userId === process.env.DEV_ADMIN_ID;

  // Update user in database with latest Clerk data
  let user: LocalUser | null = null;
  const defaultSelect = {
    id: true,
    email: true,
    name: true,
    imageUrl: true,
    role: true,
    tokenBalance: true,
    createdAt: true,
    freeTokenBalance: true,
    freeTokensLastResetAt: true,
  } as Prisma.UserSelect;

  const legacySelect = {
    id: true,
    email: true,
    name: true,
    imageUrl: true,
    role: true,
    tokenBalance: true,
    createdAt: true,
  } as Prisma.UserSelect;

  const upsertArgs = (select: Prisma.UserSelect, emailValue: string | null) => ({
    where: { id: userId },
    update: {
      email: emailValue,
      name: clerkUser.fullName || clerkUser.firstName || null,
      imageUrl: clerkUser.imageUrl || null,
    },
    create: {
      id: userId,
      email: emailValue,
      name: clerkUser.fullName || clerkUser.firstName || null,
      imageUrl: clerkUser.imageUrl || null,
      role: shouldBeAdmin ? 'ADMIN' : 'USER'
    },
    select,
  });

  const attemptUpsert = async (select: Prisma.UserSelect): Promise<LocalUser> => {
    try {
      return await prisma.user.upsert(upsertArgs(select, normalizedEmail)) as unknown as LocalUser;
    } catch (err: unknown) {
      const msg = String((err as { message?: string })?.message ?? err);
      if (isUniqueEmailConstraintError(msg)) {
        Logger.warn('syncUserFromClerk: duplicate email detected, storing null', { userId, email: normalizedEmail ?? 'null' });
        return await prisma.user.upsert(upsertArgs(select, null)) as unknown as LocalUser;
      }
      throw err;
    }
  };

  try {
    user = await attemptUpsert(defaultSelect);
  } catch (err: unknown) {
    const msg = String((err as { message?: string })?.message ?? err);
    if (isMissingFreeTokenColumns(msg)) {
      // Retry with legacy select and synthesize free-token fields
      user = await attemptUpsert(legacySelect);
      if (user) {
        (user as LocalUser).freeTokenBalance = 0;
        (user as LocalUser).freeTokensLastResetAt = null;
      }
    } else {
      throw err;
    }
  }

  // Check if this is a new user (just created) and initialize tokens
  // If this looks like a fresh account with no free-token initialization, initialize it
  if (user && ((user.freeTokenBalance === 0 || user.freeTokenBalance == null) && !user.freeTokensLastResetAt)) {
    await initializeNewUserTokens(userId);
  } else {
    // For existing users, first expire any stale ACTIVE subscriptions
    // (on-access cleanup) so token balances reflect wall-clock time.
    await expireStaleActiveSubscriptionsForUser(userId);

    // Then check if a scheduled free-token reset is needed
    await resetUserTokensIfNeeded(userId);

    // Finally, clear paid tokens only if the user has been expired for >24h.
    // This only applies to natural expiry (wall-clock) flows.
    await maybeClearPaidTokensAfterNaturalExpiryGrace({ userId });
  }

  return user;
}

/**
 * Expire any ACTIVE subscriptions for the given user whose expiresAt is < now.
 * If any were expired, reset the user's paid token balance to 0.
 * This is a lightweight on-access cleanup to avoid requiring a cron job.
 */
async function expireStaleActiveSubscriptionsForUser(userId: string) {
  try {
    // Find expired active subscriptions for notification before we update them
    const expiredActiveSubs = await prisma.subscription.findMany({
      where: { userId, status: 'ACTIVE', expiresAt: { lt: new Date() } },
      select: {
        id: true,
        organizationId: true,
        plan: { select: { supportsOrganizations: true } },
      }
    });

    if (expiredActiveSubs.length === 0) return;

    const updateRes = await prisma.subscription.updateMany({
      where: { userId, status: 'ACTIVE', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED', canceledAt: new Date() }
    });

    if (updateRes.count > 0) {
      try {
        await syncOrganizationEligibilityForUser(userId);
      } catch (err: unknown) {
        Logger.warn('Failed to sync organization eligibility after expiring stale subscriptions', { userId, error: String(err) });
      }

      // Fire-and-forget notify; don't block on failures
      notifyExpiredSubscriptions(expiredActiveSubs.map(s => s.id)).catch(err => {
        Logger.warn('Failed to send expired-subscription notifications (on-access)', { userId, error: String(err) });
      });
    }
  } catch (err: unknown) {
    // Non-fatal; log and continue
    Logger.warn('Error running on-access subscription expiry cleanup', { userId, error: String(err) });
  }
}

export async function getCurrentUserWithFallback() {
  const { userId } = await authService.getSession();
  if (!userId) return null;

  const user = await ensureUserExists();
  return user;
}
