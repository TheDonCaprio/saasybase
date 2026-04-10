"use client";

import { useCallback, useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CompactSupportTicket } from './CompactSupportTicket';
import { Pagination } from '../ui/Pagination';
import ListFilters from '../ui/ListFilters';
import usePaginatedList from '../hooks/usePaginatedList';
import { useListFilterState } from '../hooks/useListFilters';
import UserSupportTicketModal from './UserSupportTicketModal';
import { dashboardMutedPanelClass } from './dashboardSurfaces';
import { SUPPORT_TICKET_CATEGORY_FILTER_OPTIONS } from '../../lib/support-ticket-categories';

interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  category: string;
  status: string;
  createdAt: Date | string;
  createdByRole?: string;
  replies: Array<{
    id: string;
    message: string;
    createdAt: Date | string;
    user: {
      email: string | null;
      role: string;
    } | null;
  }>;
}

interface SupportTicketsListProps {
  initialTickets: SupportTicket[];
  initialTotalCount: number;
  initialPage: number;
  initialActiveTicketId?: string | null;
  onRegisterRefresh?: (refresh: () => void) => void;
  onStatsChange?: (stats: { total: number; open: number; inProgress: number; closed: number }) => void;
}

export function SupportTicketsList({ 
  initialTickets, 
  initialTotalCount, 
  initialPage,
  initialActiveTicketId = null,
  onRegisterRefresh,
  onStatsChange
}: SupportTicketsListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const { search, setSearch, debouncedSearch, setStatus } = useListFilterState('', 'ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'createdAt' | 'lastResponse'>('lastResponse');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [activeTicketId, setActiveTicketId] = useState<string | null>(initialActiveTicketId);
  const [activeTicketData, setActiveTicketData] = useState<SupportTicket | null>(() => {
    if (!initialActiveTicketId) return null;
    return initialTickets.find((t) => t.id === initialActiveTicketId) ?? null;
  });

  const itemsPerPage = 50;

  const { items: tickets, setItems, totalCount, currentPage, isLoading: isRefreshing, nextCursor, fetchPage, fetchNext, refresh } = usePaginatedList<SupportTicket>({
    basePath: '/api/support/tickets',
    initialItems: initialTickets,
    initialTotalCount: initialTotalCount,
    initialPage,
    itemsPerPage,
    filters: {
      search: debouncedSearch || undefined,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      category: categoryFilter === 'ALL' ? undefined : categoryFilter,
      sortBy,
      sortOrder
    }
  });

  const totalPages = Math.ceil((totalCount || 0) / itemsPerPage);

  const refreshTickets = useCallback((page = currentPage) => fetchPage(page), [fetchPage, currentPage]);
  const refreshFirstPage = useCallback(() => fetchPage(1), [fetchPage]);

  // Poll for new tickets so the list updates when new tickets arrive.
  // Only poll while the document is visible to save resources.
  useEffect(() => {
    const POLL_INTERVAL = 10000; // 10s
    let intervalId: number | undefined;

    const start = () => {
      if (intervalId) return;
      intervalId = window.setInterval(() => {
        try {
          // Refresh the current page so the user's pagination position isn't hijacked.
          refresh();
        } catch (err) {
          // ignore
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

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') start(); else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh]);

  // Refresh the list when a ticket modal indicates an update happened (replies/status)
  useEffect(() => {
    const handler = async (e: Event) => {
      try {
        // If the event provides a ticketId, attempt a targeted update of that
        // ticket in-place to avoid full page refreshes when possible.
        const ce = e as CustomEvent<{ ticketId?: string }>; // may be undefined
        const ticketId = ce?.detail?.ticketId;

        if (ticketId) {
          const exists = tickets.find((t) => t.id === ticketId);
          if (exists) {
            try {
              const res = await fetch(`/api/support/tickets/${ticketId}`);
              if (res.ok) {
                const data = await res.json();
                // Update the item in-place so pagination position is preserved
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
            // If the ticket isn't on the current page and we're on page 1,
            // refresh page 1 so new tickets appear. Otherwise refresh current page.
            if (currentPage === 1) {
              refreshFirstPage();
            } else {
              refresh();
            }
            return;
          }
        }

        // Fallback: if no ticketId was provided, refresh intelligently
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
  }, [tickets, currentPage, refreshFirstPage, refresh, setItems, sortBy]);

  const handlePageChange = (page: number) => fetchPage(page);

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    setStatus(status);
  };

  const handleCategoryFilterChange = (category: string) => {
    setCategoryFilter(category);
  };

  // Debounced search: trigger fetch for page 1 after user stops typing
  useEffect(() => {
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, debouncedSearch, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (!activeTicketId) return;
    const match = tickets.find((t) => t.id === activeTicketId);
    if (match) {
      setActiveTicketData(match);
    }
  }, [tickets, activeTicketId]);

  const paramsString = searchParams.toString();

  useEffect(() => {
    const ticketParam = searchParams.get('ticket');
    if (ticketParam) {
      if (ticketParam !== activeTicketId) {
        setActiveTicketId(ticketParam);
      }
    } else if (activeTicketId) {
      setActiveTicketId(null);
      setActiveTicketData(null);
    }
  }, [paramsString, searchParams, activeTicketId]);

  const handleOpenTicket = (ticket: SupportTicket) => {
    setActiveTicketId(ticket.id);
    setActiveTicketData(ticket);
    const params = new URLSearchParams(searchParams.toString());
    params.set('ticket', ticket.id);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  const handleCloseTicket = () => {
    setActiveTicketId(null);
    setActiveTicketData(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('ticket');
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  const getStatusCounts = () => {
    return {
      open: tickets.filter(t => t.status === 'OPEN').length,
      inProgress: tickets.filter(t => t.status === 'IN_PROGRESS').length,
      closed: tickets.filter(t => t.status === 'CLOSED').length
    };
  };

  const statusCounts = getStatusCounts();

  useEffect(() => {
    if (!onRegisterRefresh) return;
    onRegisterRefresh(() => {
      // Always refresh first page so newest ticket appears immediately
      refreshFirstPage();
    });
  }, [onRegisterRefresh, refreshFirstPage]);

  useEffect(() => {
    if (!onStatsChange) return;
    onStatsChange({
      total: totalCount ?? 0,
      open: statusCounts.open,
      inProgress: statusCounts.inProgress,
      closed: statusCounts.closed
    });
  }, [onStatsChange, statusCounts, totalCount]);

  // Note: keep the ListFilters mounted during loading so the search input
  // doesn't get unmounted (which would blur the input). We'll show the
  // loading skeleton in the tickets list area below when there are no items.
  // reference helpers for lint in paths where only overview cards render
  void fetchNext;
  void nextCursor;
  void refresh;

  return (
    <div className="space-y-6">
      <div className={dashboardMutedPanelClass('p-3 sm:p-4')}>
        <ListFilters
          search={search}
          onSearchChange={(v) => setSearch(v)}
          statusOptions={['ALL', 'OPEN', 'IN_PROGRESS', 'CLOSED']}
          currentStatus={statusFilter}
          onStatusChange={(s) => handleStatusFilterChange(s)}
          secondaryOptions={[...SUPPORT_TICKET_CATEGORY_FILTER_OPTIONS]}
          currentSecondary={categoryFilter}
          onSecondaryChange={handleCategoryFilterChange}
          secondaryLabel="Category"
          onRefresh={() => refreshTickets()}
          placeholder="Search by subject, message, or ticket ID..."
          sortOptions={[
            { value: 'createdAt', label: 'Date Created' },
            { value: 'lastResponse', label: 'Last Response' }
          ]}
          sortBy={sortBy}
          onSortByChange={(value) => setSortBy(value as 'createdAt' | 'lastResponse')}
          sortOrder={sortOrder}
          onSortOrderChange={(order) => setSortOrder(order)}
        />
      </div>

      <div className="space-y-3">
        {tickets.length === 0 ? (
          isRefreshing ? (
            <div className="grid gap-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className={dashboardMutedPanelClass('h-24 animate-pulse bg-transparent')} />
              ))}
            </div>
          ) : (
            <div className={dashboardMutedPanelClass('px-4 py-10 text-center text-sm text-slate-600 dark:text-neutral-300')}>
              {statusFilter === 'ALL'
                ? categoryFilter === 'ALL'
                  ? 'No support tickets yet. Submit your first request above.'
                  : 'No support tickets found for this category.'
                : `No ${statusFilter.toLowerCase().replace('_', ' ')} tickets found.`}
            </div>
          )
        ) : (
          tickets.map((ticket) => (
            <CompactSupportTicket
              key={ticket.id}
              ticket={ticket}
              onOpen={handleOpenTicket}
            />
          ))
        )}
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          totalItems={totalCount}
          itemsPerPage={itemsPerPage}
        />
      )}

      <UserSupportTicketModal
        ticket={activeTicketData}
        ticketId={activeTicketId}
        open={Boolean(activeTicketId)}
        onClose={handleCloseTicket}
        onUpdate={() => refreshTickets()}
      />
    </div>
  );
}
