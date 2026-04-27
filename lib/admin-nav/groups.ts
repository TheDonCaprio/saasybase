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
      title: 'Revenue',
      items: items.filter((item) =>
        ['/admin/transactions', '/admin/purchases', '/admin/subscriptions', '/admin/coupons'].includes(item.href)
      ),
    },
    {
      title: 'Publishing',
      items: items.filter((item) =>
        ['/admin/pages', '/admin/blog'].includes(item.href)
      ),
    },
    {
      title: 'Messaging',
      items: items.filter((item) =>
        ['/admin/emails', '/admin/notifications', '/admin/support'].includes(item.href)
      ),
    },
    {
      title: 'Growth & Analytics',
      items: items.filter((item) => ['/admin/analytics', '/admin/traffic'].includes(item.href)),
    },
    {
      title: 'Product Setup',
      items: items.filter((item) => ['/admin/plans', '/admin/theme'].includes(item.href)),
    },
    {
      title: 'System',
      items: items.filter((item) => ['/admin/settings', '/admin/logs', '/admin/system', '/admin/maintenance'].includes(item.href)),
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