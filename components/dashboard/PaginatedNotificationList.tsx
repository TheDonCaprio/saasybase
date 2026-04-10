"use client";

import { useCallback, useEffect, useState } from 'react';
import { Pagination } from '../ui/Pagination';
import { showToast } from '../ui/Toast';
import ListFilters from '../ui/ListFilters';
import usePaginatedList from '../hooks/usePaginatedList';
import { useListFilterState } from '../hooks/useListFilters';
import MarkAllReadButton from './MarkAllReadButton';
import { NotificationCard } from '../notifications/NotificationCard';

interface Notification {
  id: string;
  title: string;
  message: string;
  type?: string;
  read: boolean;
  createdAt: string | Date;
  url?: string | null;
}

interface PaginatedNotificationListProps {
  initialNotifications: Notification[];
  initialTotalCount: number;
  initialPage: number;
  initialUnreadCount: number;
}

export function PaginatedNotificationList({ 
  initialNotifications, 
  initialTotalCount, 
  initialPage,
  initialUnreadCount
}: PaginatedNotificationListProps) {
  const { search, setSearch, debouncedSearch, setStatus } = useListFilterState('', 'ALL');
  const [filter, setFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const itemsPerPage = 50;

  const { items: notifications, setItems, totalCount, currentPage, isLoading, nextCursor, fetchPage, fetchNext, refresh } = usePaginatedList<Notification>({
    basePath: '/api/notifications',
    initialItems: initialNotifications,
    initialTotalCount: initialTotalCount,
    initialPage,
    itemsPerPage,
    filters: {
      search: debouncedSearch || undefined,
      read: filter === 'ALL' ? undefined : (filter === 'READ' ? 'true' : 'false'),
      type: typeFilter === 'ALL' ? undefined : typeFilter
    }
  });

  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [readCount, setReadCount] = useState(0);
  const [generalCount, setGeneralCount] = useState(0);
  const [billingCount, setBillingCount] = useState(0);
  const [supportCount, setSupportCount] = useState(0);
  const [accountCount, setAccountCount] = useState(0);
  const totalPages = Math.ceil((totalCount || 0) / itemsPerPage);

  // reference helpers to silence unused warnings in some build paths
  void nextCursor;
  void fetchNext;

  // hook handles fetching; keep unreadCount in sync when pages are refreshed
  const updateUnreadCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?page=1&limit=${itemsPerPage}`);
      if (res.ok) {
        const json = await res.json();
        if (typeof json.unreadCount === 'number') setUnreadCount(json.unreadCount);
        if (typeof json.readCount === 'number') setReadCount(json.readCount);
        if (typeof json.generalCount === 'number') setGeneralCount(json.generalCount);
        if (typeof json.billingCount === 'number') setBillingCount(json.billingCount);
        if (typeof json.supportCount === 'number') setSupportCount(json.supportCount);
        if (typeof json.accountCount === 'number') setAccountCount(json.accountCount);
      }
    } catch (e) {
      void e;
    }
  }, [itemsPerPage]);

  useEffect(() => {
    updateUnreadCount();
  }, [debouncedSearch, filter, updateUnreadCount]);

  // Listen for global mark-all-read events to update UI in-place
  // setItems is stable from usePaginatedList; include it in deps so lint is satisfied
  useEffect(() => {
    const handler = () => {
      setItems((prev: Notification[]) => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    };
    window.addEventListener('notifications:mark-all-read', handler as EventListener);
    return () => window.removeEventListener('notifications:mark-all-read', handler as EventListener);
  }, [setItems]);

  const handlePageChange = (page: number) => fetchPage(page);

  const handleRefresh = useCallback(async () => {
    await refresh();
    await updateUnreadCount();
  }, [refresh, updateUnreadCount]);

  const handleMarkAllSuccess = useCallback(() => {
    setItems((prev: Notification[]) => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }, [setItems]);

  // Debounced search: trigger fetch for page 1 after user stops typing
  useEffect(() => {
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filter]);

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST'
      });

      if (response.ok) {
        setItems((prev: Notification[]) => 
          prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
        showToast('Notification marked as read', 'success');
      } else {
        showToast('Failed to mark as read', 'error');
      }
    } catch (error) {
      void error;
      console.error('Error marking notification as read:', error);
      showToast('Error updating notification', 'error');
    }
  };

  // use shared formatDate from lib/formatDate

  // Keep the ListFilters mounted during loading so the search input doesn't
  // get unmounted (which would blur the input). We'll show the loading
  // skeleton inside the notifications list area below when there are no items.

  // Poll notifications periodically while the page is visible so new alerts
  // and counts update without manual refresh.
  useEffect(() => {
  const POLL_INTERVAL = 10000; // 10s
    let intervalId: number | undefined;

    const start = () => {
      if (intervalId) return;
      intervalId = window.setInterval(async () => {
        try {
          await refresh();
          await updateUnreadCount();
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
  }, [refresh, updateUnreadCount]);

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-neutral-50">Your Notifications</h2>
            {unreadCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200">
                {unreadCount} unread
              </span>
            )}
          </div>
        </div>
        
        <div className="w-full">
          <ListFilters
            search={search}
            onSearchChange={(v) => setSearch(v)}
            statusOptions={['ALL', 'UNREAD', 'READ', 'GENERAL', 'BILLING', 'SUPPORT', 'ACCOUNT']}
            currentStatus={['ALL', 'UNREAD', 'READ'].includes(filter) ? filter : typeFilter}
            onStatusChange={(s) => {
              if (['ALL', 'UNREAD', 'READ'].includes(s)) {
                setFilter(s);
                setStatus(s);
                setTypeFilter('ALL');
              } else {
                // It's a type filter (GENERAL, BILLING, SUPPORT, ACCOUNT)
                setTypeFilter(s);
                setFilter('ALL');
              }
              fetchPage(1);
            }}
            statusTotals={{
              'All': totalCount || 0,
              'Unread': unreadCount,
              'Read': readCount,
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
            onRefresh={handleRefresh}
            placeholder="Search by title or message..."
            trailingContent={<MarkAllReadButton onSuccess={handleMarkAllSuccess} />}
          />
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {notifications.length === 0 ? (
          isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse rounded-xl border border-gray-200 dark:border-neutral-700 p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-gray-200 dark:bg-neutral-700 rounded-lg"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-neutral-700 rounded w-1/4"></div>
                      <div className="h-3 bg-gray-200 dark:bg-neutral-700 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 dark:bg-neutral-700 rounded w-1/2"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-12 text-center dark:border-neutral-700 dark:bg-neutral-900/30">
              <div className="text-gray-400 dark:text-neutral-500 text-sm">
                {filter === 'ALL' 
                  ? 'No notifications yet. You\'ll receive notifications for billing updates, support replies, and account changes.'
                  : `No ${filter.toLowerCase()} notifications found.`
                }
              </div>
            </div>
          )
        ) : (
          notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              id={notification.id}
              title={notification.title}
              message={notification.message}
              type={notification.type}
              url={notification.url}
              read={notification.read}
              createdAt={notification.createdAt}
              onMarkAsRead={markAsRead}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          totalItems={totalCount}
          itemsPerPage={itemsPerPage}
        />
      )}
    </div>
  );
}
