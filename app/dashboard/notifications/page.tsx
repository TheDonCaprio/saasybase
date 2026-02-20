import { prisma } from '../../../lib/prisma';
import { PaginatedNotificationList } from '../../../components/dashboard/PaginatedNotificationList';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import { dashboardMutedPanelClass } from '../../../components/dashboard/dashboardSurfaces';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '../../../lib/route-guards';
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Notifications',
    description: 'Stay in the loop with billing updates, support replies, and product announcements tailored to your account.',
    audience: 'user',
  });
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const returnPath = buildReturnPath('/dashboard/notifications', resolvedSearchParams);
  const { userId } = await requireAuth(returnPath);

  const page = 1;
  const limit = 50;
  const skip = (page - 1) * limit;

  const [notifications, totalCount, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        message: true,
        type: true,
        read: true,
        createdAt: true
      }
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, read: false } })
  ]);

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        accent="indigo"
        eyebrow="Inbox"
        eyebrowIcon="🔔"
        title="Notifications"
        actions={
          <div className="text-xs text-slate-500 dark:text-neutral-400">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </div>
        }
        stats={[
          {
            label: 'Total notifications',
            value: totalCount,
            helper: totalCount > 0 ? 'Latest 50 are shown below' : 'We’ll notify you when something needs attention',
            tone: 'slate',
          },
          {
            label: 'Unread',
            value: unreadCount,
            helper: unreadCount > 0 ? 'Clear them or keep them for reference' : 'No pending alerts',
            tone: unreadCount > 0 ? 'indigo' : 'emerald',
          },
        ]}
      >

      </DashboardPageHeader>

      {totalCount === 0 ? (
        <div className={dashboardMutedPanelClass('text-center text-sm text-slate-600 dark:text-neutral-300')}>
          <div className="mb-2 text-base font-medium text-slate-800 dark:text-neutral-100">No notifications yet</div>
          <p>You&apos;ll receive alerts for billing updates, support replies, and important account changes.</p>
        </div>
      ) : (
        <PaginatedNotificationList
          initialNotifications={notifications}
          initialTotalCount={totalCount}
          initialPage={page}
          initialUnreadCount={unreadCount}
        />
      )}
    </div>
  );
}
