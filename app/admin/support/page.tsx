import { prisma } from '../../../lib/prisma';
import { requireAdminSectionAccess } from '../../../lib/route-guards';
import { AdminSupportTicketsList } from '../../../components/admin/AdminSupportTicketsList';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import { AdminStatCard } from '../../../components/admin/AdminStatCard';
import type { AdminStatCardProps } from '../../../components/admin/AdminStatCard';
// dashboard surfaces not needed in this page
import {
  faInbox,
  faLifeRing,
  faPaperPlane,
  faUserClock
} from '@fortawesome/free-solid-svg-icons';
import { faHeadset } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Support',
    description: 'Monitor ticket volume, track the backlog, and keep first-response SLAs on target.',
    audience: 'admin',
  });
}

export default async function AdminSupportPage({ searchParams }: { searchParams?: Promise<{ ticket?: string }> }) {
  await requireAdminSectionAccess('support');
  const resolvedSearchParams = await searchParams;
  // Get initial page of tickets
  const page = 1;
  const limit = 50;
  const skip = (page - 1) * limit;
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    tickets,
    totalCount,
    openCount,
    inProgressCount,
    closedTotal,
    closedLast7Days,
    newTickets24h,
    awaitingFirstResponse,
    totalReplies
  ] = await Promise.all([
    prisma.supportTicket.findMany({
      // Default ordering: most recent activity (updatedAt) first to match client "Last Response"
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { email: true, name: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { email: true, name: true, role: true } } }
        }
      }
    }),
    prisma.supportTicket.count(),
    prisma.supportTicket.count({ where: { status: 'OPEN' } }),
    prisma.supportTicket.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.supportTicket.count({ where: { status: 'CLOSED' } }),
    prisma.supportTicket.count({ where: { status: 'CLOSED', updatedAt: { gte: sevenDaysAgo } } }),
    prisma.supportTicket.count({ where: { createdAt: { gte: twentyFourHoursAgo } } }),
    prisma.supportTicket.count({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        replies: { none: { user: { role: 'ADMIN' } } }
      }
    }),
    prisma.ticketReply.count()
  ]);

  const numberFormatter = new Intl.NumberFormat('en-US');
  const formatNumber = (value: number) => numberFormatter.format(value);

  const unresolvedCount = openCount + inProgressCount;
  const averageRepliesPerTicket = totalCount > 0 ? totalReplies / totalCount : 0;

  const heroStats = [
    {
      label: 'Unresolved backlog',
      value: formatNumber(unresolvedCount),
      helper: `${formatNumber(openCount)} open · ${formatNumber(inProgressCount)} in progress`,
      tone: 'indigo' as const
    },
    {
      label: 'Awaiting first reply',
      value: formatNumber(awaitingFirstResponse),
      helper: 'No admin response yet',
      tone: 'amber' as const
    }
  ];

  const metricCards: AdminStatCardProps[] = [
    {
      label: 'Total tickets',
      value: formatNumber(totalCount),
      helper: `+${formatNumber(newTickets24h)} in last 24h`,
      icon: faInbox,
      accent: 'violet'
    },
    {
      label: 'Open queue',
      value: formatNumber(openCount),
      helper: `${formatNumber(inProgressCount)} escalated`,
      icon: faLifeRing,
      accent: 'rose'
    },
    {
      label: 'Closed (7 days)',
      value: formatNumber(closedLast7Days),
      helper: `${formatNumber(closedTotal)} all-time`,
      icon: faPaperPlane,
      accent: 'emerald'
    },
    {
      label: 'Replies per ticket',
      value: averageRepliesPerTicket.toFixed(1),
      helper: `${formatNumber(totalReplies)} total replies`,
      icon: faUserClock,
      accent: 'amber'
    }
  ];

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="indigo"
        eyebrow="Customer care"
        eyebrowIcon={<FontAwesomeIcon icon={faHeadset} />}
        title="Support desk overview"
        stats={heroStats}
      >
      </DashboardPageHeader>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metricCards.map((card) => (
          <AdminStatCard key={card.label} {...card} />
        ))}
      </section>

          <AdminSupportTicketsList
            initialTickets={tickets}
            initialTotalCount={totalCount}
            initialPage={page}
            initialActiveTicketId={resolvedSearchParams?.ticket ?? null}
          />

      
    </div>
  );
}
