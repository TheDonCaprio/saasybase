"use client";
import React, { useEffect } from 'react';
import PricingCard from './PricingCard';
import type { ActiveRecurringPlansByFamily, ScheduledPlanIdsByFamily } from '../../lib/pricing-card-status';
import { useAuthSession } from '@/lib/auth-provider/client';
import { useUserProfile } from '../UserProfileProvider';
import { resolvePersonalPlanPurchaseDisabled, resolveTeamPlanPurchaseDisabled } from './pricing-card-guards';

type DBPlan = {
  id: string;
  name: string;
  description?: string | null;
  priceCents: number;
  durationHours: number;
  autoRenew: boolean;
  recurringInterval?: string | null;
  tokenLimit?: number | null;
  tokenName?: string | null;
  supportsOrganizations?: boolean | null;
  organizationSeatLimit?: number | null;
  organizationTokenPoolStrategy?: string | null;
};

interface PricingListProps {
  plans: DBPlan[];
  activeRecurringPlansByFamily?: ActiveRecurringPlansByFamily;
  scheduledPlanIdsByFamily?: ScheduledPlanIdsByFamily;
  gridClasses?: {
    oneTime?: string;
    recurring?: string;
  };
  /** Currency code for price display (e.g., 'USD', 'NGN'). Passed from server. */
  currency: string;
  teamPlanPurchaseDisabled?: boolean;
  teamPlanPurchaseDisabledMessage?: string;
  personalPlanPurchaseDisabled?: boolean;
  personalPlanPurchaseDisabledMessage?: string;
  demoReadOnlyMode?: boolean;
}

export default function PricingList({ plans, activeRecurringPlansByFamily, scheduledPlanIdsByFamily, gridClasses, currency, teamPlanPurchaseDisabled = false, teamPlanPurchaseDisabledMessage, personalPlanPurchaseDisabled = false, personalPlanPurchaseDisabledMessage, demoReadOnlyMode = false }: PricingListProps) {
  const { orgId, isSignedIn, isLoaded: authLoaded } = useAuthSession();
  const { profile, loaded: profileLoaded, loading: profileLoading, ensureProfile } = useUserProfile();
  const activeOrganizationId = profile?.organization?.id ?? orgId ?? null;

  useEffect(() => {
    if (!authLoaded || !isSignedIn || !orgId || profileLoaded || profileLoading) {
      return;
    }

    void ensureProfile({ retryOnUnauthorized: true, delayMs: 600 });
  }, [authLoaded, ensureProfile, isSignedIn, orgId, profileLoaded, profileLoading]);

  const effectiveTeamPlanPurchaseDisabled = resolveTeamPlanPurchaseDisabled({
    serverDisabled: teamPlanPurchaseDisabled,
    activeOrgId: orgId,
    profileLoaded,
    profileOrganizationId: profile?.organization?.id ?? null,
    profileOrganizationRole: profile?.organization?.role ?? null,
  });
  const effectivePersonalPlanPurchaseDisabled = resolvePersonalPlanPurchaseDisabled({
    serverDisabled: personalPlanPurchaseDisabled,
    activeOrgId: orgId,
  });
  const effectiveTeamPlanPurchaseDisabledMessage = orgId && !profileLoaded && !teamPlanPurchaseDisabled
    ? 'Checking workspace billing permissions...'
    : teamPlanPurchaseDisabledMessage;
  const effectivePersonalPlanPurchaseDisabledMessage = personalPlanPurchaseDisabledMessage
    ?? 'Personal plans can only be purchased from your personal workspace. Switch out of this organization workspace and try again.';

  // Split plans into recurring and one-time (subscriptions first)
  const recurringPlans = plans.filter(p => p.autoRenew).slice().sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0));
  const oneTimePlans = plans.filter(p => !p.autoRenew).slice().sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0));

  // Default grid classes if none provided (maintains backward compatibility)
  const defaultGridClasses = "grid gap-6 grid-cols-[repeat(auto-fit,minmax(300px,1fr))]";
  const oneTimeGridClasses = gridClasses?.oneTime || defaultGridClasses;
  const recurringGridClasses = gridClasses?.recurring || defaultGridClasses;

  return (
    <div className="flex flex-col gap-6">
      {recurringPlans.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-slate-200 dark:bg-neutral-800" />
          <div className="text-xs uppercase text-slate-500 dark:text-neutral-400">Recurring subscriptions</div>
          <div className="h-px flex-1 bg-slate-200 dark:bg-neutral-800" />
        </div>
      )}

      {recurringPlans.length > 0 && (
        <div className={recurringGridClasses}>
          {recurringPlans.map(p => (
            <PricingCard key={p.id} plan={p} activeRecurringPlansByFamily={activeRecurringPlansByFamily} scheduledPlanIdsByFamily={scheduledPlanIdsByFamily} currency={currency} activeOrganizationId={activeOrganizationId} teamPlanPurchaseDisabled={effectiveTeamPlanPurchaseDisabled} teamPlanPurchaseDisabledMessage={effectiveTeamPlanPurchaseDisabledMessage} personalPlanPurchaseDisabled={effectivePersonalPlanPurchaseDisabled} personalPlanPurchaseDisabledMessage={effectivePersonalPlanPurchaseDisabledMessage} demoReadOnlyMode={demoReadOnlyMode} />
          ))}
        </div>
      )}

      {recurringPlans.length > 0 && oneTimePlans.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-slate-200 dark:bg-neutral-800" />
          <div className="text-xs uppercase text-slate-500 dark:text-neutral-400">One-time access</div>
          <div className="h-px flex-1 bg-slate-200 dark:bg-neutral-800" />
        </div>
      )}

      {oneTimePlans.length > 0 && (
        <div className={oneTimeGridClasses}>
          {oneTimePlans.map(p => (
            <PricingCard key={p.id} plan={p} activeRecurringPlansByFamily={activeRecurringPlansByFamily} scheduledPlanIdsByFamily={scheduledPlanIdsByFamily} currency={currency} activeOrganizationId={activeOrganizationId} teamPlanPurchaseDisabled={effectiveTeamPlanPurchaseDisabled} teamPlanPurchaseDisabledMessage={effectiveTeamPlanPurchaseDisabledMessage} personalPlanPurchaseDisabled={effectivePersonalPlanPurchaseDisabled} personalPlanPurchaseDisabledMessage={effectivePersonalPlanPurchaseDisabledMessage} demoReadOnlyMode={demoReadOnlyMode} />
          ))}
        </div>
      )}
    </div>
  );
}
