import { prisma } from './prisma';
import { getActiveTeamSubscription, getOrganizationAccessSummary } from './organization-access';
import type { Prisma } from '@prisma/client';

export const PLAN_WITH_BILLING_FIELDS = {
  id: true,
  name: true,
  shortDescription: true,
  description: true,
  priceCents: true,
  durationHours: true,
  autoRenew: true,
  recurringInterval: true,
  tokenLimit: true,
  tokenName: true,
  organizationTokenPoolStrategy: true,
} as const;

export type PlanWithBillingFields = Prisma.PlanGetPayload<{ select: typeof PLAN_WITH_BILLING_FIELDS }>;
export type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{
  include: { plan: { select: typeof PLAN_WITH_BILLING_FIELDS } };
}>;

const ORGANIZATION_WITH_PLAN_SELECT = {
  id: true,
  name: true,
  slug: true,
  ownerUserId: true,
  seatLimit: true,
  tokenBalance: true,
  tokenPoolStrategy: true,
  memberTokenCap: true,
  memberCapStrategy: true,
  memberCapResetIntervalHours: true,
  ownerExemptFromCaps: true,
  planId: true,
  plan: {
    select: PLAN_WITH_BILLING_FIELDS,
  },
} as const;

export type OrganizationWithPlan = Prisma.OrganizationGetPayload<{ select: typeof ORGANIZATION_WITH_PLAN_SELECT }>;

const MEMBERSHIP_WITH_CAPS_SELECT = {
  id: true,
  role: true,
  status: true,
  sharedTokenBalance: true,
  memberTokenCapOverride: true,
  memberTokenUsageWindowStart: true,
  memberTokenUsage: true,
} as const;

export type OrganizationMembershipWithCaps = Prisma.OrganizationMembershipGetPayload<{
  select: typeof MEMBERSHIP_WITH_CAPS_SELECT;
}>;

export type OrganizationPlanContext = {
  role: 'OWNER' | 'MEMBER';
  organization: OrganizationWithPlan;
  membership: OrganizationMembershipWithCaps | null;
  effectivePlan: PlanWithBillingFields;
};

export async function getOrganizationPlanContext(userId: string, activeOrganizationId?: string | null): Promise<OrganizationPlanContext | null> {
  const hasActiveOrganizationId = typeof activeOrganizationId === 'string' && activeOrganizationId.trim().length > 0;
  if (!hasActiveOrganizationId) {
    return null;
  }

  const access = await getOrganizationAccessSummary(userId, activeOrganizationId);
  if (!access.allowed) return null;

  const where = access.kind === 'OWNER'
    ? {
        ownerUserId: userId,
        OR: [
          { id: activeOrganizationId },
          { clerkOrganizationId: activeOrganizationId },
        ],
      }
    : { id: access.membership.organizationId };
  const organization = await prisma.organization.findFirst({
    where,
    select: ORGANIZATION_WITH_PLAN_SELECT,
  });

  if (!organization) {
    return null;
  }

  const effectiveTeamSubscription = access.kind === 'OWNER'
    ? access.subscription
    : await getActiveTeamSubscription(organization.ownerUserId, { includeGrace: true });
  const effectivePlan = effectiveTeamSubscription?.plan ?? organization.plan;

  if (!effectivePlan) {
    return null;
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      organizationId: organization.id,
      userId,
    },
    select: MEMBERSHIP_WITH_CAPS_SELECT,
  });

  return {
    role: access.kind,
    organization,
    membership,
    effectivePlan,
  };
}

export type CapStrategy = 'SOFT' | 'HARD' | 'DISABLED';

const CAP_STRATEGIES: CapStrategy[] = ['SOFT', 'HARD', 'DISABLED'];

export function getMemberCapStrategy(context: OrganizationPlanContext | null): CapStrategy | null {
  if (!context) return null;
  const raw = (context.organization.memberCapStrategy || 'SOFT').toString().toUpperCase();
  return (CAP_STRATEGIES.includes(raw as CapStrategy) ? raw : 'SOFT') as CapStrategy;
}

export function getEffectiveMemberTokenCap(context: OrganizationPlanContext | null): number | null {
  if (!context) return null;
  if (getMemberCapStrategy(context) === 'DISABLED') {
    return null;
  }
  if (context.role === 'OWNER' && context.organization.ownerExemptFromCaps === true) {
    return null;
  }
  const override = context.membership?.memberTokenCapOverride;
  if (typeof override === 'number') {
    return override;
  }
  const orgCap = context.organization.memberTokenCap;
  return typeof orgCap === 'number' ? orgCap : null;
}

export function getMemberSharedTokenBalance(context: OrganizationPlanContext | null): number | null {
  if (!context) return null;
  const poolBalance = Math.max(0, Number(context.organization.tokenBalance ?? 0));
  const cap = getEffectiveMemberTokenCap(context);
  if (cap == null) {
    return poolBalance;
  }

  const membership = context.membership;
  const resetHours = typeof context.organization.memberCapResetIntervalHours === 'number'
    ? context.organization.memberCapResetIntervalHours
    : null;

  const now = Date.now();
  const windowStartMs = membership?.memberTokenUsageWindowStart ? membership.memberTokenUsageWindowStart.getTime() : null;
  const windowExpired =
    resetHours != null &&
    (windowStartMs == null || now - windowStartMs >= resetHours * 60 * 60 * 1000);

  const usage = windowExpired ? 0 : Math.max(0, Number(membership?.memberTokenUsage ?? 0));
  const remainingCap = Math.max(0, cap - usage);
  return Math.min(poolBalance, remainingCap);
}

type FreePlanShape = {
  tokenLimit: number;
  renewalType: 'unlimited' | 'monthly' | 'one-time';
  tokenName: string;
};

export type PlanDisplay = {
  planName: string;
  planSource: 'PERSONAL' | 'ORGANIZATION' | 'FREE';
  statusValue: string;
  statusHelper: string;
  tokenLabel: string;
  tokenStatValue: string;
  tokenStatHelper: string;
  tokenLimit: number | null;
  isUnlimitedPersonalPlan: boolean;
  tokenPoolStrategy: 'SHARED_FOR_ORG' | null;
  sharedTokenBalance: number | null;
  workspace?: {
    id: string;
    name: string;
    role: 'OWNER' | 'MEMBER';
  };
  memberCapSummary?: {
    cap: number | null;
    strategy: CapStrategy | null;
    label: string;
    helper: string;
  };
};

const numberFormatter = new Intl.NumberFormat('en-US');

export function buildPlanDisplay(params: {
  subscription: SubscriptionWithPlan | null;
  organizationContext: OrganizationPlanContext | null;
  userTokenBalance: number;
  userFreeTokenBalance: number;
  freePlanSettings: FreePlanShape;
  defaultTokenLabel: string;
}): PlanDisplay {
  const { subscription, organizationContext, userTokenBalance, userFreeTokenBalance, freePlanSettings, defaultTokenLabel } = params;

  const planSource: 'PERSONAL' | 'ORGANIZATION' | 'FREE' = subscription
    ? 'PERSONAL'
    : organizationContext
      ? 'ORGANIZATION'
      : 'FREE';

  const workspace = organizationContext
    ? {
      id: organizationContext.organization.id,
      name: organizationContext.organization.name,
      role: organizationContext.role,
    }
    : undefined;

  const rawTokenName =
    subscription?.plan?.tokenName ??
    organizationContext?.effectivePlan?.tokenName ??
    organizationContext?.organization.plan?.tokenName ??
    freePlanSettings.tokenName ??
    defaultTokenLabel;

  const tokenNameNormalized = (rawTokenName || defaultTokenLabel || 'tokens').toString().trim() || defaultTokenLabel || 'tokens';
  const tokenLabel = tokenNameNormalized.charAt(0).toUpperCase() + tokenNameNormalized.slice(1);
  const tokenLower = tokenNameNormalized.toLowerCase();
  const isUnlimitedPersonalPlan = planSource === 'PERSONAL' && subscription?.plan?.tokenLimit == null;

  let tokenLimit: number | null;
  if (subscription?.plan?.tokenLimit != null) {
    tokenLimit = Number(subscription.plan.tokenLimit);
  } else if (organizationContext?.effectivePlan?.tokenLimit != null) {
    tokenLimit = Number(organizationContext.effectivePlan.tokenLimit);
  } else if (organizationContext?.organization.plan?.tokenLimit != null) {
    tokenLimit = Number(organizationContext.organization.plan.tokenLimit);
  } else if (planSource === 'FREE') {
    tokenLimit = freePlanSettings.renewalType === 'unlimited' ? null : Number(freePlanSettings.tokenLimit ?? 0);
  } else {
    tokenLimit = null;
  }

  const sharedTokenBalance = organizationContext ? getMemberSharedTokenBalance(organizationContext) : null;
  const memberCap = organizationContext ? getEffectiveMemberTokenCap(organizationContext) : null;
  const memberCapStrategy = organizationContext ? getMemberCapStrategy(organizationContext) : null;
  const memberCapLabel = memberCap != null ? numberFormatter.format(memberCap) : 'Unlimited';

  const formattedPaidBalance = isUnlimitedPersonalPlan
    ? 'Unlimited'
    : numberFormatter.format(Math.max(0, userTokenBalance));
  const formattedFreeBalance = numberFormatter.format(Math.max(0, userFreeTokenBalance));
  // const combinedBalance = Math.max(0, userTokenBalance + userFreeTokenBalance);
  // const formattedCombined = numberFormatter.format(combinedBalance);
  const tokenLimitDisplay = tokenLimit != null ? numberFormatter.format(tokenLimit) : 'Unlimited';

  let tokenStatValue: string;
  let tokenStatHelper: string;

  if (sharedTokenBalance != null) {
    tokenStatValue = `${numberFormatter.format(sharedTokenBalance)} shared`;
    const strategyLabel = (memberCapStrategy ?? 'SOFT').toLowerCase();
    let capHelper: string;
    if (memberCap != null) {
      capHelper = `Workspace cap per member: ${memberCapLabel} ${tokenLower} (${strategyLabel} mode)`;
    } else if (memberCapStrategy === 'DISABLED') {
      capHelper = 'Workspace member caps disabled';
    } else {
      capHelper = 'Workspace plan currently has no per-member cap';
    }
    tokenStatHelper = `Workspace pool managed by ${organizationContext!.organization.name}. ${capHelper}`;
  } else {
    tokenStatValue = `${formattedPaidBalance} paid • ${formattedFreeBalance} free`;
    if (isUnlimitedPersonalPlan) {
      tokenStatHelper = `Unlimited ${tokenLower} while your subscription is active`;
    } else if (tokenLimit != null) {
      if (planSource === 'FREE') {
        tokenStatHelper = `Free users receive ${tokenLimitDisplay} ${tokenLower}`;
      } else if (planSource === 'ORGANIZATION') {
        tokenStatHelper = `Workspace shares ${tokenLimitDisplay} ${tokenLower} across the team`;
      } else {
        tokenStatHelper = `Out of ${tokenLimitDisplay} ${tokenLower}`;
      }
    } else {
      if (planSource === 'FREE') {
        tokenStatHelper =
          freePlanSettings.renewalType === 'unlimited'
            ? `Unlimited ${tokenLower} for free users`
            : `Free users receive ${numberFormatter.format(freePlanSettings.tokenLimit)} ${tokenLower}`;
      } else if (planSource === 'ORGANIZATION') {
        tokenStatHelper = 'Workspace plan currently has no per-member cap';
      } else {
        tokenStatHelper = `No maximum set for your ${tokenLower}`;
      }
    }
  }

  let statusHelper: string;
  if (subscription) {
    statusHelper = subscription.canceledAt
      ? 'Auto-renew disabled — access ends after this cycle.'
      : subscription.plan?.autoRenew
        ? 'Auto-renew enabled.'
        : 'Renew manually when needed.';
  } else if (organizationContext) {
    statusHelper =
      organizationContext.role === 'OWNER'
        ? `${organizationContext.organization.name} workspace plan.`
        : `${organizationContext.organization.name} covers your Pro access.`;
    statusHelper += ' Shared token pool available.';
  } else {
    statusHelper = 'Upgrade to unlock premium features.';
  }

  const planName =
    subscription?.plan?.name ??
    (organizationContext ? `${organizationContext.effectivePlan?.name ?? organizationContext.organization.plan?.name ?? 'Team Plan'} (Workspace)` : 'Free Tier');

  const statusValue = subscription ? 'Active subscription' : organizationContext ? 'Workspace access' : 'Free tier';

  return {
    planName,
    planSource,
    statusValue,
    statusHelper,
    tokenLabel,
    tokenStatValue,
    tokenStatHelper,
    tokenLimit,
    isUnlimitedPersonalPlan,
    tokenPoolStrategy: organizationContext ? 'SHARED_FOR_ORG' : null,
    sharedTokenBalance,
    workspace,
    memberCapSummary: organizationContext
      ? {
        cap: memberCap,
        strategy: memberCapStrategy,
        label: memberCap != null ? `${memberCapLabel} ${tokenLower}` : 'Unlimited',
        helper:
          memberCap != null
            ? `Workspace cap per member: ${memberCapLabel} ${tokenLower} (${(memberCapStrategy ?? 'SOFT').toLowerCase()} mode)`
            : memberCapStrategy === 'DISABLED'
              ? 'Workspace member caps disabled'
              : 'Workspace has not set a per-member cap',
      }
      : undefined,
  };
}
