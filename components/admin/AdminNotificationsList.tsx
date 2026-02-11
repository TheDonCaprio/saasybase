"use client";

import { useState, useEffect, useMemo } from 'react';
import { Pagination } from '../ui/Pagination';
import ListFilters from '../ui/ListFilters';
import usePaginatedList from '../hooks/usePaginatedList';
import { useListFilterState } from '../hooks/useListFilters';
import { dashboardMutedPanelClass, dashboardPanelClass } from '../dashboard/dashboardSurfaces';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileInvoiceDollar, faLifeRing, faUser, faBullhorn } from '@fortawesome/free-solid-svg-icons';
import { NotificationCard } from '../notifications/NotificationCard';
import { BulkNotificationCard } from '../notifications/BulkNotificationCard';

interface NotificationItem {
  id: string;
  title: string;
  message?: string;
  type?: string;
  read?: boolean;
  createdAt?: string | Date | null;
  user?: { email?: string } | null;
}

const coerceNotification = (raw: unknown): NotificationItem => {
  if (!raw || typeof raw !== 'object') return { id: '', title: '', message: undefined, type: undefined, read: false, createdAt: undefined, user: null };
  const rec = raw as Record<string, unknown>;
  // normalize createdAt: allow string or numeric timestamps -> Date
  let createdAtVal: string | Date | null | undefined;
  if (typeof rec.createdAt === 'string') createdAtVal = rec.createdAt;
  else if (typeof rec.createdAt === 'number') createdAtVal = new Date(rec.createdAt);
  else if (rec.createdAt instanceof Date) createdAtVal = rec.createdAt;
  else createdAtVal = undefined;

  return {
    id: rec.id ? String(rec.id) : '',
    title: rec.title ? String(rec.title) : '',
    message: rec.message ? String(rec.message) : undefined,
    type: rec.type ? String(rec.type) : undefined,
    read: typeof rec.read === 'boolean' ? rec.read : false,
    createdAt: createdAtVal ?? undefined,
    user: rec.user && typeof rec.user === 'object' ? { email: String((rec.user as Record<string, unknown>).email ?? '') } : null
  };
};

export function AdminNotificationsList({ initialItems, initialTotalCount }: { initialItems?: unknown[]; initialTotalCount?: number }) {
  const { search, setSearch, debouncedSearch, setStatus } = useListFilterState('', 'ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [generalCount, setGeneralCount] = useState(0);
  const [billingCount, setBillingCount] = useState(0);
  const [supportCount, setSupportCount] = useState(0);
  const [accountCount, setAccountCount] = useState(0);
  const itemsPerPage = 50;
  const numberFormatter = useMemo(() => new Intl.NumberFormat('en-US'), []);
  const formatNumber = (value: number) => numberFormatter.format(value);
  const { items, totalCount, currentPage, isLoading, nextCursor, fetchPage, lastResponse } = usePaginatedList<NotificationItem>({
    basePath: '/api/admin/notifications',
    initialItems: (initialItems || []).map(coerceNotification),
    initialTotalCount: initialTotalCount ?? 0,
    initialPage: 1,
    itemsPerPage,
    filters: {
      search: debouncedSearch || undefined,
      status: statusFilter === 'ALL' ? undefined : statusFilter
    }
  });

  // Extract counts from API response
  useEffect(() => {
    if (lastResponse && typeof lastResponse === 'object') {
      const resp = lastResponse as Record<string, unknown>;
      if (typeof resp.generalCount === 'number') setGeneralCount(resp.generalCount);
      if (typeof resp.billingCount === 'number') setBillingCount(resp.billingCount);
      if (typeof resp.supportCount === 'number') setSupportCount(resp.supportCount);
      if (typeof resp.accountCount === 'number') setAccountCount(resp.accountCount);
    }
  }, [lastResponse]);

  // Fetch initial counts on mount if we're using SSR initial data
  useEffect(() => {
    const fetchInitialCounts = async () => {
      try {
        const res = await fetch('/api/admin/notifications?limit=1&page=1');
        if (res.ok) {
          const data = await res.json();
          if (typeof data.generalCount === 'number') setGeneralCount(data.generalCount);
          if (typeof data.billingCount === 'number') setBillingCount(data.billingCount);
          if (typeof data.supportCount === 'number') setSupportCount(data.supportCount);
          if (typeof data.accountCount === 'number') setAccountCount(data.accountCount);
        }
      } catch (err) {
        console.error('Failed to fetch initial counts', err);
      }
    };
    
    // Only fetch if we have initial items (SSR) but no lastResponse yet (no client-side fetch)
    if (initialItems && initialItems.length > 0 && !lastResponse) {
      fetchInitialCounts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // hook handles pages; append flows are available via fetchNext() but we prefer navigation semantics

  // Some admin flows don't render the total; reference it to silence lint warnings
  const totalComputed = items.length;
  void totalComputed;
  // reference MarkAllReadButton and isLoading to avoid "defined but never used" in partial builds
  void isLoading;

  // Listen for global mark-all-read events to update UI in-place (refetch page 1)
  useEffect(() => {
    const handler = () => {
      fetchPage(1);
    };
    window.addEventListener('notifications:mark-all-read', handler as EventListener);
    return () => window.removeEventListener('notifications:mark-all-read', handler as EventListener);
  }, [fetchPage]);

  // Poll notifications while admin view is visible to pick up new notifications
  useEffect(() => {
    const POLL_INTERVAL = 8000; // 8s
    let intervalId: number | undefined;

    const start = () => {
      if (intervalId) return;
      intervalId = window.setInterval(() => {
        try {
          fetchPage(1);
        } catch (e) {
          void e;
        }
      }, POLL_INTERVAL);
    };

    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    if (document.visibilityState === 'visible') start();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start(); else stop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchPage]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPage(1);
  };
  // reference handler to silence 'assigned but never used' in partial builds
  void handleSearchSubmit;

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setStatus(value);
  };

  // Group bulk notifications - if multiple notifications have the same title, message, and type
  // created within 5 seconds of each other, they're likely from a bulk send
  const groupedItems = useMemo(() => {
    const groups: Map<string, NotificationItem[]> = new Map();
    const processed = new Set<string>();

    for (const item of items) {
      if (processed.has(item.id)) continue;

      const key = `${item.title}|${item.message}|${item.type}`;
      const itemTime = item.createdAt 
        ? (typeof item.createdAt === 'string' ? new Date(item.createdAt).getTime() : (item.createdAt instanceof Date ? item.createdAt.getTime() : 0))
        : 0;

      // Find all items with same key and similar timestamp (within 5 seconds)
      const similarItems = items.filter(other => {
        if (processed.has(other.id)) return false;
        if (other.title !== item.title || other.message !== item.message || other.type !== item.type) return false;
        
        const otherTime = other.createdAt 
          ? (typeof other.createdAt === 'string' ? new Date(other.createdAt).getTime() : (other.createdAt instanceof Date ? other.createdAt.getTime() : 0))
          : 0;
        
        return Math.abs(otherTime - itemTime) <= 5000; // 5 second window
      });

      if (similarItems.length > 1) {
        // This is a bulk send - mark as grouped
        groups.set(key, similarItems);
        similarItems.forEach(i => processed.add(i.id));
      } else {
        groups.set(key, [item]);
        processed.add(item.id);
      }
    }

    return Array.from(groups.values());
  }, [items]);

  return (
    <div className="space-y-6">
      <div className={dashboardPanelClass('p-4 sm:p-6')}>
        <ListFilters
          search={search}
          onSearchChange={(v) => setSearch(v)}
          statusOptions={['ALL', 'GENERAL', 'BILLING', 'SUPPORT', 'ACCOUNT']}
          currentStatus={statusFilter}
          onStatusChange={(s) => handleStatusChange(s)}
          statusTotals={{
            'All': totalCount || 0,
            'General': generalCount,
            'Billing': billingCount,
            'Support': supportCount,
            'Account': accountCount
          }}
          extraOptgroups={[
            {
              label: 'Alert Type',
              items: ['GENERAL', 'BILLING', 'SUPPORT', 'ACCOUNT']
            },
            {
              label: 'Read Status',
              items: ['UNREAD', 'READ']
            }
          ]}
          onRefresh={() => { setSearch(''); setStatusFilter('ALL'); fetchPage(1); }}
          placeholder="Search by title, message, or user email..."
        />
      </div>

      <div
        className={dashboardMutedPanelClass(
          'flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:text-sm dark:text-neutral-300'
        )}
      >
        <span>
          Showing {formatNumber(items.length)} of {formatNumber(totalCount ?? items.length)} notifications
        </span>
        <span className="inline-flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500 dark:text-neutral-400">
          <FontAwesomeIcon icon={faFileInvoiceDollar} className="w-4 h-4" /> {formatNumber(billingCount)} billing · <FontAwesomeIcon icon={faLifeRing} className="w-4 h-4" /> {formatNumber(supportCount)} support · <FontAwesomeIcon icon={faUser} className="w-4 h-4" /> {formatNumber(accountCount)} account · <FontAwesomeIcon icon={faBullhorn} className="w-4 h-4" /> {formatNumber(generalCount)} general
        </span>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="text-center py-16 px-6 rounded-xl bg-gray-50 dark:bg-neutral-900/30 border border-gray-200 dark:border-neutral-700">
            <div className="text-gray-500 dark:text-neutral-400 text-sm">
              {statusFilter === 'ALL' ? 'No notifications found.' : `No ${statusFilter.toLowerCase()} notifications.`}
            </div>
          </div>
        ) : (
          groupedItems.map((group, idx) => {
            // If group has more than one item, it's a bulk send
            if (group.length > 1) {
              const first = group[0];
              return (
                <BulkNotificationCard
                  key={`bulk-${idx}`}
                  title={first.title}
                  message={first.message}
                  type={first.type}
                  recipientCount={group.length}
                  createdAt={first.createdAt || undefined}
                />
              );
            }
            
            // Single notification
            const notification = group[0];
            return (
              <NotificationCard
                key={notification.id}
                id={notification.id}
                title={notification.title}
                message={notification.message}
                type={notification.type}
                read={true}
                createdAt={notification.createdAt || undefined}
                userEmail={notification.user?.email}
                showUser={true}
                showMarkAsRead={false}
                isAdminView={true}
              />
            );
          })
        )}
      </div>

      {((totalCount && Math.ceil(totalCount / itemsPerPage) > 1) || nextCursor) && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalCount ? Math.ceil(totalCount / itemsPerPage) : currentPage + (nextCursor ? 1 : 0)}
          onPageChange={(p) => fetchPage(p)}
          totalItems={totalCount ?? items.length}
          itemsPerPage={itemsPerPage}
          nextCursor={nextCursor}
          onNextWithCursor={(cursor: string) => fetchPage(currentPage + 1, false, cursor)}
        />
      )}
    </div>
  );
}
