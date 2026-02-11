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
} | null;

interface DashboardPricingListWrapperProps {
  plans: DBPlan[];
  activeRecurringPlan?: ActiveRecurringPlan;
  gridClasses?: {
    oneTime?: string;
    recurring?: string;
  };
  currency: string;
}

export default function DashboardPricingListWrapper({ plans, activeRecurringPlan = null, gridClasses, currency }: DashboardPricingListWrapperProps) {
  return <PricingList plans={plans} activeRecurringPlan={activeRecurringPlan} gridClasses={gridClasses} currency={currency} />;
}
