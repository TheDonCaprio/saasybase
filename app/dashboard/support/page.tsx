import { prisma } from '../../../lib/prisma';
export const dynamic = 'force-dynamic';
import { getSupportEmail } from '../../../lib/settings';
import { SupportDashboardClient } from '../../../components/dashboard/SupportDashboardClient';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import { formatDateServer } from '../../../lib/formatDate.server';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '../../../lib/route-guards';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Support',
    description: 'Open tickets, track responses, and stay connected with the SaaSyBase support team from your dashboard.',
    audience: 'user',
  });
}

interface PageProps {
  searchParams?: Promise<{ page?: string; status?: string; ticket?: string }>;
}

export default async function SupportPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const returnPath = buildReturnPath('/dashboard/support', resolvedSearchParams);
  const { userId } = await requireAuth(returnPath);

  const page = parseInt(resolvedSearchParams.page || '1');
  const status = resolvedSearchParams.status || 'ALL';
  const requestedTicketId = resolvedSearchParams.ticket;
  const limit = 50;
  const skip = (page - 1) * limit;

  // Get support email from settings
  const supportEmail = await getSupportEmail();

  // Build where clause
  const where: Record<string, unknown> = { userId };
  if (status && status !== 'ALL') {
    where.status = status;
  }

  // Get total count for pagination
  const totalCount = await prisma.supportTicket.count({ where });

  const tickets = await prisma.supportTicket.findMany({
    where,
    // Default ordering: most recent activity (updatedAt) first to match client "Last Response"
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'desc' }
    ],
    skip,
    take: limit,
    include: {
      replies: {
        orderBy: { createdAt: 'asc' },
        include: { 
          user: { 
            select: { 
              email: true, 
              role: true 
            } 
          } 
        }
      }
    }
  });

  const activeTicketsCount = await prisma.supportTicket.count({
    where: {
      userId,
      status: {
        in: ['OPEN', 'IN_PROGRESS']
      }
    }
  });

  const latestTicket = await prisma.supportTicket.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });

  const latestTicketFormatted = latestTicket ? await formatDateServer(latestTicket.createdAt) : null;

  let highlightedTicketId: string | null = null;
  if (requestedTicketId) {
    const highlightedTicket = await prisma.supportTicket.findFirst({
      where: {
        id: requestedTicketId,
        userId
      },
      include: {
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                email: true,
                role: true
              }
            }
          }
        }
      }
    });

    if (highlightedTicket) {
      highlightedTicketId = highlightedTicket.id;
      const existingIndex = tickets.findIndex((ticket) => ticket.id === highlightedTicket.id);
      if (existingIndex === -1) {
        tickets.unshift(highlightedTicket);
      } else {
        tickets[existingIndex] = highlightedTicket;
      }
    }
  }

  const headerStats = [
    {
      label: 'Active tickets',
      value: activeTicketsCount,
      helper: activeTicketsCount > 0 ? 'Open or awaiting our reply' : 'You’re all caught up',
      tone: activeTicketsCount > 0 ? ('amber' as const) : ('slate' as const),
    },
    {
      label: 'Last update',
      value: latestTicketFormatted ?? '—',
      helper: latestTicketFormatted ? 'Most recent ticket activity' : 'No tickets yet',
      tone: latestTicketFormatted ? ('emerald' as const) : ('slate' as const),
    },
  ];

  return (
  <div className="space-y-6">
      <DashboardPageHeader
        accent="violet"
        eyebrow="Help & support"
        eyebrowIcon="💬"
        title="We're on your side"
        description="Raise a ticket, track progress, and keep conversations tidy. Our team watches this inbox closely."
        stats={headerStats}
      />

      <SupportDashboardClient
        userId={userId}
        initialTickets={tickets}
        initialTotalCount={totalCount}
        initialPage={page}
        initialActiveTicketId={highlightedTicketId}
        supportEmail={supportEmail}
        activeTicketsCount={activeTicketsCount}
      />
    </div>
  );
}
