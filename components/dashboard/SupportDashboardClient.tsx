"use client";

import { useCallback, useMemo, useRef, useState } from 'react';
import { SupportRequestLauncher } from './SupportRequestLauncher';
import { SupportTicketsList } from './SupportTicketsList';
import { dashboardMutedPanelClass, dashboardPanelClass } from './dashboardSurfaces';

type SupportTicket = {
  id: string;
  subject: string;
  message: string;
  status: string;
  createdAt: Date | string;
  replies: Array<{
    id: string;
    message: string;
    createdAt: Date | string;
    user: {
      email: string | null;
      role: string;
    } | null;
  }>;
};

interface SupportDashboardClientProps {
  userId: string;
  initialTickets: SupportTicket[];
  initialTotalCount: number;
  initialPage: number;
  initialActiveTicketId: string | null;
  supportEmail: string;
  activeTicketsCount: number;
}

export function SupportDashboardClient({
  userId,
  initialTickets,
  initialTotalCount,
  initialPage,
  initialActiveTicketId,
  supportEmail,
  activeTicketsCount
}: SupportDashboardClientProps) {
  const refreshRef = useRef<(() => void) | null>(null);

  const initialStatusCounts = useMemo(() => {
    const open = initialTickets.filter((ticket) => ticket.status === 'OPEN').length;
    const inProgress = initialTickets.filter((ticket) => ticket.status === 'IN_PROGRESS').length;
    const closed = initialTickets.filter((ticket) => ticket.status === 'CLOSED').length;
    return { open, inProgress, closed };
  }, [initialTickets]);

  const [stats, setStats] = useState({
    total: initialTotalCount,
    ...initialStatusCounts
  });

  const handleRegisterRefresh = useCallback((handler: () => void) => {
    refreshRef.current = handler;
  }, []);

  const handleTicketSubmitted = useCallback(() => {
    refreshRef.current?.();
  }, []);

  const handleStatsChange = useCallback((nextStats: { total: number; open: number; inProgress: number; closed: number }) => {
    setStats((prev) => {
      if (
        prev.total === nextStats.total &&
        prev.open === nextStats.open &&
        prev.inProgress === nextStats.inProgress &&
        prev.closed === nextStats.closed
      ) {
        return prev;
      }
      return nextStats;
    });
  }, []);

  const activeCount = stats.open + stats.inProgress;
  const displayActiveCount = Math.max(activeCount, activeTicketsCount);

  const quickStats = [
    {
      label: 'Active tickets',
      value: displayActiveCount,
      helper: displayActiveCount > 0 ? 'Open + in progress conversations' : 'Everything is resolved',
    },
    {
      label: 'Total tickets logged',
      value: stats.total,
      helper: 'All requests since you joined',
    },
  ];

  return (
  <div className="grid gap-6 xl:grid-cols-[minmax(0,4fr)_minmax(0,1fr)]">
      <div className="space-y-6 min-w-0">
        <SupportRequestLauncher
          userId={userId}
          activeTicketsCount={displayActiveCount}
          onTicketSubmitted={handleTicketSubmitted}
        />

  <section className="space-y-6 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-6 lg:shadow-sm lg:transition-shadow dark:lg:border-neutral-800 dark:lg:bg-neutral-900/60 dark:lg:shadow-[0_0_25px_rgba(15,23,42,0.45)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-50">Ticket inbox</h2>
              <p className="text-sm text-slate-500 dark:text-neutral-400">
                Track every conversation with our team, filter by status, and jump into the full thread in a click.
              </p>
            </div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
              {stats.total} ticket{stats.total === 1 ? '' : 's'} total
            </div>
          </div>

          <SupportTicketsList
            initialTickets={initialTickets}
            initialTotalCount={initialTotalCount}
            initialPage={initialPage}
            initialActiveTicketId={initialActiveTicketId}
            onRegisterRefresh={handleRegisterRefresh}
            onStatsChange={handleStatsChange}
          />
        </section>
      </div>

  <aside className="space-y-6 min-w-0">
        <div className={dashboardPanelClass('space-y-4 p-4 sm:p-6')}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Snapshot</h3>
          <div className="space-y-3">
            {quickStats.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200/80 bg-white/40 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-neutral-500">{item.label}</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-neutral-50">{item.value}</div>
                <p className="text-xs text-slate-500 dark:text-neutral-400">{item.helper}</p>
              </div>
            ))}
          </div>
          <div className={dashboardMutedPanelClass('p-4 text-sm leading-relaxed text-slate-600 dark:text-neutral-200')}>
            Having trouble finding an answer? Open a ticket and we&apos;ll follow up via email too, so you never miss an update.
          </div>
        </div>

        <div className={dashboardMutedPanelClass('space-y-4 p-4 sm:p-6 text-sm leading-relaxed text-slate-600 dark:text-neutral-200')}>
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-neutral-50">Email support</div>
            <a href={`mailto:${supportEmail}`} className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300">
              {supportEmail}
              <span aria-hidden>↗</span>
            </a>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-neutral-50">Response time</div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">We typically reply within 24 hours on business days.</p>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-neutral-50">Priority support</div>
            <p className="text-xs text-slate-500 dark:text-neutral-400">Pro subscribers jump the queue for faster follow-ups.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
