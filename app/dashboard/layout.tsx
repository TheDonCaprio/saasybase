import React from 'react';
import { SidebarNav } from '../../components/dashboard/SidebarNav';
import { faPlay, faUser, faUserShield, faFileInvoiceDollar, faHistory, faBell, faLifeRing, faBars, faTicketAlt, faSackDollar, faFlask } from '@fortawesome/free-solid-svg-icons';
import { prisma } from '../../lib/prisma';
import { authService } from '@/lib/auth-provider';
import { AuthSignOutButton } from '@/lib/auth-provider/client';
import { AnnouncementBanner } from '../../components/ui/AnnouncementBanner';
import { GracePeriodNotice } from '../../components/dashboard/GracePeriodNotice';
import { PurchaseNotice } from '../../components/dashboard/PurchaseNotice';
import { getAnnouncementMessage } from '../../lib/settings';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Middleware handles authentication protection
  // Only authenticated users will reach this component

  // Get announcement message from settings
  const announcementMessage = await getAnnouncementMessage();

  // Basic navigation without user-specific stats for now
  // Determine whether the current user has any NEW admin replies
  let supportBadge: string | undefined = undefined;
  let couponBadge: string | undefined = undefined;
  try {
    const { userId } = await authService.getSession();
    if (userId) {
      // Find if any ticket for this user has at least one admin reply created after the ticket
      const hasNew = await prisma.supportTicket.findFirst({
        where: {
          userId,
          replies: {
            some: {
              user: { role: 'ADMIN' },
              // reply created after the ticket createdAt
              // Prisma doesn't allow comparing related record fields directly in SQLite, so fetch by existence of any admin reply
            }
          }
        },
        select: { id: true }
      });

      if (hasNew) {
        // For now, use 'NEW' when any admin reply exists for any ticket. This matches the per-ticket unreadReplies heuristic used elsewhere.
        supportBadge = 'NEW';
      }

      const pendingCoupons = await prisma.couponRedemption.count({ where: { userId, consumedAt: null } });
      if (pendingCoupons > 0) {
        couponBadge = String(pendingCoupons);
      }
    }
  } catch (err) {
    console.warn('Failed to compute support badge:', err);
  }

  const nav = [
    { href: '/dashboard', label: 'SaaSyApp', icon: faFlask },
    { href: '/dashboard/onboarding', label: 'Get Started', icon: faPlay },
    { href: '/dashboard/profile', label: 'Profile & Settings', icon: faUser },
    { href: '/dashboard/plan', label: 'Plan', icon: faBars },
    { href: '/dashboard/billing', label: 'Billing', icon: faFileInvoiceDollar },
    { href: '/dashboard/coupons', label: 'Coupons', icon: faTicketAlt, badge: couponBadge },
    { href: '/dashboard/transactions', label: 'Transactions', icon: faSackDollar },
    { href: '/dashboard/team', label: 'Team', icon: faUserShield },
    { href: '/dashboard/activity', label: 'Activity', icon: faHistory },
    { href: '/dashboard/support', label: 'Support', icon: faLifeRing, badge: supportBadge },
    { href: '/dashboard/notifications', label: 'Notifications', icon: faBell },
  ];
  return (
    <div className="-mx-6 lg:mx-0 lg:flex lg:gap-3 min-h-screen">
      {/* Desktop Sidebar */}
      <aside
        className="hidden lg:block w-56 flex-shrink-0 bg-[color:var(--theme-sidebar-bg)] lg:min-h-screen -mt-6 -ml-6 -mb-6"
        style={{ borderRight: '1px solid var(--theme-sidebar-border)' }}
      >
        <div className="space-y-4 pr-4 pb-4 pt-10 pl-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Dashboard</div>
          <SidebarNav items={nav} />
          <div className="pt-4 border-t border-neutral-700">
            <AuthSignOutButton>
              <button className="text-sm text-neutral-400 hover:text-white">
                Sign Out
              </button>
            </AuthSignOutButton>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-3 py-2 sm:px-4 lg:px-4 lg:py-3 max-w-none w-full">
        <GracePeriodNotice />
        <AnnouncementBanner message={announcementMessage} />
        <PurchaseNotice />
        <div className="space-y-6 w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
