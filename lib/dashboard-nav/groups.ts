import { buildDashboardNavItems } from './items';
import type { DashboardNavCounts, DashboardNavItem } from './types';

export function buildDashboardSidebarItems(input: {
  counts: DashboardNavCounts;
}): DashboardNavItem[] {
  return buildDashboardNavItems(input.counts);
}