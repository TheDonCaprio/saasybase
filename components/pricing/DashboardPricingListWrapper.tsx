"use client";
import React from 'react';
import PricingList from './PricingList';

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
};

type ActiveRecurringPlan = {
  planId: string;
  priceCents: number | null;
  recurringInterval: string | null;
} | null;

interface DashboardPricingListWrapperProps {
  plans: DBPlan[];
  activeRecurringPlan?: ActiveRecurringPlan;
  scheduledPlanId?: string | null;
  gridClasses?: {
    oneTime?: string;
    recurring?: string;
  };
  currency: string;
}

export default function DashboardPricingListWrapper({ plans, activeRecurringPlan = null, scheduledPlanId, gridClasses, currency }: DashboardPricingListWrapperProps) {
  return <PricingList plans={plans} activeRecurringPlan={activeRecurringPlan} scheduledPlanId={scheduledPlanId} gridClasses={gridClasses} currency={currency} />;
}
