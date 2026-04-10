export const dynamic = 'force-dynamic';
import React from 'react';
import { GroupedSidebarNav } from '../../../components/dashboard/GroupedSidebarNav';
import { faTachometerAlt, faUsers, faFileInvoiceDollar, faListAlt, faLifeRing, faBell, faChartLine, faTrafficLight, faClipboardList, faCogs, faShoppingCart, faTicketAlt, faTriangleExclamation, faEnvelope, faUserShield, faPalette, faFileLines, faNewspaper, faSitemap, faWrench } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { SidebarFooter } from '../../../components/dashboard/SidebarFooter';
import { requireAdminAreaActor } from '../../../lib/route-guards';
import { prisma } from '../../../lib/prisma';
import type { ModeratorSection } from '../../../lib/moderator';
import { DemoReadOnlyNotice } from '../../../components/ui/DemoReadOnlyNotice';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const demoReadOnlyMode = process.env.DEMO_READ_ONLY_MODE === 'true';
  const actor = await requireAdminAreaActor();
  let userCount = 0; let payCount = 0; let ticketCount = 0; let unreadNotifications = 0; let purchasesCount = 0; let subscriptionsCount = 0; let couponCount = 0; let logCount = 0; let moderatorLogCount = 0;
  try {
    const [users, pays, tickets, notifications, purchases, subscriptions, coupons] = await Promise.all([
      prisma.user.count(),
      prisma.payment.count(),
      prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      prisma.notification.count({ where: { read: false } }),
  // One-time purchases: payments attached to non-autoRenew plans (same filter used by admin/purchases API)
  // Match admin/purchases route: include payments that either have a subscription whose plan is non-autoRenew,
  // or payments with no subscription but a direct plan that is non-autoRenew.
  prisma.payment.count({ where: { OR: [ { subscription: { plan: { autoRenew: false } } }, { AND: [ { subscriptionId: null }, { plan: { autoRenew: false } } ] } ] } }),
  prisma.subscription.count({ where: { plan: { autoRenew: true } } }),
      prisma.coupon.count(),
    ]);
    userCount = users; payCount = pays; ticketCount = tickets; unreadNotifications = notifications; purchasesCount = purchases; subscriptionsCount = subscriptions; couponCount = coupons;

    const systemLogDelegate = (prisma as unknown as { systemLog?: { count?: (args?: unknown) => Promise<number> } }).systemLog;
    if (systemLogDelegate?.count) {
      logCount = await systemLogDelegate.count({ where: { level: { in: ['error', 'warn'] } } });
    }

    const moderatorLogDelegate = (prisma as unknown as { adminActionLog?: { count?: (args?: unknown) => Promise<number> } }).adminActionLog;
    if (moderatorLogDelegate?.count) {
      moderatorLogCount = await moderatorLogDelegate.count();
    }
  } catch (e) {
    // Swallow errors to avoid breaking admin layout if counts fail
    console.warn('Failed to load admin counts for sidebar:', e);
  }
  type NavCandidate = {
    href: string;
    label: string;
    icon: IconDefinition;
    badge?: string;
    section?: ModeratorSection;
    adminOnly?: boolean;
  };

  const navCandidates: NavCandidate[] = [
    { href: '/admin', label: 'Overview', icon: faTachometerAlt },
    { href: '/admin/users', label: 'Users', badge: String(userCount), icon: faUsers, section: 'users' },
    { href: '/admin/organizations', label: 'Organizations', icon: faSitemap, section: 'organizations' },
    { href: '/admin/transactions', label: 'Transactions', badge: String(payCount), icon: faFileInvoiceDollar, section: 'transactions' },
    { href: '/admin/purchases', label: 'One-Time Sales', badge: purchasesCount > 0 ? String(purchasesCount) : undefined, icon: faShoppingCart, section: 'purchases' },
    { href: '/admin/subscriptions', label: 'Subscriptions', badge: subscriptionsCount > 0 ? String(subscriptionsCount) : undefined, icon: faClipboardList, section: 'subscriptions' },
    { href: '/admin/coupons', label: 'Coupons', badge: couponCount > 0 ? String(couponCount) : undefined, icon: faTicketAlt, adminOnly: true },
    { href: '/admin/theme', label: 'Theme', icon: faPalette, adminOnly: true },
    { href: '/admin/pages', label: 'Pages', icon: faFileLines, adminOnly: true },
    { href: '/admin/blog', label: 'Blog', icon: faNewspaper, adminOnly: true },
    { href: '/admin/plans', label: 'Plans', icon: faListAlt, adminOnly: true },
    { href: '/admin/logs', label: 'Logs', badge: logCount > 0 ? String(logCount) : undefined, icon: faTriangleExclamation, adminOnly: true },
    { href: '/admin/moderation', label: 'Moderation', badge: moderatorLogCount > 0 ? String(Math.min(moderatorLogCount, 99)) : undefined, icon: faUserShield, adminOnly: true },
    { href: '/admin/support', label: 'Support', badge: ticketCount > 0 ? String(ticketCount) : undefined, icon: faLifeRing, section: 'support' },
    { href: '/admin/notifications', label: 'Notifications', badge: unreadNotifications > 0 ? String(unreadNotifications) : undefined, icon: faBell, section: 'notifications' },
  { href: '/admin/emails', label: 'Email Templates', icon: faEnvelope, adminOnly: true },
    { href: '/admin/analytics', label: 'Analytics', icon: faChartLine, section: 'analytics' },
    { href: '/admin/traffic', label: 'Traffic', icon: faTrafficLight, section: 'traffic' },
    { href: '/admin/api', label: 'API Docs', icon: faListAlt, adminOnly: true },
    { href: '/admin/maintenance', label: 'Maintenance', icon: faWrench, adminOnly: true },
    { href: '/admin/settings', label: 'Settings', icon: faCogs, adminOnly: true }
  ];

  const nav = navCandidates.filter((item) => {
    if (item.adminOnly && actor.role !== 'ADMIN') {
      return false;
    }
    if (item.section && actor.role !== 'ADMIN' && !actor.permissions[item.section]) {
      return false;
    }
    return true;
  });

  // Organize nav items into groups
  type NavGroup = {
    title: string;
    items: typeof nav;
  };

  const navGroups: NavGroup[] = [
    {
      title: 'Overview',
      items: nav.filter(item => item.href === '/admin'),
    },
    {
      title: 'Users & Access',
      items: nav.filter(item => ['/admin/users', '/admin/organizations', '/admin/moderation'].includes(item.href)),
    },
    {
      title: 'Finances',
      items: nav.filter(item => ['/admin/transactions', '/admin/purchases', '/admin/subscriptions', '/admin/coupons'].includes(item.href)),
    },
    {
      title: 'Platform',
      items: nav.filter(item => ['/admin/theme', '/admin/pages', '/admin/blog', '/admin/plans', '/admin/emails', '/admin/settings'].includes(item.href)),
    },
    {
      title: 'Support & Analytics',
      items: nav.filter(item => ['/admin/support', '/admin/notifications', '/admin/analytics', '/admin/traffic'].includes(item.href)),
    },
    {
      title: 'Developer',
      items: nav.filter(item => ['/admin/api', '/admin/logs', '/admin/maintenance'].includes(item.href)),
    },
  ].filter(group => group.items.length > 0);

  return (
    <div className="min-h-screen w-full overflow-x-clip lg:flex lg:gap-3">
      {/* Desktop Sidebar */}
      {/* Desktop Sidebar Placeholder (to keep layout in place) */}
      <div className="hidden lg:block w-64 flex-shrink-0" />
      
      {/* Desktop Sidebar (Fixed) */}
      <aside
        className="theme-shadow-sidebar hidden lg:flex flex-col w-64 bg-[color:var(--theme-sidebar-bg)] fixed left-0 top-0 h-screen border-r border-[color:var(--theme-sidebar-border)] z-30"
      >
        {/* Spacer for header (approximating dynamic header height) */}
        <div className="h-16 flex-shrink-0" />
        
        <div className="flex-1 flex flex-col px-4 overflow-y-auto custom-scrollbar space-y-4 pt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Admin</div>
          <GroupedSidebarNav groups={navGroups} />
        </div>
        <div className="p-4 mt-auto">
          <SidebarFooter />
        </div>
      </aside>
      
      <main className="relative flex-1 min-w-0 w-full max-w-none px-3 py-3 sm:px-4 lg:px-4 lg:py-3">
  {demoReadOnlyMode && <DemoReadOnlyNotice scope="admin" />}
  {/* background gradients removed here - using root-level gradient in app/layout.tsx instead */}
        <div className="relative space-y-6 w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
