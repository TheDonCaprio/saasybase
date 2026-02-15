import React from 'react';
import DashboardPricingListWrapper from './DashboardPricingListWrapper';
import { getPricingSettings, generatePricingGridClasses } from '../../lib/settings';
import { getActiveCurrency } from '../../lib/payment/registry';

// Server wrapper around client PricingList. This file is a server component
// that simply returns the client component with props. Next.js allows server
// components to directly import client components when rendered inside an
// async server component page.

// Keep a local copy of the DBPlan shape so we can localize the cast at the
// server -> client boundary instead of using `any`.
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

interface DashboardPricingListServerWrapperProps {
  plans: unknown[];
  activeRecurringPlan?: ActiveRecurringPlan;
  scheduledPlanId?: string | null;
}

export default async function DashboardPricingListServerWrapper({ plans, activeRecurringPlan = null, scheduledPlanId }: DashboardPricingListServerWrapperProps) {
  // Localized cast: callers pass `unknown[]` to this server wrapper (from DB
  // layers); cast here to the client component's expected `DBPlan[]`.
  const typedPlans = plans as DBPlan[];
  
  // Fetch pricing layout settings and generate grid classes
  const pricingSettings = await getPricingSettings();
  const oneTimePlans = typedPlans.filter(p => !p.autoRenew);
  const recurringPlans = typedPlans.filter(p => p.autoRenew);
  const gridClasses = {
    oneTime: oneTimePlans.length > 0 ? generatePricingGridClasses(oneTimePlans.length, pricingSettings.maxColumns, pricingSettings.centerUneven) : undefined,
    recurring: recurringPlans.length > 0 ? generatePricingGridClasses(recurringPlans.length, pricingSettings.maxColumns, pricingSettings.centerUneven) : undefined,
  };
  
  // Resolve currency on server and pass to client for consistent display
  const currency = getActiveCurrency();
  
  return <DashboardPricingListWrapper plans={typedPlans} activeRecurringPlan={activeRecurringPlan} scheduledPlanId={scheduledPlanId} gridClasses={gridClasses} currency={currency} />;
}
