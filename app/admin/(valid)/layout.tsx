export const dynamic = 'force-dynamic';
import React from 'react';
import { GroupedSidebarNav } from '../../../components/dashboard/GroupedSidebarNav';
import { SidebarFooter } from '../../../components/dashboard/SidebarFooter';
import { requireAdminAreaActor } from '../../../lib/route-guards';
import { prisma } from '../../../lib/prisma';
import { DemoReadOnlyNotice } from '../../../components/ui/DemoReadOnlyNotice';
import { buildAdminSidebarGroups } from '../../../lib/admin-nav/groups';
import type { AdminNavCounts } from '../../../lib/admin-nav/types';
import { Logger } from '../../../lib/logger';

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
    Logger.warn('Failed to load admin counts for sidebar', e);
  }
  const counts: AdminNavCounts = {
    userCount,
    paymentCount: payCount,
    ticketCount,
    unreadNotifications,
    purchasesCount,
    subscriptionsCount,
    couponCount,
    logCount,
    moderatorLogCount,
  };

  const navGroups = buildAdminSidebarGroups({
    actor,
    counts,
  });

  return (
    <div className="min-h-screen w-full lg:flex lg:gap-3">
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
