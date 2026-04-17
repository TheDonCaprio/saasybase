"use client";
import React from 'react';
import PricingList from './PricingList';
import type { ActiveRecurringPlansByFamily, ScheduledPlanIdsByFamily } from '../../lib/pricing-card-status';

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

interface DashboardPricingListWrapperProps {
  plans: DBPlan[];
  activeRecurringPlansByFamily?: ActiveRecurringPlansByFamily;
  scheduledPlanIdsByFamily?: ScheduledPlanIdsByFamily;
  gridClasses?: {
    oneTime?: string;
    recurring?: string;
  };
  currency: string;
  teamPlanPurchaseDisabled?: boolean;
  teamPlanPurchaseDisabledMessage?: string;
  personalPlanPurchaseDisabled?: boolean;
  personalPlanPurchaseDisabledMessage?: string;
}

export default function DashboardPricingListWrapper({ plans, activeRecurringPlansByFamily, scheduledPlanIdsByFamily, gridClasses, currency, teamPlanPurchaseDisabled = false, teamPlanPurchaseDisabledMessage, personalPlanPurchaseDisabled = false, personalPlanPurchaseDisabledMessage }: DashboardPricingListWrapperProps) {
  return <PricingList plans={plans} activeRecurringPlansByFamily={activeRecurringPlansByFamily} scheduledPlanIdsByFamily={scheduledPlanIdsByFamily} gridClasses={gridClasses} currency={currency} teamPlanPurchaseDisabled={teamPlanPurchaseDisabled} teamPlanPurchaseDisabledMessage={teamPlanPurchaseDisabledMessage} personalPlanPurchaseDisabled={personalPlanPurchaseDisabled} personalPlanPurchaseDisabledMessage={personalPlanPurchaseDisabledMessage} />;
}
