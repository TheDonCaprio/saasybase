import React from 'react';
import { SidebarNav } from '../../../components/dashboard/SidebarNav';
import { prisma } from '../../../lib/prisma';
import { authService } from '@/lib/auth-provider';
import { AnnouncementBanner } from '../../../components/ui/AnnouncementBanner';
import { GracePeriodNotice } from '../../../components/dashboard/GracePeriodNotice';
import { PurchaseNotice } from '../../../components/dashboard/PurchaseNotice';
import { getAnnouncementMessage } from '../../../lib/settings';
import { getOrganizationSuspensionMessage } from '../../../lib/account-suspension';
import { getPendingEmailChangeForUser } from '../../../lib/nextauth-email-verification';
import { PendingEmailChangeNotice } from '../../../components/dashboard/PendingEmailChangeNotice';
import { getCurrentUserWithFallback } from '../../../lib/user-helpers';
import { DemoReadOnlyNotice } from '../../../components/ui/DemoReadOnlyNotice';
import { Logger } from '../../../lib/logger';

import { SidebarFooter } from '../../../components/dashboard/SidebarFooter';
import { buildDashboardSidebarItems } from '../../../lib/dashboard-nav/groups';
import type { DashboardNavCounts } from '../../../lib/dashboard-nav/types';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const demoReadOnlyMode = process.env.DEMO_READ_ONLY_MODE === 'true';
  // Middleware handles authentication protection
  // Only authenticated users will reach this component

  // Get announcement message from settings
  const announcementMessage = await getAnnouncementMessage();

  // Basic navigation without user-specific stats for now
  // Determine whether the current user has any NEW admin replies
  let supportBadge: string | undefined = undefined;
  let teamBadge: string | undefined = undefined;
  let pendingEmailChange: { newEmail: string; expires: string } | null = null;
  let suspendedOrganizationNotice: string | null = null;
  try {
    const { userId, orgId } = await authService.getSession();
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

      // This ensures the user exists in our DB and that their token balance is evaluated
      // (and potentially reset) on every visit without spiking performance, as it efficiently
      // leverages caching and minimal checks.
      const viewer = await getCurrentUserWithFallback();

      if (viewer?.email) {
        const pendingTeamInvites = await prisma.organizationInvite.count({
          where: {
            email: viewer.email,
            status: 'PENDING',
          },
        });
        if (pendingTeamInvites > 0) {
          teamBadge = 'NEW';
        }
      }

      if (authService.providerName === 'nextauth') {
        const pending = await getPendingEmailChangeForUser(userId);
        if (pending) {
          pendingEmailChange = {
            newEmail: pending.newEmail,
            expires: pending.expires.toLocaleString(),
          };
        }
      }

      if (orgId) {
        const activeOrganization = await prisma.organization.findFirst({
          where: {
            OR: [
              { id: orgId },
              { clerkOrganizationId: orgId },
            ],
          },
          select: {
            suspendedAt: true,
          },
        });

        if (activeOrganization?.suspendedAt) {
          suspendedOrganizationNotice = await getOrganizationSuspensionMessage();
        }
      }
    }
  } catch (err) {
    Logger.warn('Failed to compute support badge', err);
  }

  const counts: DashboardNavCounts = {
    teamBadge,
    supportBadge,
  };

  const nav = buildDashboardSidebarItems({
    counts,
  });

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
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Dashboard</div>
          <SidebarNav items={nav} />
        </div>
        <div className="p-4 mt-auto">
          <SidebarFooter />
        </div>
      </aside>

      <main className="flex-1 min-w-0 w-full max-w-none px-3 py-3 sm:px-4 lg:px-4 lg:py-3">
        {demoReadOnlyMode && <DemoReadOnlyNotice scope="dashboard" />}
        <GracePeriodNotice />
        <AnnouncementBanner message={announcementMessage} />
        <PurchaseNotice />
        {suspendedOrganizationNotice && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            {suspendedOrganizationNotice}
          </div>
        )}
        {pendingEmailChange && (
          <PendingEmailChangeNotice pendingEmail={pendingEmailChange.newEmail} expiresAt={pendingEmailChange.expires} />
        )}
        <div className="min-w-0 w-full space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
