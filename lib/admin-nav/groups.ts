import { buildAdminNavItems } from './items';
import type { AdminNavActor, AdminNavCounts, AdminNavGroup, AdminNavItem } from './types';

export function filterAdminNavItemsForActor(items: AdminNavItem[], actor: AdminNavActor): AdminNavItem[] {
  return items.filter((item) => {
    if (item.adminOnly && actor.role !== 'ADMIN') {
      return false;
    }

    if (item.section && actor.role !== 'ADMIN' && !actor.permissions[item.section]) {
      return false;
    }

    return true;
  });
}

export function buildAdminNavGroups(items: AdminNavItem[]): AdminNavGroup[] {
  const groups: AdminNavGroup[] = [
    {
      title: 'Overview',
      items: items.filter((item) => item.href === '/admin'),
    },
    {
      title: 'Users & Access',
      items: items.filter((item) => ['/admin/users', '/admin/organizations', '/admin/moderation'].includes(item.href)),
    },
    {
      title: 'Finances',
      items: items.filter((item) =>
        ['/admin/transactions', '/admin/purchases', '/admin/subscriptions', '/admin/coupons'].includes(item.href)
      ),
    },
    {
      title: 'Platform',
      items: items.filter((item) =>
        ['/admin/theme', '/admin/pages', '/admin/blog', '/admin/plans', '/admin/emails', '/admin/settings'].includes(item.href)
      ),
    },
    {
      title: 'Support & Analytics',
      items: items.filter((item) =>
        ['/admin/support', '/admin/notifications', '/admin/analytics', '/admin/traffic'].includes(item.href)
      ),
    },
    {
      title: 'Developer',
      items: items.filter((item) => ['/admin/logs', '/admin/maintenance', '/admin/system'].includes(item.href)),
    },
  ];

  return groups.filter((group) => group.items.length > 0);
}

export function buildAdminSidebarGroups(input: {
  actor: AdminNavActor;
  counts: AdminNavCounts;
}): AdminNavGroup[] {
  const items = buildAdminNavItems(input.counts);
  return buildAdminNavGroups(filterAdminNavItemsForActor(items, input.actor));
}