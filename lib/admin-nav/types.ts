import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { UserRole } from '@/lib/auth';
import type { ModeratorPermissions, ModeratorSection } from '@/lib/moderator';

export type AdminNavItem = {
  href: string;
  label: string;
  icon: IconDefinition;
  badge?: string;
  section?: ModeratorSection;
  adminOnly?: boolean;
};

export type AdminNavGroup = {
  title: string;
  items: AdminNavItem[];
};

export type AdminNavCounts = {
  userCount: number;
  paymentCount: number;
  ticketCount: number;
  unreadNotifications: number;
  purchasesCount: number;
  subscriptionsCount: number;
  couponCount: number;
  logCount: number;
  moderatorLogCount: number;
};

export type AdminNavActor = {
  role: UserRole;
  permissions: ModeratorPermissions;
};