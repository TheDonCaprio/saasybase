export const dynamic = 'force-dynamic';
import { requireAdminSectionAccess } from '../../../lib/route-guards';
import { prisma } from '../../../lib/prisma';
import { clerkClient } from '@clerk/nextjs/server';
import { PaginatedUserManagement } from '../../../components/admin/PaginatedUserManagement';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import { AdminStatCard } from '../../../components/admin/AdminStatCard';
import type { AdminStatCardProps } from '../../../components/admin/AdminStatCard';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faUserShield, faRepeat, faHourglassHalf, faUserGroup } from '@fortawesome/free-solid-svg-icons';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Users',
    description: 'Audit accounts, manage roles, and monitor subscription health from a central admin workspace.',
    audience: 'admin',
  });
}

export default async function AdminUsersPage() {
  const { userId: actorId, role: actorRole } = await requireAdminSectionAccess('users');
  const canManageRoles = actorRole === 'ADMIN';

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const page = 1;
  const limit = 50;
  const skip = (page - 1) * limit;

  const [users, totalCount, adminCount, activeSubscriptionUsers, newUsersLast7Days, expiringSoonCount, newUsersYesterday, newUsersToday, newUsersThisMonth] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        subscriptions: {
          where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
          orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }],
          include: { plan: true }
        },
        _count: { select: { payments: true } }
      }
    }),
    prisma.user.count(),
    prisma.user.count({ where: { role: 'ADMIN' } }),
    prisma.subscription.findMany({
      where: { status: 'ACTIVE', expiresAt: { gt: now } },
      distinct: ['userId'],
      select: { userId: true }
    }),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.subscription.count({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          gt: now,
          lte: twoWeeksFromNow
        }
      }
    })
    // new users yesterday (created between yesterday start and today start)
    ,
    prisma.user.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
    // new users today
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    // new users this month
    prisma.user.count({ where: { createdAt: { gte: monthStart } } })
  ]);

  const activePaidUsers = new Set(activeSubscriptionUsers.map((sub) => sub.userId)).size;
  const freeUsers = Math.max(0, totalCount - activePaidUsers);

  const metricCards: AdminStatCardProps[] = [
    {
      label: 'Total users',
      value: formatNumber(totalCount),
      helper: `+${formatNumber(newUsersLast7Days)} in 7 days`,
      icon: faUsers,
      accent: 'indigo'
    },
    {
      label: 'New users today',
      value: formatNumber(newUsersToday),
      helper: `${formatNumber(newUsersThisMonth)} this month`,
      icon: faRepeat,
      accent: 'emerald'
    },
    {
      label: 'Team admins',
      value: formatNumber(adminCount),
      helper: 'Users with admin role',
      icon: faUserShield,
      accent: 'violet'
    },
    {
      label: 'Renewals in 14 days',
      value: formatNumber(expiringSoonCount),
      helper: 'Upcoming expirations',
      icon: faHourglassHalf,
      accent: 'amber'
    }
  ];

  // Enrich users with Clerk data
  const enrichedUsers = await Promise.all(
    users.map(async (user) => {
      try {
        const client = await clerkClient();
        const clerkUser = await client.users.getUser(user.id);
        return {
          ...user,
          clerkData: {
            firstName: clerkUser.firstName,
            lastName: clerkUser.lastName,
            fullName: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || null,
            imageUrl: clerkUser.imageUrl,
            emailAddresses: clerkUser.emailAddresses.map(email => ({
              id: email.id,
              emailAddress: email.emailAddress,
              verification: { status: email.verification?.status || 'unknown' }
            })),
            phoneNumbers: clerkUser.phoneNumbers.map(phone => ({
              id: phone.id,
              phoneNumber: phone.phoneNumber,
              verification: { status: phone.verification?.status || 'unknown' }
            })),
            lastSignInAt: clerkUser.lastSignInAt,
            createdAt: clerkUser.createdAt,
            updatedAt: clerkUser.updatedAt
          }
        };
      } catch (error) {
        console.warn(`Failed to fetch Clerk data for user ${user.id}:`, error);
        return {
          ...user,
          clerkData: null
        };
      }
    })
  );

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="violet"
        eyebrow="Accounts"
        eyebrowIcon={<FontAwesomeIcon icon={faUserGroup} />}
        title="User management"
        description="Review every account, promote trusted admins, and keep tabs on billing status from a single view. Edits here sync back to your Clerk dashboard automatically."
        stats={[
          {
            label: 'Active paid accounts',
            value: formatNumber(activePaidUsers),
            helper: `${formatNumber(expiringSoonCount)} renewals in 14 days`,
            tone: activePaidUsers > 0 ? 'emerald' : 'slate'
          },
          {
            label: 'Free users',
            value: formatNumber(freeUsers),
            helper: `${formatNumber(newUsersYesterday)} new yesterday`,
            tone: freeUsers > 0 ? 'blue' : 'slate'
          }
        ]}
      >
      </DashboardPageHeader>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metricCards.map((metric) => (
          <AdminStatCard key={metric.label} {...metric} />
        ))}
      </section>



      <PaginatedUserManagement
        initialUsers={enrichedUsers}
        initialTotalCount={totalCount}
        initialPage={page}
        currentAdminId={actorId}
        canManageRoles={canManageRoles}
      />


    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}
