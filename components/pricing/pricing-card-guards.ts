import { asRecord } from '../../lib/runtime-guards';

export function isMemberLockedTeamWorkspace(payload: unknown): boolean {
  const record = asRecord(payload);
  const organization = asRecord(record?.organization);
  return record?.source === 'organization' && organization?.role === 'MEMBER';
}

type ResolveTeamPlanPurchaseDisabledArgs = {
  serverDisabled?: boolean;
  activeOrgId?: string | null;
  profileLoaded?: boolean;
  profileOrganizationId?: string | null;
  profileOrganizationRole?: string | null;
};

type ResolvePersonalPlanPurchaseDisabledArgs = {
  serverDisabled?: boolean;
  activeOrgId?: string | null;
};

type TeamPlanCopyArgs = {
  tokenLimit?: number | null;
  tokenName?: string | null;
  organizationTokenPoolStrategy?: string | null;
};

export function resolveTeamPlanPurchaseDisabled({
  serverDisabled = false,
  activeOrgId = null,
  profileLoaded = false,
  profileOrganizationId = null,
  profileOrganizationRole = null,
}: ResolveTeamPlanPurchaseDisabledArgs): boolean {
  if (serverDisabled) {
    return true;
  }

  if (!activeOrgId) {
    return false;
  }

  if (!profileLoaded) {
    return true;
  }

  return profileOrganizationId === activeOrgId && profileOrganizationRole === 'MEMBER';
}

export function resolvePersonalPlanPurchaseDisabled({
  serverDisabled = false,
  activeOrgId = null,
}: ResolvePersonalPlanPurchaseDisabledArgs): boolean {
  return serverDisabled || Boolean(activeOrgId);
}

export function getTeamTokenPoolStrategyLabel(strategy?: string | null): string {
  return strategy === 'ALLOCATED_PER_MEMBER'
    ? 'Per-member token allocation'
    : 'Shared workspace token pool';
}

export function getPlanTokenAllowanceLabel({
  tokenLimit,
  tokenName,
  organizationTokenPoolStrategy,
}: TeamPlanCopyArgs): string {
  const resolvedTokenName = tokenName && tokenName.trim().length > 0 ? tokenName : 'tokens';
  const perMember = organizationTokenPoolStrategy === 'ALLOCATED_PER_MEMBER';

  if (tokenLimit !== null && tokenLimit !== undefined) {
    return perMember
      ? `${tokenLimit.toLocaleString()} ${resolvedTokenName} per member included`
      : `${tokenLimit.toLocaleString()} ${resolvedTokenName} included`;
  }

  return perMember
    ? `Unlimited ${resolvedTokenName} per member`
    : `Unlimited ${resolvedTokenName}`;
}