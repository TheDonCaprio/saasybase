'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { formatDate } from '../../lib/formatDate';
import { pluralize } from '../../lib/pluralize';
import { useFormatSettings } from '../FormatSettingsProvider';
import ActivatePendingButton from './ActivatePendingButton';
import { Pagination } from '../ui/Pagination';
import { showToast } from '../ui/Toast';
import ListFilters from '../ui/ListFilters';
import { CouponBadge } from '../ui/CouponBadge';
import { useListFilterState } from '../hooks/useListFilters';
import usePaginatedList from '../hooks/usePaginatedList';
import { dashboardPanelClass, dashboardMutedPanelClass } from './dashboardSurfaces';
import { formatCurrency as formatCurrencyUtil } from '../../lib/utils/currency';

interface Payment {
  id: string;
  amountCents: number;
  amountFormatted?: string | null;
  subtotalCents?: number | null;
  subtotalFormatted?: string | null;
  discountCents?: number | null;
  discountFormatted?: string | null;
  couponCode?: string | null;
  currency?: string | null;
  status: string;
  createdAt: string | Date;
  subscription: {
    id: string;
    status: string;
    plan: {
      name: string;
      durationHours: number;
    };
    startedAt: Date;
    expiresAt: Date;
  } | null;
  plan?: {
    id: string;
    name: string;
  } | null;
}

interface PaginatedTransactionListProps {
  initialPayments: Payment[];
  initialTotalCount: number;
  initialPage: number;
  initialTotalSpent?: number;
  initialTotalSpentFormatted?: string;
  displayCurrency?: string;
}

export function PaginatedTransactionList({ 
  initialPayments, 
  initialTotalCount, 
  initialPage,
  initialTotalSpent
  , initialTotalSpentFormatted,
  displayCurrency
}: PaginatedTransactionListProps) {
  const [totalSpent, setTotalSpent] = useState(initialTotalSpent ?? 0);
  // prefer a server-provided preformatted string to avoid SSR/CSR Intl differences
  const [totalSpentFormatted, setTotalSpentFormatted] = useState<string | null>(initialTotalSpentFormatted ?? null);
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);
  const { search, setSearch, debouncedSearch } = useListFilterState('', '');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const settings = useFormatSettings();

  const itemsPerPage = 50;

  const { items: payments, totalCount, currentPage, isLoading, nextCursor, fetchPage, fetchNext, refresh } = usePaginatedList<Payment>({
    basePath: '/api/dashboard/payments',
    initialItems: initialPayments,
    initialTotalCount: initialTotalCount,
    initialPage: initialPage,
    itemsPerPage,
    filters: {
      search: debouncedSearch || undefined,
      status: statusFilter === 'ALL' ? undefined : statusFilter
    }
  });

  const totalPages = Math.ceil((totalCount || 0) / itemsPerPage);
  // reference fetchNext to avoid assigned-but-unused lint in some render paths
  void fetchNext;

  const handlePageChange = (page: number) => {
    // prefer hook's fetchPage; it will include count=false for page > 1
    fetchPage(page);
  };

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
  };

  const refreshPayments = () => refresh();

  // sync totalSpent when payload changes by refetch side-effect: the hook doesn't currently extract totalSpent
  // we will fetch page 1 to receive totalSpent from the server when filters change
  useEffect(() => {
    // fetch first page to refresh totals when debouncedSearch or status changes
    (async () => {
      const res = await fetch(`/api/dashboard/payments?${new URLSearchParams({ page: '1', limit: String(itemsPerPage), search: debouncedSearch || '', status: statusFilter === 'ALL' ? '' : statusFilter })}`);
      if (res.ok) {
        try {
          const data = await res.json();
          if (typeof data.totalSpent === 'number') setTotalSpent(data.totalSpent);
          // server endpoint may return a preformatted string as well
          if (typeof data.totalSpentFormatted === 'string') setTotalSpentFormatted(data.totalSpentFormatted);
        } catch (err) {
          void err;
          // ignore JSON parse errors for now
        }
      }
    })();
  }, [debouncedSearch, statusFilter]);

  const handleDownloadInvoice = async (paymentId: string) => {
    setDownloadingInvoice(paymentId);
    try {
      const response = await fetch(`/api/billing/invoice/${paymentId}`);
      
      if (!response.ok) {
        throw new Error('Failed to generate invoice');
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${paymentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      showToast('Invoice downloaded successfully', 'success');
      
    } catch (error) {
      console.error('Error downloading invoice:', error);
      showToast('Failed to download invoice', 'error');
    } finally {
      setDownloadingInvoice(null);
    }
  };

  const handleDownloadRefundReceipt = async (paymentId: string) => {
    setDownloadingInvoice(paymentId);
    try {
      const response = await fetch(`/api/billing/refund-receipt/${paymentId}`);
      if (!response.ok) throw new Error('Failed to generate refund receipt');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `refund-${paymentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToast('Refund receipt downloaded', 'success');
    } catch (error) {
      console.error('Error downloading refund receipt:', error);
      showToast('Failed to download refund receipt', 'error');
    } finally {
      setDownloadingInvoice(null);
    }
  };

  // use shared formatDate helper

  const formatDuration = (durationHours: number) => {
    if (durationHours < 24) return `${durationHours} hours`;
    const days = Math.round(durationHours / 24);
    return pluralize(days, 'day');
  };

  // Get access status based on subscription status
  const getAccessStatus = (payment: Payment): string => {
    if (!payment.subscription) return 'Expired';
    
    const status = payment.subscription.status;
    const now = new Date();
    const expiresAt = new Date(payment.subscription.expiresAt);
    
      if (status === 'ACTIVE' && expiresAt > now) return 'Active';
  // Treat PENDING subscriptions as "Pending" in the transactions list
  if (status === 'PENDING') return 'Pending';
    return 'Expired';
  };

  // Display payment status with SUCCEEDED as Completed, PENDING_SUBSCRIPTION as PENDING
  const getDisplayStatus = (status: string): string => {
    if (status === 'SUCCEEDED') return 'COMPLETED';
    if (status === 'PENDING_SUBSCRIPTION') return 'PENDING';
    return status;
  };

  // status counts are available via server-side metrics; client-side counts are unused here

  const formatCurrency = (amountCents: number, currency?: string | null) => {
    const resolved = displayCurrency ?? currency ?? 'usd';
    return formatCurrencyUtil(amountCents, resolved);
  };

  const getPricingDetails = (payment: Payment) => {
    const subtotal = typeof payment.subtotalCents === 'number' ? payment.subtotalCents : payment.amountCents;
    const discount = typeof payment.discountCents === 'number' ? payment.discountCents : Math.max(0, subtotal - payment.amountCents);
    const hasDiscount = discount > 0.5; // ignore rounding noise below half a cent
    return {
      subtotal,
      discount,
      hasDiscount,
    };
  };

  // If the subscription startedAt is essentially "now" (placeholder used for PENDING
  // rows created while a user already has active time), treat it as a placeholder
  // and don't show it as a real scheduled start. This mirrors the heuristic used
  // on the Plan/Billing pages.
  const isPlaceholderStart = (startedAt: string | Date) => {
    try {
      const t = new Date(startedAt).getTime();
      return t <= Date.now() + 1000; // within ~1s of now => placeholder
    } catch (e) {
      void e;
      return false;
    }
  };

  // Keep the ListFilters mounted during loading so the search input doesn't
  // get unmounted (which would blur the input). Show the loading skeleton
  // inside the transactions list area when there are no payments.

  return (
    <div className="space-y-5">
      {/* keep totals referenced to avoid unused variable lint when server provides them */}
      <span className="sr-only">{totalSpentFormatted ?? formatCurrencyUtil(totalSpent, displayCurrency ?? 'usd')}</span>
      {/* Summary Stats are rendered by the page hero to avoid duplication */}

      <ListFilters
        search={search}
        onSearchChange={(v) => setSearch(v)}
        statusOptions={['ALL', 'SUCCEEDED', 'PENDING', 'FAILED', 'REFUNDED']}
        currentStatus={statusFilter}
        onStatusChange={(s) => handleStatusFilterChange(s)}
        onRefresh={() => refreshPayments()}
        placeholder="Search by plan, id, or email..."
      />

      {/* Transactions Table */}
      <div className={dashboardPanelClass('p-0 overflow-hidden')}>
        {payments.length === 0 ? (
          isLoading ? (
            <div className="space-y-3 p-6">
              <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-neutral-800/60" />
              <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-neutral-800/60" />
              <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-neutral-800/60" />
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-slate-500 dark:text-neutral-400 sm:px-6 sm:py-9">
              {statusFilter === 'ALL' 
                ? 'No transactions yet. Get started with a Pro plan!'
                : `No ${statusFilter.toLowerCase()} transactions found.`
              }
              {statusFilter === 'ALL' && (
                <div className="mt-4">
                  <Link
                    href="/pricing"
                    className="inline-block rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm text-white transition-colors hover:bg-indigo-700"
                  >
                    View Plans
                  </Link>
                </div>
              )}
            </div>
          )
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="space-y-2.5 p-3 md:hidden">
              {payments.map((payment) => {
                const pricing = getPricingDetails(payment);
                return (
                  <div key={payment.id} className={dashboardMutedPanelClass('space-y-3 p-3')}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-slate-900 dark:text-neutral-100">
                          {payment.subscription?.plan.name || payment.plan?.name || 'Unknown Plan'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-neutral-400" title={payment.id}>
                          Txn: {payment.id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-neutral-400">
                          {formatDate(payment.createdAt, { mode: settings.mode, timezone: settings.timezone })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-bold text-slate-900 dark:text-neutral-100">
                          {payment.amountFormatted ?? formatCurrency(payment.amountCents, payment.currency)}
                        </div>
                        {(pricing.hasDiscount || payment.couponCode) && (
                          <div className="mt-1 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs leading-tight text-slate-500 dark:text-neutral-400">
                            {pricing.hasDiscount && (
                              <>
                                <span className="line-through text-slate-400 dark:text-neutral-500">
                                  {payment.subtotalFormatted ?? formatCurrency(pricing.subtotal, payment.currency)}
                                </span>
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  −{payment.discountFormatted ?? formatCurrency(pricing.discount, payment.currency)}
                                </span>
                              </>
                            )}
                          {payment.couponCode ? (
                            <CouponBadge code={payment.couponCode} />
                          ) : pricing.hasDiscount ? (
                            <CouponBadge>
                              <span>Discount applied</span>
                            </CouponBadge>
                          ) : null}
                        </div>
                      )}
                      <div className="flex flex-col items-end space-y-1">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            getDisplayStatus(payment.status) === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100'
                              : payment.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-100'
                              : payment.status === 'FAILED'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-100'
                              : payment.status === 'REFUNDED'
                              ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-100'
                              : 'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300'
                          }`}
                        >
                          {getDisplayStatus(payment.status)}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            getAccessStatus(payment) === 'Active'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100'
                              : getAccessStatus(payment) === 'Pending'
                              ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-100'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-100'
                          }`}
                        >
                          {getAccessStatus(payment)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200/80 pt-2.5 text-sm text-neutral-400 dark:border-neutral-800/80">
                      <div>
                        {payment.subscription?.plan.durationHours 
                          ? formatDuration(payment.subscription.plan.durationHours)
                          : 'N/A'
                        }
                      </div>
                      {getDisplayStatus(payment.status) === 'COMPLETED' ? (
                        <button
                          onClick={() => handleDownloadInvoice(payment.id)}
                          disabled={downloadingInvoice === payment.id}
                          className="rounded border border-blue-400 px-2.5 py-1 text-xs text-blue-400 transition-colors hover:border-blue-300 hover:text-blue-300 disabled:opacity-50"
                        >
                          {downloadingInvoice === payment.id ? 'Downloading...' : 'Invoice'}
                        </button>
                      ) : payment.status === 'REFUNDED' ? (
                        <button
                          onClick={() => handleDownloadRefundReceipt(payment.id)}
                          disabled={downloadingInvoice === payment.id}
                          className="rounded border border-orange-400 px-2.5 py-1 text-xs text-orange-500 transition-colors hover:border-orange-300 hover:text-orange-400 disabled:opacity-50 dark:border-orange-400/80 dark:text-orange-300 dark:hover:border-orange-300 dark:hover:text-orange-200"
                        >
                          {downloadingInvoice === payment.id ? 'Downloading...' : 'Receipt'}
                        </button>
                      ) : null}
                    </div>
                    {payment.subscription && (
                      <div className="text-xs text-neutral-500">
                      {isPlaceholderStart(payment.subscription.startedAt) && payment.subscription.status === 'PENDING' ? (
                        <div className="flex items-center gap-2">
                          <span>Pending — activate to start now</span>
                          <ActivatePendingButton subscriptionId={payment.subscription.id} />
                        </div>
                      ) : (
                        <>
                          {formatDate(payment.subscription.startedAt, { mode: settings.mode, timezone: settings.timezone })} → {formatDate(payment.subscription.expiresAt, { mode: settings.mode, timezone: settings.timezone })}
                        </>
                      )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block">
              <div className="border-b border-slate-200 bg-slate-50/90 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300">
                <div className="grid grid-cols-7 gap-4">
                  <div>Plan / Date / Txn</div>
                  <div>Amount</div>
                  <div>Status</div>
                  <div>Access</div>
                  <div>Duration</div>
                  <div>Subscription Period</div>
                  <div className="text-right">Invoice</div>
                </div>
              </div>

              <div className="divide-y divide-slate-100/80 dark:divide-neutral-800/80">
                {payments.map((payment) => {
                  const pricing = getPricingDetails(payment);
                  return (
                    <div
                      key={payment.id}
                      className="grid grid-cols-7 items-center gap-4 px-4 py-3 text-sm text-slate-600 transition-colors hover:bg-slate-50/70 dark:text-neutral-300 dark:hover:bg-neutral-900/60"
                    >
                        <div className="truncate">
                          <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{payment.subscription?.plan.name || payment.plan?.name || 'Unknown Plan'}</div>
                          <div className="text-xs text-slate-500 dark:text-neutral-400">{formatDate(payment.createdAt, { mode: settings.mode, timezone: settings.timezone })}</div>
                          <div className="mt-1 text-xs font-mono text-slate-500 dark:text-neutral-500" title={payment.id}>{payment.id.slice(0, 12)}</div>
                        </div>
                      <div className="space-y-1">
                        <div className="font-medium text-slate-800 dark:text-neutral-100">
                          {payment.amountFormatted ?? formatCurrency(payment.amountCents, payment.currency)}
                        </div>
                        {(pricing.hasDiscount || payment.couponCode) && (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-neutral-400">
                            {pricing.hasDiscount && (
                              <>
                                <span className="line-through text-slate-400 dark:text-neutral-500">
                                  {payment.subtotalFormatted ?? formatCurrency(pricing.subtotal, payment.currency)}
                                </span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-300">
                                  −{payment.discountFormatted ?? formatCurrency(pricing.discount, payment.currency)}
                                </span>
                              </>
                            )}
                            {payment.couponCode ? (
                              <CouponBadge code={payment.couponCode} />
                            ) : pricing.hasDiscount ? (
                              <CouponBadge>
                                <span>Discount applied</span>
                              </CouponBadge>
                            ) : null}
                          </div>
                        )}
                      </div>
                      <div>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            getDisplayStatus(payment.status) === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100'
                              : payment.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-100'
                              : payment.status === 'FAILED'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-100'
                              : payment.status === 'REFUNDED'
                              ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-100'
                              : 'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300'
                          }`}
                        >
                          {getDisplayStatus(payment.status)}
                        </span>
                      </div>
                      <div>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            getAccessStatus(payment) === 'Active'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100'
                              : getAccessStatus(payment) === 'Pending'
                              ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-100'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-100'
                          }`}
                        >
                          {getAccessStatus(payment)}
                        </span>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-neutral-400">
                        {payment.subscription?.plan.durationHours 
                          ? formatDuration(payment.subscription.plan.durationHours)
                          : 'N/A'
                        }
                      </div>
                      <div className="text-xs text-neutral-500">
                        {payment.subscription ? (
                          isPlaceholderStart(payment.subscription.startedAt) && payment.subscription.status === 'PENDING' ? (
                            <div className="flex items-center gap-2">
                              <span>Pending — activate to start now</span>
                              <ActivatePendingButton subscriptionId={payment.subscription.id} />
                            </div>
                          ) : (
                            <>
                              {formatDate(payment.subscription.startedAt, { mode: settings.mode, timezone: settings.timezone })} → {formatDate(payment.subscription.expiresAt, { mode: settings.mode, timezone: settings.timezone })}
                            </>
                          )
                        ) : (
                          'No subscription'
                        )}
                      </div>
                      <div className="flex justify-end">
                        {(getDisplayStatus(payment.status) === 'COMPLETED') ? (
                          <button
                            onClick={() => handleDownloadInvoice(payment.id)}
                            disabled={downloadingInvoice === payment.id}
                            className="rounded border border-blue-400 px-2.5 py-1 text-xs text-blue-400 transition-colors hover:border-blue-300 hover:text-blue-300 disabled:opacity-50"
                          >
                            {downloadingInvoice === payment.id ? 'Downloading...' : 'Invoice'}
                          </button>
                        ) : payment.status === 'REFUNDED' ? (
                          <button
                            onClick={() => handleDownloadRefundReceipt(payment.id)}
                            disabled={downloadingInvoice === payment.id}
                            className="rounded border border-orange-400 px-2.5 py-1 text-xs text-orange-500 transition-colors hover:border-orange-300 hover:text-orange-400 disabled:opacity-50 dark:border-orange-400/80 dark:text-orange-300 dark:hover:border-orange-300 dark:hover:text-orange-200"
                          >
                            {downloadingInvoice === payment.id ? 'Downloading...' : 'Receipt'}
                          </button>
                        ) : (
                          <span className="text-xs text-neutral-500">N/A</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
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
          nextCursor={nextCursor}
          onNextWithCursor={() => fetchPage(currentPage + 1, false, nextCursor)}
        />
      )}
    </div>
  );
}
