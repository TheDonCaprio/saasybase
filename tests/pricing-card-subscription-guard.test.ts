import { describe, expect, it } from 'vitest';

import { asRecord } from '../lib/runtime-guards';
import { getPlanTokenAllowanceLabel, getTeamTokenPoolStrategyLabel, isMemberLockedTeamWorkspace, resolvePersonalPlanPurchaseDisabled, resolveTeamPlanPurchaseDisabled } from '../components/pricing/pricing-card-guards';

function hasPendingProviderConfirmation(payload: unknown): boolean {
  const record = asRecord(payload);
  const pending = asRecord(record?.pending);
  return pending?.pendingConfirmation === true;
}

function getPendingProviderConfirmationPlanName(payload: unknown): string | null {
  const record = asRecord(payload);
  const pending = asRecord(record?.pending);
  return typeof pending?.plan === 'string' ? pending.plan : null;
}

describe('pricing card subscription guard', () => {
  it('blocks new plan actions when a provider-confirmation pending subscription exists', () => {
    expect(hasPendingProviderConfirmation({
      active: true,
      plan: '24 Hour Team Pro',
      pending: {
        id: 'sub_pending_1',
        plan: '24 Hour Team',
        pendingConfirmation: true,
      },
    })).toBe(true);
  });

  it('does not block ordinary queued pending subscriptions', () => {
    expect(hasPendingProviderConfirmation({
      active: true,
      plan: '24 Hour Team Pro',
      pending: {
        id: 'sub_pending_2',
        plan: '24 Hour Team',
        pendingConfirmation: false,
      },
    })).toBe(false);
  });

  it('extracts the pending confirmation plan name for disabled CTA messaging', () => {
    expect(getPendingProviderConfirmationPlanName({
      pending: {
        id: 'sub_pending_1',
        plan: '24 Hour Team',
        pendingConfirmation: true,
      },
    })).toBe('24 Hour Team');
  });

  it('detects member-managed workspace context for team plan guards', () => {
    expect(isMemberLockedTeamWorkspace({
      source: 'organization',
      organization: {
        id: 'org_1',
        role: 'MEMBER',
      },
    })).toBe(true);

    expect(isMemberLockedTeamWorkspace({
      source: 'organization',
      organization: {
        id: 'org_1',
        role: 'OWNER',
      },
    })).toBe(false);
  });

  it('keeps team checkout disabled until workspace role is resolved client-side', () => {
    expect(resolveTeamPlanPurchaseDisabled({
      serverDisabled: false,
      activeOrgId: 'org_1',
      profileLoaded: false,
      profileOrganizationId: null,
      profileOrganizationRole: null,
    })).toBe(true);

    expect(resolveTeamPlanPurchaseDisabled({
      serverDisabled: false,
      activeOrgId: 'org_1',
      profileLoaded: true,
      profileOrganizationId: 'org_1',
      profileOrganizationRole: 'MEMBER',
    })).toBe(true);

    expect(resolveTeamPlanPurchaseDisabled({
      serverDisabled: false,
      activeOrgId: 'org_1',
      profileLoaded: true,
      profileOrganizationId: 'org_1',
      profileOrganizationRole: 'OWNER',
    })).toBe(false);
  });

  it('keeps personal checkout disabled whenever an organization workspace is active', () => {
    expect(resolvePersonalPlanPurchaseDisabled({
      serverDisabled: false,
      activeOrgId: 'org_1',
    })).toBe(true);

    expect(resolvePersonalPlanPurchaseDisabled({
      serverDisabled: false,
      activeOrgId: null,
    })).toBe(false);
  });

  it('uses per-member copy for allocated workspace token strategies', () => {
    expect(getTeamTokenPoolStrategyLabel('ALLOCATED_PER_MEMBER')).toBe('Per-member token allocation');
    expect(getPlanTokenAllowanceLabel({
      tokenLimit: 150,
      tokenName: 'Exports',
      organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
    })).toBe('150 Exports per member included');
  });

  it('keeps shared-pool copy for default workspace token strategies', () => {
    expect(getTeamTokenPoolStrategyLabel('SHARED_FOR_ORG')).toBe('Shared workspace token pool');
    expect(getPlanTokenAllowanceLabel({
      tokenLimit: 150,
      tokenName: 'Exports',
      organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
    })).toBe('150 Exports included');
  });
});