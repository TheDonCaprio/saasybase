import type { AuthOrganization } from '@/lib/auth-provider';
import { prisma } from './prisma';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import { upsertOrganization, syncOrganizationMembership } from './teams';
import {
  getOrganizationExpiryMode,
  getPaidTokensNaturalExpiryGraceHours,
  shouldResetPaidTokensOnExpiryForPlanAutoRenew,
  type OrganizationExpiryMode,
} from './settings';
import { workspaceService } from './workspace-service';

const TEAM_SUB_STATUSES = ['ACTIVE', 'PENDING', 'CANCELLED', 'PAST_DUE'] as const;
const TEAM_SUB_STATUSES_STRICT = ['ACTIVE', 'PENDING', 'PAST_DUE'] as const;
type ClerkMembershipRole = 'org:admin' | 'org:member';
type ClerkErrorEntry = { meta?: { paramName?: string }; message?: string };

function normalizeTeamTokenPoolStrategy(strategy?: string | null): 'SHARED_FOR_ORG' | 'ALLOCATED_PER_MEMBER' {
  return strategy?.toUpperCase() === 'ALLOCATED_PER_MEMBER' ? 'ALLOCATED_PER_MEMBER' : 'SHARED_FOR_ORG';
}

type AllowedOrgSubscription = Awaited<ReturnType<typeof getActiveTeamSubscription>>;

type OwnerTeamAccess = {
  allowed: true;
  kind: 'OWNER';
  subscription: NonNullable<AllowedOrgSubscription>;
  plan: NonNullable<AllowedOrgSubscription>['plan'];
};

type MemberTeamAccess = {
  allowed: true;
  kind: 'MEMBER';
  membership: {
    organizationId: string;
    organizationName: string;
    ownerUserId: string;
    clerkOrganizationId: string | null;
    role: string;
    status: string;
  };
};

type NoTeamAccess = { allowed: false; reason?: 'NO_PLAN' | 'NO_MEMBERSHIP' };

export type TeamSubscriptionStatus = OwnerTeamAccess | MemberTeamAccess | NoTeamAccess;

async function findActiveTeamSubscription(
  userId: string,
  opts?: { includeGrace?: boolean; includeCancelled?: boolean; organizationId?: string }
) {
  const now = new Date();
  const includeCancelled = opts?.includeCancelled !== false;
  const eligibleStatuses = includeCancelled ? TEAM_SUB_STATUSES : TEAM_SUB_STATUSES_STRICT;
  const organizationFilter = opts?.organizationId ? { organizationId: opts.organizationId } : {};

  const baseInclude = {
    plan: {
      select: {
        id: true,
        name: true,
        shortDescription: true,
        description: true,
        priceCents: true,
        durationHours: true,
        isLifetime: true,
        autoRenew: true,
        recurringInterval: true,
        tokenLimit: true,
        tokenName: true,
        organizationSeatLimit: true,
        organizationTokenPoolStrategy: true,
        supportsOrganizations: true,
      },
    },
    scheduledPlan: {
      select: {
        id: true,
        name: true,
        priceCents: true,
      },
    },
  } as const;

  if (!opts?.includeGrace) {
    return prisma.subscription.findFirst({
      where: {
        userId,
        ...organizationFilter,
        status: { in: eligibleStatuses as unknown as string[] },
        expiresAt: { gt: now },
        plan: { supportsOrganizations: true },
        NOT: {
          status: 'PENDING',
          prorationPendingSince: { not: null },
        },
      },
      orderBy: { expiresAt: 'desc' },
      include: baseInclude,
    });
  }

  const graceHours = await getPaidTokensNaturalExpiryGraceHours();
  const graceCutoff = new Date(now.getTime() - graceHours * 60 * 60 * 1000);

  const unexpiredAccessClause = includeCancelled
    ? {
        status: { not: 'EXPIRED' },
        expiresAt: { gt: now },
      }
    : {
        status: { in: eligibleStatuses as unknown as string[] },
        expiresAt: { gt: now },
      };

  const graceWindowStatuses = includeCancelled ? ['EXPIRED', 'CANCELLED', 'PAST_DUE'] : ['EXPIRED', 'PAST_DUE'];

  return prisma.subscription.findFirst({
    where: {
      userId,
      ...organizationFilter,
      plan: { supportsOrganizations: true },
      NOT: {
        status: 'PENDING',
        prorationPendingSince: { not: null },
      },
      OR: [
        unexpiredAccessClause,
        {
          status: { in: graceWindowStatuses },
          expiresAt: { gt: graceCutoff, lte: now },
        },
      ],
    },
    orderBy: { expiresAt: 'desc' },
    include: baseInclude,
  });
}

export async function getActiveTeamSubscription(
  userId: string,
  opts?: { includeGrace?: boolean; includeCancelled?: boolean }
) {
  return findActiveTeamSubscription(userId, opts);
}

export async function getActiveTeamSubscriptionForOrganization(
  userId: string,
  organizationId: string,
  opts?: { includeGrace?: boolean; includeCancelled?: boolean }
) {
  return findActiveTeamSubscription(userId, { ...opts, organizationId });
}

export async function getOrganizationAccessSummary(userId: string, activeOrganizationId?: string | null): Promise<TeamSubscriptionStatus> {
  const targetedOrgCondition = activeOrganizationId
    ? {
      OR: [
        { id: activeOrganizationId },
        { clerkOrganizationId: activeOrganizationId },
      ],
    }
    : {};

  // First, check if they are an OWNER directly, factoring in the targeted org context if requested.
  if (activeOrganizationId) {
    const ownedOrg = await prisma.organization.findFirst({
      where: {
        ownerUserId: userId,
        OR: [
          { id: activeOrganizationId },
          { clerkOrganizationId: activeOrganizationId },
        ],
      },
      select: { id: true },
    });

    if (ownedOrg) {
      const subscription = await getActiveTeamSubscriptionForOrganization(userId, ownedOrg.id, { includeGrace: true });
      if (subscription && subscription.plan) {
        return { allowed: true, kind: 'OWNER', subscription, plan: subscription.plan };
      }
    }
  } else {
    const subscription = await getActiveTeamSubscription(userId, { includeGrace: true });
    if (subscription && subscription.plan) {
      return { allowed: true, kind: 'OWNER', subscription, plan: subscription.plan };
    }
  }

  // Next, check memberships. If a targeted org was provided, strictly filter to it.
  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      organization: {
        ...targetedOrgCondition,
        plan: {
          supportsOrganizations: true,
        },
      },
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          ownerUserId: true,
          clerkOrganizationId: true,
        },
      },
    },
  });

  if (membership?.organization) {
    // Verify the organization owner still has an active (or in-grace) team subscription.
    // Without this check, members retain access after the owner's plan fully expires
    // until the cron job or lazy dashboard check runs cleanup.
    const ownerSub = await getActiveTeamSubscriptionForOrganization(
      membership.organization.ownerUserId,
      membership.organization.id,
      { includeGrace: true },
    );
    if (!ownerSub) {
      return { allowed: false, reason: 'NO_PLAN' };
    }

    return {
      allowed: true,
      kind: 'MEMBER',
      membership: {
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
        ownerUserId: membership.organization.ownerUserId,
        clerkOrganizationId: membership.organization.clerkOrganizationId ?? null,
        role: membership.role,
        status: membership.status,
      },
    };
  }

  return { allowed: false, reason: 'NO_MEMBERSHIP' };
}

export async function syncOrganizationEligibilityForUser(userId: string, opts?: { ignoreGrace?: boolean }) {
  const subscription = await getActiveTeamSubscription(userId, {
    includeGrace: !opts?.ignoreGrace,
    // When ignoring grace (admin force-cancel/expire), we should not allow
    // cancelled-but-unexpired subscriptions to keep org access alive.
    includeCancelled: !opts?.ignoreGrace,
  });
  if (subscription && subscription.plan) {
    return { allowed: true, kind: 'OWNER', subscription, plan: subscription.plan } satisfies TeamSubscriptionStatus;
  }
  const mode: OrganizationExpiryMode = opts?.ignoreGrace ? 'DISMANTLE' : await getOrganizationExpiryMode();
  await deactivateUserOrganizations(userId, {
    mode,
    reason: 'syncOrganizationEligibilityForUser',
    useExpiryTokenResetPolicy: mode === 'SUSPEND',
  });
  return { allowed: false, reason: 'NO_PLAN' } satisfies TeamSubscriptionStatus;
}

async function resolveSuspendedOrganizationTokenResetMap(orgs: Array<{ id: string; ownerUserId: string }>) {
  const entries = await Promise.all(
    orgs.map(async (org) => {
      const exactSubscription = await prisma.subscription.findFirst({
        where: {
          userId: org.ownerUserId,
          organizationId: org.id,
          plan: { supportsOrganizations: true },
        },
        orderBy: { expiresAt: 'desc' },
        select: {
          plan: {
            select: {
              autoRenew: true,
            },
          },
        },
      });

      const fallbackSubscription = exactSubscription
        ? null
        : await prisma.subscription.findFirst({
            where: {
              userId: org.ownerUserId,
              plan: { supportsOrganizations: true },
            },
            orderBy: { expiresAt: 'desc' },
            select: {
              plan: {
                select: {
                  autoRenew: true,
                },
              },
            },
          });

      const latestSubscription = exactSubscription ?? fallbackSubscription;
      const shouldReset = latestSubscription?.plan
        ? await shouldResetPaidTokensOnExpiryForPlanAutoRenew(latestSubscription.plan.autoRenew)
        : true;

      return [org.id, shouldReset] as const;
    })
  );

  return Object.fromEntries(entries);
}

async function suspendOrganizationsByIds(
  orgIds: string[],
  context?: { userId?: string; reason?: string; useExpiryTokenResetPolicy?: boolean }
) {
  const uniqueOrgIds = Array.from(new Set(orgIds.filter((id) => typeof id === 'string' && id.length > 0)));
  if (uniqueOrgIds.length === 0) return;

  const providerName = workspaceService.providerName;
  const shouldDeleteProviderOrganizations = workspaceService.usesExternalProviderOrganizations;

  const orgs = await prisma.organization.findMany({
    where: { id: { in: uniqueOrgIds } },
    select: { id: true, clerkOrganizationId: true, ownerUserId: true },
  });
  if (orgs.length === 0) return;

  const tokenResetByOrgId = context?.useExpiryTokenResetPolicy
    ? await resolveSuspendedOrganizationTokenResetMap(
        orgs
          .filter((org): org is { id: string; clerkOrganizationId: string | null; ownerUserId: string } => typeof org.ownerUserId === 'string' && org.ownerUserId.length > 0)
          .map((org) => ({ id: org.id, ownerUserId: org.ownerUserId }))
      )
    : null;

  await Promise.all(
    orgs.map(async (org) => {
      if (!shouldDeleteProviderOrganizations || !org.clerkOrganizationId) return;
      try {
        await workspaceService.deleteProviderOrganization(org.clerkOrganizationId);
      } catch (err: unknown) {
        const error = toError(err);
        const message = error.message.toLowerCase();
        if (!message.includes('not found') && !message.includes('does not exist')) {
          Logger.warn('Failed to remove provider organization while suspending workspace access', {
            clerkOrganizationId: org.clerkOrganizationId,
            userId: context?.userId ?? org.ownerUserId,
            reason: context?.reason,
            error: error.message,
          });
        }
      }
    })
  );

  await prisma.organizationInvite.updateMany({
    where: { organizationId: { in: orgs.map((org) => org.id) }, status: 'PENDING' },
    data: { status: 'EXPIRED', expiresAt: new Date() },
  });

  await prisma.organization.updateMany({
    where: { id: { in: orgs.map((org) => org.id) } },
    data: {
      clerkOrganizationId: null,
    },
  });

  const orgIdsToZero = orgs
    .filter((org) => (tokenResetByOrgId ? tokenResetByOrgId[org.id] !== false : true))
    .map((org) => org.id);

  if (orgIdsToZero.length > 0) {
    await prisma.organization.updateMany({
      where: { id: { in: orgIdsToZero } },
      data: { tokenBalance: 0 },
    });
  }

  Logger.info('Suspended local organizations after losing team access', {
    userId: context?.userId,
    organizationIds: orgs.map((org) => org.id),
    tokenResetOrganizationIds: orgIdsToZero,
    reason: context?.reason,
    providerName,
  });
}

export async function deactivateOrganizationsByIds(
  orgIds: string[],
  context?: { userId?: string; reason?: string; mode?: OrganizationExpiryMode; useExpiryTokenResetPolicy?: boolean }
) {
  if (context?.mode === 'SUSPEND') {
    await suspendOrganizationsByIds(orgIds, context);
    return;
  }

  const uniqueOrgIds = Array.from(new Set(orgIds.filter((id) => typeof id === 'string' && id.length > 0)));
  if (uniqueOrgIds.length === 0) return;

  const providerName = workspaceService.providerName;
  const shouldDeleteProviderOrganizations = workspaceService.usesExternalProviderOrganizations;

  const orgs = await prisma.organization.findMany({
    where: { id: { in: uniqueOrgIds } },
    select: { id: true, clerkOrganizationId: true, ownerUserId: true },
  });
  if (orgs.length === 0) return;

  await Promise.all(
    orgs.map(async (org) => {
      if (!shouldDeleteProviderOrganizations || !org.clerkOrganizationId) return;
      try {
        await workspaceService.deleteProviderOrganization(org.clerkOrganizationId);
        Logger.info('Deleted auth provider organization after plan change', {
          userId: context?.userId ?? org.ownerUserId,
          clerkOrganizationId: org.clerkOrganizationId,
          reason: context?.reason,
        });
      } catch (err: unknown) {
        const error = toError(err);
        const msg = error.message.toLowerCase();
        if (!msg.includes('not found') && !msg.includes('does not exist')) {
          Logger.warn('Failed to delete auth provider organization during plan downgrade', {
            clerkOrganizationId: org.clerkOrganizationId,
            error: error.message,
            reason: context?.reason,
          });
        }
      }
    })
  );

  // IMPORTANT: In this schema, historical records (payments/subscriptions) can retain
  // references to an organization. Those foreign keys block deletion in SQLite/Postgres.
  // Since the user has lost team eligibility, we detach those references before deleting.
  const dbOrgIds = orgs.map((o) => o.id);
  try {
    await prisma.subscription.updateMany({
      where: { organizationId: { in: dbOrgIds } },
      data: { organizationId: null },
    });
  } catch (err: unknown) {
    Logger.warn('Failed to detach subscriptions before org teardown', {
      userId: context?.userId,
      reason: context?.reason,
      error: toError(err).message,
    });
  }

  try {
    await prisma.payment.updateMany({
      where: { organizationId: { in: dbOrgIds } },
      data: { organizationId: null },
    });
  } catch (err: unknown) {
    Logger.warn('Failed to detach payments before org teardown', {
      userId: context?.userId,
      reason: context?.reason,
      error: toError(err).message,
    });
  }

  try {
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: dbOrgIds } } });
    await prisma.organizationInvite.deleteMany({ where: { organizationId: { in: dbOrgIds } } });
  } catch (err: unknown) {
    Logger.warn('Failed to remove memberships or invites before org teardown', {
      userId: context?.userId,
      reason: context?.reason,
      error: toError(err).message,
      providerName,
    });
  }

  try {
    const result = await prisma.organization.deleteMany({ where: { id: { in: dbOrgIds } } });
    Logger.info('Removed local organizations after losing team access', {
      userId: context?.userId,
      removed: result.count,
      reason: context?.reason,
    });
  } catch (err: unknown) {
    // Fallback: even if the DB cannot delete the organization row (unexpected FK constraints),
    // ensure access is dismantled by removing memberships/invites and zeroing the pool.
    const error = toError(err);
    Logger.error('Failed to delete local organizations after losing team access', {
      userId: context?.userId,
      reason: context?.reason,
      error: error.message,
    });

    try {
      await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: dbOrgIds } } });
      await prisma.organizationInvite.deleteMany({ where: { organizationId: { in: dbOrgIds } } });
      await prisma.organization.updateMany({
        where: { id: { in: dbOrgIds } },
        data: {
          clerkOrganizationId: null,
          planId: null,
          seatLimit: null,
          tokenBalance: 0,
        },
      });
      Logger.warn('Soft-deactivated local organizations after delete failure', {
        userId: context?.userId,
        reason: context?.reason,
        organizationIds: dbOrgIds,
      });
    } catch (fallbackErr: unknown) {
      Logger.error('Failed to soft-deactivate organizations after delete failure', {
        userId: context?.userId,
        reason: context?.reason,
        error: toError(fallbackErr).message,
      });
    }
  }
}

export async function deactivateUserOrganizations(
  userId: string,
  opts?: { mode?: OrganizationExpiryMode; reason?: string; useExpiryTokenResetPolicy?: boolean }
) {
  const orgs = await prisma.organization.findMany({
    where: { ownerUserId: userId },
    select: { id: true, clerkOrganizationId: true },
  });
  if (orgs.length === 0) return;

  await deactivateOrganizationsByIds(
    orgs.map((o) => o.id),
    {
      userId,
      reason: opts?.reason ?? 'deactivateUserOrganizations',
      mode: opts?.mode,
      useExpiryTokenResetPolicy: opts?.useExpiryTokenResetPolicy,
    }
  );
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 40) || 'team'
  );
}

function validateOrgNameOrThrow(name?: string | null) {
  if (!name) return;
  const trimmed = name.trim();
  const ORG_NAME_MAX = 30;
  const ORG_NAME_RE = /^[A-Za-z0-9\-\.\s,']+$/;
  if (trimmed.length === 0 || trimmed.length > ORG_NAME_MAX || !ORG_NAME_RE.test(trimmed)) {
    throw new Error(`Invalid organization name. Must be 1-${ORG_NAME_MAX} characters and only letters, numbers, dash (-), dot (.), space, comma, and apostrophe (') are allowed.`);
  }
}

function isClerkNotFoundError(err: unknown): boolean {
  const anyErr = err as { status?: number; message?: string; errors?: Array<{ code?: string; message?: string }> } | null;
  if (anyErr?.status === 404) return true;
  const message = (anyErr?.message || '').toLowerCase();
  if (message.includes('not found')) return true;
  if (Array.isArray(anyErr?.errors)) {
    return anyErr.errors.some((entry) => (entry?.code || '').toLowerCase().includes('not_found'));
  }
  return false;
}

function extractClerkErrorInfo(err: unknown): { code?: string; traceId?: string } | null {
  try {
    // err may be an object or a JSON string containing the Clerk payload
    const parsed = typeof err === 'string' ? JSON.parse(err) : (err as Record<string, unknown>);
    const traceId = (parsed?.clerkTraceId as string | undefined) ?? (parsed?.traceId as string | undefined) ?? (parsed?.requestId as string | undefined);
    const errors = parsed?.errors as Array<{ code?: string }> | undefined;
    const code = Array.isArray(errors) && errors.length > 0 ? errors[0]?.code : undefined;
    return { code, traceId };
  } catch {
    try {
      const asString = String(err || '');
      const parsed = JSON.parse(asString);
      const traceId = parsed?.clerkTraceId ?? parsed?.traceId ?? parsed?.requestId;
      const code = Array.isArray(parsed?.errors) && parsed.errors.length > 0 ? parsed.errors[0]?.code : undefined;
      return { code, traceId };
    } catch {
      return null;
    }
  }
}

function mapRoleToClerk(role?: string | null): ClerkMembershipRole {
  return role?.toUpperCase() === 'ADMIN' ? 'org:admin' : 'org:member';
}

async function attemptCleanupClerkOrgs(userId: string, maxToDelete = 5) {
  let deleted = 0;
  try {
    if (!workspaceService.usesExternalProviderOrganizations) {
      return 0;
    }

    const orgs = await workspaceService.listProviderOrganizationsForUser(userId);

    if (orgs.length === 0) {
      Logger.info('attemptCleanupClerkOrgs: no org list method available or no orgs found for user', { userId });
      return 0;
    }

    for (const o of orgs) {
      if (!o?.id) continue;
      if (deleted >= maxToDelete) break;
      try {
        await workspaceService.deleteProviderOrganization(o.id);
        deleted += 1;
        Logger.info('attemptCleanupClerkOrgs: deleted org', { userId, clerkOrganizationId: o.id });
      } catch (err: unknown) {
        const e = toError(err);
        Logger.warn('attemptCleanupClerkOrgs: failed to delete org', { userId, clerkOrganizationId: o.id, error: e.message });
      }
    }
  } catch (err: unknown) {
    Logger.warn('attemptCleanupClerkOrgs: unexpected failure', { userId, error: toError(err).message });
  }
  return deleted;
}

async function organizationExistsInClerk(clerkOrganizationId: string): Promise<boolean> {
  try {
    const org = await workspaceService.getProviderOrganization(clerkOrganizationId);
    return !!org;
  } catch (err: unknown) {
    if (isClerkNotFoundError(err)) {
      return false;
    }
    Logger.warn('Failed to verify auth provider organization presence', {
      clerkOrganizationId,
      error: toError(err).message,
    });
    return true;
  }
}

async function repopulateClerkMembershipsFromLocal(clerkOrganizationId: string, localOrganizationId: string, ownerUserId: string) {
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId: localOrganizationId, status: 'ACTIVE' },
    select: { userId: true, role: true },
  });

  await Promise.all(
    memberships
      .filter((membership) => membership.userId && membership.userId !== ownerUserId)
      .map(async (membership) => {
        try {
          await workspaceService.createProviderMembership({
            organizationId: clerkOrganizationId,
            userId: membership.userId!,
            role: mapRoleToClerk(membership.role),
          });
        } catch (err: unknown) {
          const error = toError(err);
          if (error.message.toLowerCase().includes('already')) {
            return;
          }
          // If the auth provider complains the role param is invalid, retry without role
          try {
            const raw = JSON.parse(JSON.stringify(err)) as { errors?: ClerkErrorEntry[] } | null;
            const roleProblem = Array.isArray(raw?.errors) && raw.errors.some((entry) => entry?.meta?.paramName === 'role' || String(entry?.message ?? '').toLowerCase().includes('role'));
            if (roleProblem) {
              await workspaceService.createProviderMembership({
                organizationId: clerkOrganizationId,
                userId: membership.userId!,
                role: 'org:member',
              });
              return;
            }
          } catch {
            // fall through to logging below
          }
          Logger.warn('Failed to restore membership during recreation', {
            clerkOrganizationId,
            userId: membership.userId,
            error: error.message,
          });
        }
      })
  );
}

async function recreateClerkOrganization(params: {
  existing: { id: string; name: string; slug: string };
  userId: string;
  planId: string;
  desiredSeatLimit: number | null;
  desiredStrategy: 'SHARED_FOR_ORG' | 'ALLOCATED_PER_MEMBER';
}) {
  const slugSeed = params.existing.slug || slugify(`${params.existing.name}-${params.userId.slice(-5)}`);
  let createdOrganization: AuthOrganization | null = null;
  let attempt = 0;
  while (attempt < 5 && !createdOrganization) {
    const slug = attempt === 0 ? slugSeed : `${slugSeed}-${attempt}`;
    try {
      createdOrganization = await workspaceService.createProviderOrganization({
        name: params.existing.name,
        slug,
        createdByUserId: params.userId,
        maxAllowedMemberships: params.desiredSeatLimit ?? undefined,
        publicMetadata: {
          planId: params.planId,
          seatLimit: params.desiredSeatLimit,
          tokenPoolStrategy: params.desiredStrategy,
        },
      });
    } catch (err: unknown) {
      const error = toError(err);
      const info = extractClerkErrorInfo(err);
      if (info?.code === 'org_creation_limit_exceeded') {
        try {
          const removed = await attemptCleanupClerkOrgs(params.userId, 5);
          if (removed > 0) {
            Logger.info('recreateClerkOrganization: removed existing orgs after limit error, retrying', { userId: params.userId, removed });
            continue;
          }
        } catch (cleanupErr: unknown) {
          Logger.warn('recreateClerkOrganization: cleanup attempt failed', { userId: params.userId, error: toError(cleanupErr).message });
        }
        throw new Error(`Organization creation limit exceeded${info.traceId ? ` (trace: ${info.traceId})` : ''}`);
      }

      if (error.message.toLowerCase().includes('slug')) {
        attempt += 1;
        continue;
      }
      throw err;
    }
  }

  if (!createdOrganization) {
    throw new Error('Failed to recreate organization after missing Clerk record');
  }

  const updated = await prisma.organization.update({
    where: { id: params.existing.id },
    data: {
      clerkOrganizationId: createdOrganization.id,
      name: createdOrganization.name ?? params.existing.name,
      slug: createdOrganization.slug ?? params.existing.slug,
      planId: params.planId,
      seatLimit: params.desiredSeatLimit ?? undefined,
      tokenPoolStrategy: params.desiredStrategy,
    },
  });

  await syncOrganizationMembership({
    userId: params.userId,
    clerkOrganizationId: createdOrganization.id,
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  await repopulateClerkMembershipsFromLocal(createdOrganization.id, params.existing.id, params.userId);

  await prisma.organizationInvite.updateMany({
    where: { organizationId: params.existing.id, status: 'PENDING' },
    data: { status: 'EXPIRED', expiresAt: new Date() },
  });

  Logger.info('Recreated missing Clerk organization', {
    organizationId: updated.id,
    clerkOrganizationId: createdOrganization.id,
  });

  return updated;
}


async function updateOrganizationMetadataIfNeeded(orgId: string, params: { planId?: string | null; seatLimit?: number | null; tokenPoolStrategy?: string | null }) {
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      planId: params.planId ?? null,
      seatLimit: params.seatLimit ?? null,
      tokenPoolStrategy: normalizeTeamTokenPoolStrategy(params.tokenPoolStrategy),
    },
  });
}

async function backfillTeamBillingOrganizationLinks(params: {
  userId: string;
  planId: string;
  organizationId: string;
}) {
  const candidateSubscriptions = await prisma.subscription.findMany({
    where: {
      userId: params.userId,
      planId: params.planId,
      organizationId: null,
      status: { in: TEAM_SUB_STATUSES as unknown as string[] },
      plan: { supportsOrganizations: true },
    },
    select: { id: true },
  });

  if (candidateSubscriptions.length === 0) {
    return { subscriptionsUpdated: 0, paymentsUpdated: 0 };
  }

  const subscriptionIds = candidateSubscriptions.map((subscription) => subscription.id);
  const [subscriptionsResult, paymentsResult] = await prisma.$transaction([
    prisma.subscription.updateMany({
      where: {
        id: { in: subscriptionIds },
        organizationId: null,
      },
      data: { organizationId: params.organizationId },
    }),
    prisma.payment.updateMany({
      where: {
        subscriptionId: { in: subscriptionIds },
        organizationId: null,
      },
      data: { organizationId: params.organizationId },
    }),
  ]);

  Logger.info('Backfilled team billing organization linkage after provisioning', {
    userId: params.userId,
    organizationId: params.organizationId,
    planId: params.planId,
    subscriptionsUpdated: subscriptionsResult.count,
    paymentsUpdated: paymentsResult.count,
  });

  return {
    subscriptionsUpdated: subscriptionsResult.count,
    paymentsUpdated: paymentsResult.count,
  };
}

export async function ensureTeamOrganization(userId: string, orgName?: string) {
  const activeOwnerSubscription = await getActiveTeamSubscription(userId, {
    includeGrace: false,
    includeCancelled: false,
  });

  if (!activeOwnerSubscription?.plan) {
    throw new Error('Team plan required to provision an organization');
  }

  const providerName = workspaceService.providerName;
  const isNextAuthProvider = providerName === 'nextauth';
  const plan = activeOwnerSubscription.plan;
  const desiredSeatLimit = typeof plan.organizationSeatLimit === 'number' ? plan.organizationSeatLimit : null;
  const desiredStrategy = normalizeTeamTokenPoolStrategy(plan.organizationTokenPoolStrategy);

  // Fetch user details including token balance to handle migration
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, tokenBalance: true } });
  const userTokens = owner?.tokenBalance ?? 0;

  async function reconcileMissingTeamTokens(params: { organizationId: string }) {
    const planTokenLimit = typeof plan.tokenLimit === 'number' ? plan.tokenLimit : null;
    if (!planTokenLimit || planTokenLimit <= 0) return;

    // Only run the reconciliation if there is strong evidence tokens were never granted:
    // - org balance is 0
    // - owner personal paid balance is 0
    // - no recorded member usage exists (soft guard against re-granting after spend)
    // - at least one successful payment exists for an ACTIVE team subscription on this plan
    const [org, membershipUsageAgg, activeSub, hasSuccessfulPayment] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: params.organizationId },
        select: { id: true, tokenBalance: true }
      }),
      prisma.organizationMembership.aggregate({
        where: { organizationId: params.organizationId },
        _sum: { memberTokenUsage: true },
      }),
      prisma.subscription.findFirst({
        where: {
          userId,
          planId: plan.id,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      }),
      prisma.payment.findFirst({
        where: {
          userId,
          planId: plan.id,
          status: 'SUCCEEDED',
        },
        select: { id: true },
      }),
    ]);

    if (!org) return;
    const totalUsage = membershipUsageAgg._sum.memberTokenUsage ?? 0;
    const ownerTokenBalanceNow = owner?.tokenBalance ?? 0;

    if (org.tokenBalance !== 0) return;
    if (ownerTokenBalanceNow !== 0) return;
    if (totalUsage !== 0) return;
    if (!activeSub) return;
    if (!hasSuccessfulPayment) return;

    if (desiredStrategy === 'ALLOCATED_PER_MEMBER') {
      await prisma.organizationMembership.updateMany({
        where: { organizationId: params.organizationId, status: 'ACTIVE' },
        data: { sharedTokenBalance: planTokenLimit },
      });
    } else {
      await prisma.organization.update({
        where: { id: params.organizationId },
        data: { tokenBalance: planTokenLimit },
      });
    }

    Logger.info('Reconciled missing team tokens during provisioning', {
      userId,
      organizationId: params.organizationId,
      planId: plan.id,
      tokensSetTo: planTokenLimit,
      tokenPoolStrategy: desiredStrategy,
    });
  }

  const existing = await prisma.organization.findFirst({ where: { ownerUserId: userId } });
  if (existing) {
    const hasSharedStrategy = (existing.tokenPoolStrategy || '').toUpperCase() === 'SHARED_FOR_ORG';
    const needsMetadataUpdate =
      existing.planId !== plan.id ||
      existing.seatLimit !== desiredSeatLimit ||
      !hasSharedStrategy;

    if (isNextAuthProvider) {
      if (needsMetadataUpdate) {
        await updateOrganizationMetadataIfNeeded(existing.id, {
          planId: plan.id,
          seatLimit: desiredSeatLimit,
          tokenPoolStrategy: desiredStrategy,
        });
      }
    } else {
      const hasClerkOrg = existing.clerkOrganizationId ? await organizationExistsInClerk(existing.clerkOrganizationId) : false;
      if (!hasClerkOrg) {
        Logger.warn('Local organization missing Clerk backing record, recreating', {
          organizationId: existing.id,
          userId,
        });
        await recreateClerkOrganization({
          existing,
          userId,
          planId: plan.id,
          desiredSeatLimit,
          desiredStrategy,
        });
      } else if (needsMetadataUpdate) {
        await updateOrganizationMetadataIfNeeded(existing.id, {
          planId: plan.id,
          seatLimit: desiredSeatLimit,
          tokenPoolStrategy: desiredStrategy,
        });

        if (existing.clerkOrganizationId) {
          try {
            await workspaceService.updateProviderOrganization(existing.clerkOrganizationId, {
              maxAllowedMemberships: desiredSeatLimit ?? undefined,
              publicMetadata: {
                planId: plan.id,
                seatLimit: desiredSeatLimit,
                tokenPoolStrategy: desiredStrategy,
              },
            });
          } catch (err: unknown) {
            Logger.warn('Failed to update auth provider organization metadata during ensureTeamOrganization', {
              userId,
              organizationId: existing.id,
              error: toError(err).message,
            });
          }
        }
      }
    }

    await backfillTeamBillingOrganizationLinks({
      userId,
      planId: plan.id,
      organizationId: existing.id,
    });

    // Migrate personal tokens to organization if any exist
    if (userTokens > 0) {
      try {
        await prisma.$transaction([
          prisma.organization.update({
            where: { id: existing.id },
            data: { tokenBalance: { increment: userTokens } }
          }),
          prisma.user.update({
            where: { id: userId },
            data: { tokenBalance: 0 }
          })
        ]);
        Logger.info('Migrated personal tokens to organization', { userId, organizationId: existing.id, amount: userTokens });
      } catch (err: unknown) {
        Logger.error('Failed to migrate personal tokens to organization', { userId, organizationId: existing.id, error: toError(err).message });
      }
    }

    // If payment webhooks recorded the subscription but token crediting did not occur,
    // reconcile a missing initial pool when the workspace is provisioned.
    await reconcileMissingTeamTokens({ organizationId: existing.id });

    return await prisma.organization.findUnique({ where: { id: existing.id } });
  }

  // Use the provided organization name if given; otherwise fall back to owner name/email
  const cleanProvidedName = typeof orgName === 'string' && orgName.trim().length > 0 ? orgName.trim() : undefined;
  // Defensive validation of provided name
  validateOrgNameOrThrow(cleanProvidedName);
  const baseName = cleanProvidedName ?? (owner?.name ? `${owner.name}'s Team` : 'Team Workspace');
  const slugBase = slugify(cleanProvidedName ?? owner?.name ?? owner?.email ?? `team-${userId.slice(-5)}`);

  let createdOrganization: AuthOrganization | null = null;
  let attempt = 0;
  while (attempt < 5 && !createdOrganization) {
    const slug = attempt === 0 ? slugBase : `${slugBase}-${attempt}`;
    try {
      createdOrganization = await workspaceService.createProviderOrganization({
        name: baseName,
        slug,
        createdByUserId: userId,
        maxAllowedMemberships: desiredSeatLimit ?? undefined,
        publicMetadata: {
          planId: plan.id,
          seatLimit: desiredSeatLimit,
          tokenPoolStrategy: desiredStrategy,
        },
      });
    } catch (err: unknown) {
      const error = toError(err);
      try {
        Logger.error('createOrganization error', { userId, attempt, error: error.message, raw: JSON.stringify(err) });
      } catch {
        Logger.error('createOrganization error (failed to stringify)', { userId, attempt, error: error.message });
      }
      const info = extractClerkErrorInfo(err);
      if (info?.code === 'org_creation_limit_exceeded') {
        try {
          const removed = await attemptCleanupClerkOrgs(userId, 5);
          if (removed > 0) {
            Logger.info('ensureTeamOrganization: removed existing orgs after limit error, retrying', { userId, removed });
            attempt = 0;
            continue;
          }
        } catch (cleanupErr: unknown) {
          Logger.warn('ensureTeamOrganization: cleanup attempt failed', { userId, error: toError(cleanupErr).message });
        }
        throw new Error(`Organization creation limit exceeded${info.traceId ? ` (trace: ${info.traceId})` : ''}`);
      }
      if (!error.message.toLowerCase().includes('slug')) {
        throw err;
      }
      attempt += 1;
    }
  }

  if (!createdOrganization) {
    throw new Error('Failed to provision organization after multiple attempts');
  }

  let saved = null;
  if (isNextAuthProvider) {
    saved = await prisma.organization.update({
      where: { id: createdOrganization.id },
      data: {
        planId: plan.id,
        seatLimit: desiredSeatLimit ?? null,
        tokenPoolStrategy: desiredStrategy,
        tokenBalance: userTokens,
      },
    });
  } else {
    saved = await upsertOrganization({
      clerkOrganizationId: createdOrganization.id,
      name: createdOrganization.name,
      slug: createdOrganization.slug ?? slugBase,
      ownerUserId: userId,
      planId: plan.id,
      seatLimit: desiredSeatLimit ?? undefined,
      tokenPoolStrategy: desiredStrategy,
      tokenBalance: userTokens,
    });
  }

  if (saved?.id) {
    await backfillTeamBillingOrganizationLinks({
      userId,
      planId: plan.id,
      organizationId: saved.id,
    });
  }

  if (userTokens > 0) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { tokenBalance: 0 }
      });
      Logger.info('Zeroed personal tokens after organization creation', { userId, amount: userTokens });
    } catch (err: unknown) {
      Logger.error('Failed to zero personal tokens after organization creation', { userId, error: toError(err).message });
    }
  }

  if (isNextAuthProvider) {
    await syncOrganizationMembership({
      userId,
      organizationId: createdOrganization.id,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
  } else {
    await syncOrganizationMembership({
      userId,
      clerkOrganizationId: createdOrganization.id,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
  }

  if (saved?.id) {
    await reconcileMissingTeamTokens({ organizationId: saved.id });
  }

  return saved ?? (await prisma.organization.findUnique({ where: { clerkOrganizationId: createdOrganization.id } }));
}
