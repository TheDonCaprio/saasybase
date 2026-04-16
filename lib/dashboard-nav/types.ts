import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: IconDefinition;
  badge?: string;
};

export type DashboardNavCounts = {
  teamBadge?: string;
  supportBadge?: string;
};