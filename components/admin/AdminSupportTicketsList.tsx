'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminCompactSupportTicket } from './AdminCompactSupportTicket';
import { AdminCreateTicketModal } from './AdminCreateTicketModal';
import { Pagination } from '../ui/Pagination';
import SupportTicketModal from './SupportTicketModal';
import ListFilters from '../ui/ListFilters';
import { useListFilterState } from '../hooks/useListFilters';
import usePaginatedList from '../hooks/usePaginatedList';
import { dashboardMutedPanelClass, dashboardPanelClass } from '../dashboard/dashboardSurfaces';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faEnvelopeOpenText } from '@fortawesome/free-solid-svg-icons';
import { useFormatSettings } from '../FormatSettingsProvider';
import { SUPPORT_TICKET_CATEGORY_FILTER_OPTIONS } from '../../lib/support-ticket-categories';

interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  category: string;
  status: string;
  createdAt: string | Date;
  user: {
    email: string | null;
    name: string | null;
  } | null;
  replies: Array<{
    id: string;
    message: string;
    createdAt: string | Date;
    user: {
      email: string | null;
      name: string | null;
      role: string;
    } | null;
  }>;
}

interface AdminSupportTicketsListProps {
  initialTickets: SupportTicket[];
  initialTotalCount: number;
  initialPage: number;
  initialActiveTicketId?: string | null;
}

export function AdminSupportTicketsList({ 
  initialTickets, 
  initialTotalCount, 
  initialPage 
  , initialActiveTicketId = null
}: AdminSupportTicketsListProps) {
  const itemsPerPage = 50;
  const numberFormatter = useMemo(() => new Intl.NumberFormat('en-US'), []);
  const settings = useFormatSettings();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const formatNumber = (value: number) => numberFormatter.format(value);

  const { search, setSearch, debouncedSearch, status, setStatus, datePreset, setDatePreset, startDate, endDate, setStartDate, setEndDate } = useListFilterState('', 'ALL', 500);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const [sortBy, setSortBy] = useState<'createdAt' | 'status' | 'lastResponse'>('lastResponse');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const ymdFromDateInTZ = (date: Date, tz: string) => {
    const formatted = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
    const [y, m, d] = formatted.split('-').map((s) => Number(s));
    return { y, m, d };
  };

  const formatYMD = ({ y, m, d }: { y: number; m: number; d: number }) => {
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  };

  const addDaysYMD = ({ y, m, d }: { y: number; m: number; d: number }, delta: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  };

  const addMonthsYMD = ({ y, m, d }: { y: number; m: number; d: number }, delta: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCMonth(dt.getUTCMonth() + delta);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  };

  const computePresetRange = (preset: 'ALL'|'TODAY'|'YESTERDAY'|'LAST_7'|'LAST_MONTH'|'THIS_MONTH'|'THIS_QUARTER'|'THIS_YEAR'|'CUSTOM', tz: string) => {
    const now = new Date();
    const today = ymdFromDateInTZ(now, tz);

    let startYMD: { y: number; m: number; d: number } | null = null;
    let endYMD: { y: number; m: number; d: number } | null = null; // exclusive

    switch (preset) {
      case 'TODAY':
        startYMD = today;
        endYMD = addDaysYMD(today, 1);
        break;
      case 'YESTERDAY':
        startYMD = addDaysYMD(today, -1);
        endYMD = addDaysYMD(startYMD, 1);
        break;
      case 'LAST_7':
        endYMD = addDaysYMD(today, 1);
        startYMD = addDaysYMD(endYMD, -7);
        break;
      case 'LAST_MONTH': {
        const firstOfThisMonth = { y: today.y, m: today.m, d: 1 };
        const prev = addMonthsYMD(firstOfThisMonth, -1);
        startYMD = { y: prev.y, m: prev.m, d: 1 };
        endYMD = { y: firstOfThisMonth.y, m: firstOfThisMonth.m, d: 1 };
        break;
      }
      case 'THIS_MONTH':
        startYMD = { y: today.y, m: today.m, d: 1 };
        endYMD = addMonthsYMD(startYMD, 1);
        break;
      case 'THIS_QUARTER': {
        const qStartMonth = Math.floor((today.m - 1) / 3) * 3 + 1;
        startYMD = { y: today.y, m: qStartMonth, d: 1 };
        endYMD = addMonthsYMD(startYMD, 3);
        break;
      }
      case 'THIS_YEAR':
        startYMD = { y: today.y, m: 1, d: 1 };
        endYMD = { y: today.y + 1, m: 1, d: 1 };
        break;
      default:
        startYMD = null;
        endYMD = null;
    }

    return {
      startDate: startYMD ? formatYMD(startYMD) : null,
      endDate: endYMD ? formatYMD(endYMD) : null
    };
  };

  const { items: tickets, setItems, totalCount, currentPage, nextCursor, fetchPage, refresh } = usePaginatedList<SupportTicket>({
    basePath: '/api/admin/support/tickets',
    initialItems: initialTickets,
    initialTotalCount: initialTotalCount,
    initialPage,
    itemsPerPage,
    itemsKey: 'tickets',
    filters: {
      search: debouncedSearch || undefined,
      status: status === 'ALL' ? undefined : status,
      category: categoryFilter === 'ALL' ? undefined : categoryFilter,
      sortBy: sortBy,
      sortOrder: sortOrder,
      startDate: startDate || undefined,
      endDate: endDate || undefined
    }
  });

  const totalPages = totalCount ? Math.ceil(totalCount / itemsPerPage) : Math.max(1, currentPage + (nextCursor ? 1 : 0));

  const handlePageChange = (page: number) => fetchPage(page);

  const handleStatusFilterChange = (s: string) => {
    setStatus(s);
    // ensure first page fetched
    fetchPage(1);
  };

  // keep parity with prior behavior: trigger fetch for page 1 when debouncedSearch changes
  useEffect(() => {
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, debouncedSearch, status, sortBy, sortOrder, startDate, endDate]);

  const refreshTickets = useCallback(() => fetchPage(currentPage), [fetchPage, currentPage]);

  const refreshFirstPage = useCallback(() => fetchPage(1), [fetchPage]);

  const handleCreateModalClose = () => setIsCreateModalOpen(false);

  // Active ticket modal handling (for opening via ?ticket=... links)
  const [activeTicketId, setActiveTicketId] = useState<string | null>(initialActiveTicketId ?? null);
  const [activeTicketData, setActiveTicketData] = useState<SupportTicket | null>(() => {
    if (!initialActiveTicketId) return null;
    return initialTickets.find((t) => t.id === initialActiveTicketId) ?? null;
  });

  useEffect(() => {
    if (!activeTicketId) return;
    if (activeTicketData) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/support/tickets/${activeTicketId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setActiveTicketData(data);
      } catch (err) {
        void err;
      }
    })();
    return () => { cancelled = true; };
  }, [activeTicketId, activeTicketData]);

  const handleCloseActiveTicket = () => {
    setActiveTicketId(null);
    setActiveTicketData(null);
  };

  // Poll admin ticket list while visible so new tickets and counts update.
  useEffect(() => {
    const POLL_INTERVAL = 10000; // 10s
    let intervalId: number | undefined;

    const start = () => {
      if (intervalId) return;
      intervalId = window.setInterval(() => {
        try {
          // Refresh current page to avoid hijacking pagination position.
          refresh();
        } catch (err) {
          void err;
        }
      }, POLL_INTERVAL);
    };

    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') start(); else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  // Listen for ticket-updated events and perform a targeted update when possible
  useEffect(() => {
    const handler = async (e: Event) => {
      try {
        const ce = e as CustomEvent<{ ticketId?: string }>;
        const ticketId = ce?.detail?.ticketId;

        if (ticketId) {
          const exists = tickets.find((t) => t.id === ticketId);
          if (exists) {
            try {
              const res = await fetch(`/api/admin/support/tickets/${ticketId}`);
              if (res.ok) {
                const data = await res.json();
                setItems((prev) => prev.map((it) => (it.id === ticketId ? data : it)));
                if (sortBy === 'lastResponse') {
                  if (currentPage === 1) {
                    await refreshFirstPage();
                  } else {
                    await refresh();
                  }
                }
                return;
              }
            } catch (err) {
              void err;
            }
          } else {
            if (currentPage === 1) {
              await refreshFirstPage();
            } else {
              await refresh();
            }
            return;
          }
        }

        // fallback: refresh current page (or first page if on page 1)
        if (currentPage === 1) {
          await refreshFirstPage();
        } else {
          await refresh();
        }
      } catch (err) {
        void err;
      }
    };

    window.addEventListener('support:ticket-updated', handler as EventListener);
    return () => window.removeEventListener('support:ticket-updated', handler as EventListener);
  }, [tickets, currentPage, fetchPage, refreshFirstPage, refresh, setItems, sortBy]);

  const getStatusCounts = () => {
    return {
      open: tickets.filter(t => t.status === 'OPEN').length,
      inProgress: tickets.filter(t => t.status === 'IN_PROGRESS').length,
      closed: tickets.filter(t => t.status === 'CLOSED').length
    };
  };

  const statusCounts = getStatusCounts();
  const needsAttention = tickets.filter(t => 
    t.status === 'OPEN' || 
    (t.replies.length === 0) ||
    (t.replies[t.replies.length - 1]?.user?.role !== 'ADMIN')
  ).length;
  // awaitingCustomer previously used in the info-cards header; removed when cards were removed

  // NOTE: keep the filters mounted while loading to avoid losing focus.
  // The list area will render a skeleton when loading and there are no items yet.

  return (
    <div className="space-y-6">
      {/* Info cards removed per request: Needs attention / Waiting on agent reply / Open / In progress / Waiting on customer */}

      <div className={dashboardPanelClass('p-3 sm:p-4 space-y-3')}>
        <ListFilters
          search={search}
          onSearchChange={(v) => setSearch(v)}
          statusOptions={['ALL', 'OPEN', 'IN_PROGRESS', 'CLOSED']}
          currentStatus={status}
          onStatusChange={(s) => handleStatusFilterChange(s)}
          secondaryOptions={[...SUPPORT_TICKET_CATEGORY_FILTER_OPTIONS]}
          currentSecondary={categoryFilter}
          onSecondaryChange={(value) => {
            setCategoryFilter(value);
            fetchPage(1);
          }}
          secondaryLabel="Category"
          sortOptions={[
            { value: 'createdAt', label: 'Date Created' },
            { value: 'lastResponse', label: 'Last Response' },
            { value: 'status', label: 'Status' }
          ]}
          sortBy={sortBy}
          onSortByChange={(s) => {
            setSortBy(s as 'createdAt' | 'status' | 'lastResponse');
            fetchPage(1);
          }}
          sortOrder={sortOrder}
          onSortOrderChange={(o) => {
            setSortOrder(o);
            fetchPage(1);
          }}
          datePreset={datePreset}
          startDate={startDate}
          endDate={endDate}
          onDatePresetChange={(p) => {
            setDatePreset(p);
            const { startDate: sd, endDate: ed } = computePresetRange(p, settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
            setStartDate(sd);
            setEndDate(ed);
            fetchPage(1);
          }}
          onStartDateChange={(d) => {
            setStartDate(d);
            setDatePreset('CUSTOM');
            fetchPage(1);
          }}
          onEndDateChange={(d) => {
            setEndDate(d);
            setDatePreset('CUSTOM');
            fetchPage(1);
          }}
          onRefresh={() => refreshTickets()}
          placeholder="Search by ticket ID, subject, message, or user email..."
          additionalButton={{
            label: '+ create',
            onClick: () => setIsCreateModalOpen(true),
            className: 'inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-violet-700'
          }}
        />
      </div>

      <div
        className={dashboardMutedPanelClass(
          'flex flex-col gap-2 px-3 py-2.5 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3 sm:text-sm dark:text-neutral-300'
        )}
      >
        <span>
          Showing {formatNumber(tickets.length)} of {formatNumber(totalCount ?? tickets.length)} tickets
        </span>
        <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500 dark:text-neutral-400">
          <FontAwesomeIcon icon={faBell} className="w-4 h-4" /> {formatNumber(needsAttention)} need response · <FontAwesomeIcon icon={faEnvelopeOpenText} className="w-4 h-4" /> {formatNumber(statusCounts.closed)} closed
        </span>
      </div>

      <div className={dashboardPanelClass('p-0 overflow-hidden')}>
        {tickets.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500 dark:text-neutral-300">
            {status === 'ALL'
              ? categoryFilter === 'ALL'
                ? 'No support tickets found.'
                : 'No support tickets found for this category.'
              : `No ${status.toLowerCase().replace('_', ' ')} tickets found.`}
          </div>
        ) : (
          <div className="divide-y divide-slate-100/80 dark:divide-neutral-800/80">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="p-3 sm:p-4">
                <AdminCompactSupportTicket
                  ticket={ticket}
                  onUpdate={refreshTickets}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {(totalPages > 1 || nextCursor) && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          totalItems={totalCount ?? tickets.length}
          itemsPerPage={itemsPerPage}
          nextCursor={nextCursor}
          onNextWithCursor={() => fetchPage(currentPage + 1, false, nextCursor)}
        />
      )}
      <AdminCreateTicketModal
        open={isCreateModalOpen}
        onClose={handleCreateModalClose}
        onCreated={() => {
          refreshFirstPage();
        }}
      />
      <SupportTicketModal
        ticket={activeTicketData}
        open={Boolean(activeTicketId)}
        onClose={handleCloseActiveTicket}
        onUpdate={() => refreshFirstPage()}
      />
    </div>
  );
}
