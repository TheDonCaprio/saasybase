import { clerkClient } from '@clerk/nextjs/server';
import { prisma } from './prisma';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import { upsertOrganization, syncOrganizationMembership } from './teams';
import { getPaidTokensNaturalExpiryGraceHours } from './settings';

const TEAM_SUB_STATUSES = ['ACTIVE', 'PENDING', 'CANCELLED', 'PAST_DUE'] as const;
type ClerkMembershipRole = 'org:admin' | 'org:member';
type ClerkApi = Awaited<ReturnType<typeof clerkClient>>;
type ClerkOrganizationResource = Awaited<ReturnType<ClerkApi['organizations']['createOrganization']>>;
type ClerkErrorEntry = { meta?: { paramName?: string }; message?: string };

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

export async function getActiveTeamSubscription(userId: string, opts?: { includeGrace?: boolean }) {
  const now = new Date();

  const baseInclude = {
    plan: {
      select: {
        id: true,
        name: true,
        tokenLimit: true,
        organizationSeatLimit: true,
        organizationTokenPoolStrategy: true,
        supportsOrganizations: true,
      },
    },
  } as const;

  if (!opts?.includeGrace) {
    return prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: TEAM_SUB_STATUSES as unknown as string[] },
        expiresAt: { gt: now },
        plan: { supportsOrganizations: true },
      },
      orderBy: { expiresAt: 'desc' },
      include: baseInclude,
    });
  }

  const graceHours = await getPaidTokensNaturalExpiryGraceHours();
  const graceCutoff = new Date(now.getTime() - graceHours * 60 * 60 * 1000);

  return prisma.subscription.findFirst({
    where: {
      userId,
      plan: { supportsOrganizations: true },
      OR: [
        // Any non-EXPIRED subscription with time remaining still confers org access.
        {
          status: { not: 'EXPIRED' },
          expiresAt: { gt: now },
        },
        // After wall-clock expiry, keep org access during the grace window.
        // Include CANCELLED (cancel-at-period-end that has reached its end) and
        // PAST_DUE (payment issues unresolved by period end) — not just EXPIRED.
        {
          status: { in: ['EXPIRED', 'CANCELLED', 'PAST_DUE'] },
          expiresAt: { gt: graceCutoff, lte: now },
        },
      ],
    },
    orderBy: { expiresAt: 'desc' },
    include: baseInclude,
  });
}

export async function getOrganizationAccessSummary(userId: string): Promise<TeamSubscriptionStatus> {
  const subscription = await getActiveTeamSubscription(userId, { includeGrace: true });
  if (subscription && subscription.plan) {
    return { allowed: true, kind: 'OWNER', subscription, plan: subscription.plan };
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      organization: {
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
  const subscription = await getActiveTeamSubscription(userId, { includeGrace: !opts?.ignoreGrace });
  if (subscription && subscription.plan) {
    return { allowed: true, kind: 'OWNER', subscription, plan: subscription.plan } satisfies TeamSubscriptionStatus;
  }
  await deactivateUserOrganizations(userId);
  return { allowed: false, reason: 'NO_PLAN' } satisfies TeamSubscriptionStatus;
}

export async function deactivateOrganizationsByIds(orgIds: string[], context?: { userId?: string; reason?: string }) {
  const uniqueOrgIds = Array.from(new Set(orgIds.filter((id) => typeof id === 'string' && id.length > 0)));
  if (uniqueOrgIds.length === 0) return;

  const orgs = await prisma.organization.findMany({
    where: { id: { in: uniqueOrgIds } },
    select: { id: true, clerkOrganizationId: true, ownerUserId: true },
  });
  if (orgs.length === 0) return;

  await Promise.all(
    orgs.map(async (org) => {
      if (!org.clerkOrganizationId) return;
      try {
        const client = await clerkClient();
        await client.organizations.deleteOrganization(org.clerkOrganizationId);
        Logger.info('Deleted Clerk organization after plan change', {
          userId: context?.userId ?? org.ownerUserId,
          clerkOrganizationId: org.clerkOrganizationId,
          reason: context?.reason,
        });
      } catch (err: unknown) {
        const error = toError(err);
        const msg = error.message.toLowerCase();
        if (!msg.includes('not found') && !msg.includes('does not exist')) {
          Logger.warn('Failed to delete Clerk organization during plan downgrade', {
            clerkOrganizationId: org.clerkOrganizationId,
            error: error.message,
            reason: context?.reason,
          });
        }
      }
    })
  );

  const result = await prisma.organization.deleteMany({ where: { id: { in: orgs.map((o) => o.id) } } });
  Logger.info('Removed local organizations after losing team access', {
    userId: context?.userId,
    removed: result.count,
    reason: context?.reason,
  });
}

export async function deactivateUserOrganizations(userId: string) {
  const orgs = await prisma.organization.findMany({
    where: { ownerUserId: userId },
    select: { id: true, clerkOrganizationId: true },
  });
  if (orgs.length === 0) return;

  await deactivateOrganizationsByIds(
    orgs.map((o) => o.id),
    { userId, reason: 'deactivateUserOrganizations' }
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
    const client = await clerkClient();
    // Try a few common SDK method names to list organizations. This is defensive
    // because Clerk SDK surface can vary across versions.
    const orgs: Array<{ id?: string; created_by?: string; createdBy?: string }> = [];

    const tryList = async (fnName: string, args: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (client.organizations as any)[fnName];
      if (typeof fn !== 'function') return null;
      try {
        const res = await fn.call(client.organizations, args || {});
        return res;
      } catch {
        return null;
      }
    };

    // common variants
    const candidates = [
      await tryList('listOrganizations', { created_by: userId }),
      await tryList('list', { created_by: userId }),
      await tryList('getOrganizationList', { createdBy: userId }),
      await tryList('getOrganizations', { createdBy: userId }),
    ];

    for (const c of candidates) {
      if (!c) continue;
      // If SDK returned a paginated object, try to pick items
      const items = Array.isArray(c) ? c : Array.isArray((c as { data: unknown }).data) ? (c as { data: unknown[] }).data : null;
      if (items && items.length > 0) {
        orgs.push(...(items as Array<{ id?: string; created_by?: string; createdBy?: string }>));
        break;
      }
    }

    // Fallback: try fetching the user and see if Clerk returns organization info
    if (orgs.length === 0) {
      try {
        const u = await client.users.getUser(userId);
        // Some SDK versions may include memberships or organization list on the user
        const maybeOrgs = (u as unknown as Record<string, unknown>).organizations || (u as unknown as Record<string, unknown>).organization_memberships || (u as unknown as Record<string, unknown>).orgs;
        if (Array.isArray(maybeOrgs) && maybeOrgs.length > 0) {
          orgs.push(...maybeOrgs.map((o: { id?: string; organization_id?: string; organizationId?: string }) => ({ id: o.id || o.organization_id || o.organizationId })));
        }
      } catch {
        // ignore
      }
    }

    // If still nothing, give up but log.
    if (orgs.length === 0) {
      Logger.info('attemptCleanupClerkOrgs: no Clerk org list method available or no orgs found for user', { userId });
      return 0;
    }

    for (const o of orgs) {
      if (!o?.id) continue;
      if (deleted >= maxToDelete) break;
      try {
        await client.organizations.deleteOrganization(o.id);
        deleted += 1;
        Logger.info('attemptCleanupClerkOrgs: deleted Clerk org', { userId, clerkOrganizationId: o.id });
      } catch (err: unknown) {
        const e = toError(err);
        Logger.warn('attemptCleanupClerkOrgs: failed to delete Clerk org', { userId, clerkOrganizationId: o.id, error: e.message });
      }
    }
  } catch (err: unknown) {
    Logger.warn('attemptCleanupClerkOrgs: unexpected failure', { userId, error: toError(err).message });
  }
  return deleted;
}

async function organizationExistsInClerk(clerkOrganizationId: string): Promise<boolean> {
  try {
    const client = await clerkClient();
    await client.organizations.getOrganization({ organizationId: clerkOrganizationId });
    return true;
  } catch (err: unknown) {
    if (isClerkNotFoundError(err)) {
      return false;
    }
    Logger.warn('Failed to verify Clerk organization presence', {
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
          const client = await clerkClient();
          await client.organizations.createOrganizationMembership({
            organizationId: clerkOrganizationId,
            userId: membership.userId!,
            role: mapRoleToClerk(membership.role),
          });
        } catch (err: unknown) {
          const error = toError(err);
          if (error.message.toLowerCase().includes('already')) {
            return;
          }
          // If Clerk complains the role param is invalid for this org, retry without role
          try {
            const raw = JSON.parse(JSON.stringify(err)) as { errors?: ClerkErrorEntry[] } | null;
            const roleProblem = Array.isArray(raw?.errors) && raw.errors.some((entry) => entry?.meta?.paramName === 'role' || String(entry?.message ?? '').toLowerCase().includes('role'));
            if (roleProblem) {
              // Clerk may reject a role parameter for some orgs; call with an any-typed params
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const params: any = { organizationId: clerkOrganizationId, userId: membership.userId! };
              const client = await clerkClient();
              await client.organizations.createOrganizationMembership(params);
              return;
            }
          } catch {
            // fall through to logging below
          }
          Logger.warn('Failed to restore Clerk membership during recreation', {
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
}) {
  const desiredStrategy = 'SHARED_FOR_ORG';
  const slugSeed = params.existing.slug || slugify(`${params.existing.name}-${params.userId.slice(-5)}`);
  let createdOrganization: ClerkOrganizationResource | null = null;
  let attempt = 0;
  while (attempt < 5 && !createdOrganization) {
    const slug = attempt === 0 ? slugSeed : `${slugSeed}-${attempt}`;
    try {
      const client = await clerkClient();
      createdOrganization = await client.organizations.createOrganization({
        name: params.existing.name,
        slug,
        createdBy: params.userId,
        maxAllowedMemberships: params.desiredSeatLimit ?? undefined,
        publicMetadata: {
          planId: params.planId,
          seatLimit: params.desiredSeatLimit,
          tokenPoolStrategy: desiredStrategy,
        },
      });
    } catch (err: unknown) {
      const error = toError(err);
      // If Clerk explicitly reports a creation limit, fail fast with a clearer message
      const info = extractClerkErrorInfo(err);
      if (info?.code === 'org_creation_limit_exceeded') {
        // Try best-effort cleanup of any existing Clerk organizations for this user,
        // which can free their creation quota. If we delete something, allow
        // the recreate loop to try again; otherwise fail immediately with a
        // descriptive error.
        try {
          const removed = await attemptCleanupClerkOrgs(params.userId, 5);
          if (removed > 0) {
            Logger.info('recreateClerkOrganization: removed existing Clerk orgs after limit error, retrying', { userId: params.userId, removed });
            // continue loop and try again without throwing
            continue;
          }
        } catch (cleanupErr: unknown) {
          Logger.warn('recreateClerkOrganization: cleanup attempt failed', { userId: params.userId, error: toError(cleanupErr).message });
        }
        throw new Error(`Clerk organization creation limit exceeded${info.traceId ? ` (trace: ${info.traceId})` : ''}`);
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
      tokenPoolStrategy: desiredStrategy,
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


async function updateOrganizationMetadataIfNeeded(orgId: string, params: { planId?: string | null; seatLimit?: number | null }) {
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      planId: params.planId ?? null,
      seatLimit: params.seatLimit ?? null,
      tokenPoolStrategy: 'SHARED_FOR_ORG',
    },
  });
}

export async function ensureTeamOrganization(userId: string, orgName?: string) {
  const access = await getOrganizationAccessSummary(userId);
  if (!access.allowed || access.kind !== 'OWNER') {
    throw new Error('Team plan required to provision an organization');
  }

  const plan = access.plan;
  const desiredSeatLimit = typeof plan.organizationSeatLimit === 'number' ? plan.organizationSeatLimit : null;
  const desiredStrategy = 'SHARED_FOR_ORG';

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

    await prisma.organization.update({
      where: { id: params.organizationId },
      data: { tokenBalance: planTokenLimit },
    });

    Logger.warn('Reconciled missing team tokens during provisioning', {
      userId,
      organizationId: params.organizationId,
      planId: plan.id,
      tokensSetTo: planTokenLimit,
    });
  }

  const existing = await prisma.organization.findFirst({ where: { ownerUserId: userId } });
  if (existing) {
    // ... (existing logic for Clerk check) ...
    const hasClerkOrg = existing.clerkOrganizationId ? await organizationExistsInClerk(existing.clerkOrganizationId) : false;
    if (!hasClerkOrg) {
      Logger.warn('Local organization missing Clerk backing record, recreating', {
        organizationId: existing.id,
        userId,
      });
      // If recreating, we should also migrate tokens if needed, but recreateClerkOrganization
      // updates the existing record. We can handle token migration after this block or inside.
      // Let's do it after to be safe and consistent.
      await recreateClerkOrganization({
        existing,
        userId,
        planId: plan.id,
        desiredSeatLimit,
      });
      // Fall through to token migration below
    } else {
      // ... (existing metadata update logic) ...
      const hasSharedStrategy = (existing.tokenPoolStrategy || '').toUpperCase() === 'SHARED_FOR_ORG';
      const needsMetadataUpdate =
        existing.planId !== plan.id ||
        existing.seatLimit !== desiredSeatLimit ||
        !hasSharedStrategy;

      if (needsMetadataUpdate) {
        await updateOrganizationMetadataIfNeeded(existing.id, {
          planId: plan.id,
          seatLimit: desiredSeatLimit,
        });

        if (existing.clerkOrganizationId) {
          try {
            const client = await clerkClient();
            await client.organizations.updateOrganization(existing.clerkOrganizationId, {
              maxAllowedMemberships: desiredSeatLimit ?? undefined,
              publicMetadata: {
                planId: plan.id,
                seatLimit: desiredSeatLimit,
                tokenPoolStrategy: desiredStrategy,
              },
            });
          } catch (err: unknown) {
            Logger.warn('Failed to update Clerk organization metadata during ensureTeamOrganization', {
              userId,
              organizationId: existing.id,
              error: toError(err).message,
            });
          }
        }
      }
    }

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

  let createdOrganization: ClerkOrganizationResource | null = null;
  let attempt = 0;
  while (attempt < 5 && !createdOrganization) {
    const slug = attempt === 0 ? slugBase : `${slugBase}-${attempt}`;
    try {
      const client = await clerkClient();
      createdOrganization = await client.organizations.createOrganization({
        name: baseName,
        slug,
        createdBy: userId,
        maxAllowedMemberships: desiredSeatLimit ?? undefined,
        publicMetadata: {
          planId: plan.id,
          seatLimit: desiredSeatLimit,
          tokenPoolStrategy: desiredStrategy,
        },
      });
    } catch (err: unknown) {
      const error = toError(err);
      // Log full error details to help diagnose permission/forbidden responses from Clerk
      try {
        Logger.error('Clerk createOrganization error', { userId, attempt, error: error.message, raw: JSON.stringify(err) });
      } catch {
        Logger.error('Clerk createOrganization error (failed to stringify)', { userId, attempt, error: error.message });
      }
      // If Clerk explicitly reports a creation limit, fail fast with a clearer message
      const info = extractClerkErrorInfo(err);
      if (info?.code === 'org_creation_limit_exceeded') {
        try {
          const removed = await attemptCleanupClerkOrgs(userId, 5);
          if (removed > 0) {
            Logger.info('ensureTeamOrganization: removed existing Clerk orgs after limit error, retrying', { userId, removed });
            // reset attempt counter so we can try fresh slugs again
            attempt = 0;
            continue;
          }
        } catch (cleanupErr: unknown) {
          Logger.warn('ensureTeamOrganization: cleanup attempt failed', { userId, error: toError(cleanupErr).message });
        }
        throw new Error(`Clerk organization creation limit exceeded${info.traceId ? ` (trace: ${info.traceId})` : ''}`);
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

  const saved = await upsertOrganization({
    clerkOrganizationId: createdOrganization.id,
    name: createdOrganization.name,
    slug: createdOrganization.slug ?? slugBase,
    ownerUserId: userId,
    planId: plan.id,
    seatLimit: desiredSeatLimit ?? undefined,
    tokenPoolStrategy: desiredStrategy,
    tokenBalance: userTokens, // Initialize with user tokens instead of plan limit
  });

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

  await syncOrganizationMembership({
    userId,
    clerkOrganizationId: createdOrganization.id,
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  if (saved?.id) {
    await reconcileMissingTeamTokens({ organizationId: saved.id });
  }

  return saved ?? (await prisma.organization.findUnique({ where: { clerkOrganizationId: createdOrganization.id } }));
}
