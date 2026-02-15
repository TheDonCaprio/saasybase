"use client";
import React from 'react';
import PricingCard from './PricingCard';

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

type ActiveRecurringPlan = {
  planId: string;
  priceCents: number | null;
} | null;

interface PricingListProps {
  plans: DBPlan[];
  activeRecurringPlan?: ActiveRecurringPlan;
  scheduledPlanId?: string | null;
  gridClasses?: {
    oneTime?: string;
    recurring?: string;
  };
  /** Currency code for price display (e.g., 'USD', 'NGN'). Passed from server. */
  currency: string;
}

export default function PricingList({ plans, activeRecurringPlan, scheduledPlanId, gridClasses, currency }: PricingListProps) {
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
            <PricingCard key={p.id} plan={p} activeRecurringPlan={activeRecurringPlan ?? null} scheduledPlanId={scheduledPlanId} currency={currency} />
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
            <PricingCard key={p.id} plan={p} activeRecurringPlan={activeRecurringPlan ?? null} scheduledPlanId={scheduledPlanId} currency={currency} />
          ))}
        </div>
      )}
    </div>
  );
}
