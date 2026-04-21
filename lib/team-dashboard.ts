import { prisma } from './prisma';
import { getOrganizationAccessSummary, type TeamSubscriptionStatus } from './organization-access';
import { getOrganizationReferenceWhere } from './organization-reference';
import type { Prisma } from '@/lib/prisma-client';

function getProviderOrganizationId(value: { providerOrganizationId?: string | null }) {
  return value.providerOrganizationId ?? null;
}

export type TeamDashboardMember = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  joinedAt: string;
  sharedTokenBalance: number;
  memberTokenCapOverride: number | null;
  memberTokenUsage: number;
  memberTokenUsageWindowStart: string | null;
  effectiveMemberCap: number | null;
  ownerExemptFromCaps: boolean;
};

export type TeamDashboardInvite = {
  id: string;
  token: string;
  email: string;
  role: string;
  status: string;
  invitedByUserId: string | null;
  invitedAt: string;
  expiresAt: string | null;
  acceptedAt: string | null;
};

export type TeamDashboardOrganization = {
  id: string;
  providerOrganizationId: string | null;
  name: string;
  slug: string;
  ownerUserId: string;
  planId: string | null;
  planName: string | null;
  planTokenName: string | null;
  seatLimit: number | null;
  tokenPoolStrategy: string;
  memberTokenCap: number | null;
  memberCapStrategy: string | null;
  memberCapResetIntervalHours: number | null;
  ownerExemptFromCaps: boolean;
  createdAt: string;
  members: TeamDashboardMember[];
  invites: TeamDashboardInvite[];
  stats: {
    memberCount: number;
    inviteCount: number;
    seatsRemaining: number | null;
  };
};

export type TeamDashboardState = {
  access: TeamSubscriptionStatus;
  organization: TeamDashboardOrganization | null;
};

type OrganizationWithRelations = Prisma.OrganizationGetPayload<{
  include: {
    plan: {
      select: {
        id: true;
        name: true;
        tokenName: true;
        tokenLimit: true;
        organizationSeatLimit: true;
        organizationTokenPoolStrategy: true;
        supportsOrganizations: true;
      };
    };
    memberships: {
      include: {
        user: {
          select: {
            id: true;
            name: true;
            email: true;
            imageUrl: true;
          };
        };
      };
      orderBy: {
        createdAt: 'asc';
      };
    };
    invites: {
      orderBy: {
        createdAt: 'desc';
      };
    };
  };
}>;

function mapOrganization(record: OrganizationWithRelations | null): TeamDashboardOrganization | null {
  if (!record) return null;

  const seatLimit = typeof record.seatLimit === 'number'
    ? record.seatLimit
    : typeof record.plan?.organizationSeatLimit === 'number'
      ? record.plan.organizationSeatLimit
      : null;

  const strategy = (
    record.plan?.organizationTokenPoolStrategy === 'ALLOCATED_PER_MEMBER'
    || record.tokenPoolStrategy === 'ALLOCATED_PER_MEMBER'
  ) ? 'ALLOCATED_PER_MEMBER' : 'SHARED_FOR_ORG';
  const orgCap = typeof record.memberTokenCap === 'number' ? record.memberTokenCap : null;
  const capStrategy = (record.memberCapStrategy || 'SOFT').toUpperCase();
  const capsDisabled = capStrategy === 'DISABLED';
  const actualPoolBalance = Math.max(0, Number(record.tokenBalance ?? 0));
  const planTokenLimit = typeof record.plan?.tokenLimit === 'number' ? record.plan.tokenLimit : null;
  const planSupportsOrganizations = record.plan?.supportsOrganizations === true;
  const hasRecordedUsage = record.memberships.some((membership) => (membership.memberTokenUsage ?? 0) > 0);
  const fallbackPoolBalance = !hasRecordedUsage && actualPoolBalance === 0 && planSupportsOrganizations && planTokenLimit != null ? planTokenLimit : null;
  const poolBalance = fallbackPoolBalance ?? actualPoolBalance;
  const capReset = typeof record.memberCapResetIntervalHours === 'number' ? record.memberCapResetIntervalHours : null;
  const nowMs = Date.now();

  const members: TeamDashboardMember[] = record.memberships.map((membership) => {
    const overrideCap = typeof membership.memberTokenCapOverride === 'number' ? membership.memberTokenCapOverride : null;
    const ownerExemptFromCaps = record.ownerExemptFromCaps === true && membership.userId === record.ownerUserId;
    const effectiveCap = ownerExemptFromCaps ? null : (capsDisabled ? null : overrideCap ?? orgCap);

    const windowStartMs = membership.memberTokenUsageWindowStart ? membership.memberTokenUsageWindowStart.getTime() : null;
    const windowExpired =
      capReset != null &&
      (windowStartMs == null || nowMs - windowStartMs >= capReset * 60 * 60 * 1000);
    const usage = windowExpired ? 0 : Math.max(0, membership.memberTokenUsage ?? 0);

    let sharedTokenBalance: number;
    if (strategy === 'ALLOCATED_PER_MEMBER') {
      const actualAllocatedBalance = Math.max(0, Number(membership.sharedTokenBalance ?? 0));
      sharedTokenBalance = actualAllocatedBalance > 0 || planTokenLimit == null
        ? actualAllocatedBalance
        : Math.max(0, planTokenLimit - usage);
    } else {
      const remaining = effectiveCap == null ? poolBalance : Math.max(0, effectiveCap - usage);
      sharedTokenBalance = Math.min(poolBalance, remaining);
    }

    return {
      id: membership.id,
      userId: membership.userId,
      name: membership.user?.name ?? null,
      email: membership.user?.email ?? null,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.createdAt.toISOString(),
      sharedTokenBalance,
      memberTokenCapOverride: overrideCap,
      memberTokenUsage: usage,
      memberTokenUsageWindowStart: windowExpired ? null : (membership.memberTokenUsageWindowStart ? membership.memberTokenUsageWindowStart.toISOString() : null),
      effectiveMemberCap: effectiveCap,
      ownerExemptFromCaps,
    };
  });

  const invites: TeamDashboardInvite[] = record.invites.map((invite) => ({
    id: invite.id,
    token: invite.token,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    invitedByUserId: invite.invitedByUserId ?? null,
    invitedAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
    acceptedAt: invite.acceptedAt ? invite.acceptedAt.toISOString() : null,
  }));

  const memberCount = members.length;
  const inviteCount = invites.length;
  const seatsRemaining = seatLimit != null ? Math.max(0, seatLimit - memberCount) : null;

  return {
    id: record.id,
    providerOrganizationId: getProviderOrganizationId({ providerOrganizationId: record.providerOrganizationId }),
    name: record.name,
    slug: record.slug,
    ownerUserId: record.ownerUserId,
    planId: record.planId,
    planName: record.plan?.name ?? null,
    planTokenName: record.plan?.tokenName ?? null,
    seatLimit,
    tokenPoolStrategy: strategy,
    memberTokenCap: orgCap,
    memberCapStrategy: capStrategy,
    memberCapResetIntervalHours: capReset,
    ownerExemptFromCaps: record.ownerExemptFromCaps ?? false,
    createdAt: record.createdAt.toISOString(),
    members,
    invites,
    stats: {
      memberCount,
      inviteCount,
      seatsRemaining,
    },
  };
}

export async function fetchTeamDashboardState(
  userId: string,
  options?: {
    forceSync?: boolean;
    activeOrganizationId?: string | null;
    activeProviderOrganizationId?: string | null;
    activeClerkOrgId?: string | null;
  }
): Promise<TeamDashboardState> {
  // NOTE: forceSync previously called syncOrganizationEligibilityForUser which can
  // DELETE organizations. A simple page-load refresh should never be destructive.
  // Org cleanup is handled by OrgValidityCheck (lazy check) and the cron job.
  // forceSync now just ensures we re-read the latest access summary (no-op beyond
  // a fresh DB query), keeping the team page read-only.

  const activeOrganizationId = options?.activeOrganizationId ?? options?.activeProviderOrganizationId ?? options?.activeClerkOrgId ?? null;

  const access = await getOrganizationAccessSummary(userId, activeOrganizationId);

  let organization: OrganizationWithRelations | null = null;
  if (access.allowed) {
    const identifier = access.kind === 'OWNER'
      ? (activeOrganizationId
        ? {
            ownerUserId: userId,
            OR: getOrganizationReferenceWhere(activeOrganizationId),
          }
        : { ownerUserId: userId })
      : { id: access.membership.organizationId };
    organization = await prisma.organization.findFirst({
      where: identifier,
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            tokenName: true,
            tokenLimit: true,
            organizationSeatLimit: true,
            organizationTokenPoolStrategy: true,
            supportsOrganizations: true,
          },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                imageUrl: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        invites: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  return {
    access,
    organization: mapOrganization(organization),
  };
}
