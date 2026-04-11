import { CreateNotificationForm } from '../../../../components/admin/CreateNotificationForm';
import { AdminNotificationsList } from '../../../../components/admin/AdminNotificationsList';
import { DashboardPageHeader } from '../../../../components/dashboard/DashboardPageHeader';
import { AdminStatCard } from '../../../../components/admin/AdminStatCard';
import type { AdminStatCardProps } from '../../../../components/admin/AdminStatCard';
import { dashboardPanelClass } from '../../../../components/dashboard/dashboardSurfaces';
import { prisma } from '../../../../lib/prisma';
import { requireAdminSectionAccess } from '../../../../lib/route-guards';
import {
  faBell,
  faPaperPlane,
  faFileInvoiceDollar,
  faLifeRing
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { buildDashboardMetadata } from '../../../../lib/dashboardMetadata';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Notifications',
    description: 'Track audience reach, keep unread counts down, and compose new announcements without leaving the dashboard.',
    audience: 'admin',
  });
}

export default async function AdminNotificationsPage() {
  await requireAdminSectionAccess('notifications');
  const limit = 50;
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    notificationsRaw,
    totalCount,
    unreadCount,
    billingCount,
    billingUnread,
    supportCount,
  supportUnread,
  sentLast24h,
    sentLast7d,
    uniqueRecipients,
    newRecipients7d
  ] = await Promise.all([
    prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { email: true } }
      }
    }),
    prisma.notification.count(),
    prisma.notification.count({ where: { read: false } }),
    prisma.notification.count({ where: { type: 'BILLING' } }),
    prisma.notification.count({ where: { type: 'BILLING', read: false } }),
    prisma.notification.count({ where: { type: 'SUPPORT' } }),
    prisma.notification.count({ where: { type: 'SUPPORT', read: false } }),
  prisma.notification.count({ where: { createdAt: { gte: twentyFourHoursAgo } } }),
    prisma.notification.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.notification.findMany({ distinct: ['userId'], select: { userId: true } }),
    prisma.notification.findMany({ distinct: ['userId'], where: { createdAt: { gte: sevenDaysAgo } }, select: { userId: true } })
  ]);

  const numberFormatter = new Intl.NumberFormat('en-US');
  const formatNumber = (value: number) => numberFormatter.format(value);
  const formatPercentage = (value: number) =>
    `${(Number.isFinite(value) ? value * 100 : 0).toFixed(value * 100 >= 1 ? 1 : 2)}%`;

  const mappedNotifications = notificationsRaw.map((notification) => ({
    id: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    read: notification.read,
    createdAt: notification.createdAt.toISOString(),
    user: notification.user ? { email: notification.user.email ?? null } : null
  }));

  const unreadRate = totalCount > 0 ? unreadCount / totalCount : 0;
  const recipientsCount = uniqueRecipients.length;
  const newRecipientsCount = newRecipients7d.length;
  const averagePerDay = sentLast7d > 0 ? sentLast7d / 7 : 0;

  const heroStats = [
    {
      label: 'Unread notifications',
      value: formatNumber(unreadCount),
      helper: `${formatPercentage(unreadRate)} of total`,
      tone: 'purple' as const
    },
    {
      label: 'Unique recipients',
      value: formatNumber(recipientsCount),
      helper: `+${formatNumber(newRecipientsCount)} new this week`,
      tone: 'indigo' as const
    }
  ];

  const metricCards: AdminStatCardProps[] = [
    {
      label: 'Total notifications',
      value: formatNumber(totalCount),
      helper: `+${formatNumber(sentLast7d)} in last 7 days`,
      icon: faBell,
      accent: 'theme'
    },
    {
      label: 'Sent in 24 hours',
      value: formatNumber(sentLast24h),
      helper: `${averagePerDay.toFixed(1)} avg / day`,
      icon: faPaperPlane,
      accent: 'theme'
    },
    {
      label: 'Billing alerts',
      value: formatNumber(billingCount),
      helper: `${formatNumber(billingUnread)} unread`,
      icon: faFileInvoiceDollar,
      accent: 'theme'
    },
    {
      label: 'Support updates',
      value: formatNumber(supportCount),
      helper: `${formatNumber(supportUnread)} unread`,
      icon: faLifeRing,
      accent: 'theme'
    }
  ];

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="violet"
        eyebrow="Messaging"
        eyebrowIcon={<FontAwesomeIcon icon={faBell} />}
        title="Notification center"
        stats={heroStats}
      >
      </DashboardPageHeader>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metricCards.map((card) => (
          <AdminStatCard key={card.label} {...card} />
        ))}
      </section>

      <div className={dashboardPanelClass('p-6')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-50">Send notification</h3>
            <p className="text-sm text-slate-500 dark:text-neutral-300">Target all users or a single recipient with a rich message.</p>
          </div>
          <CreateNotificationForm />
        </div>
      </div>

      <AdminNotificationsList initialItems={mappedNotifications} initialTotalCount={totalCount} />

      
    </div>
  );
}
