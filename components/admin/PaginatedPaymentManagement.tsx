"use client";

import { useState } from 'react';
import { formatDisplayYMD } from '../../utils/formatDisplayDate';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';
import { AdminPayment, PaymentActionsPayment } from '@/lib/types/admin';
import { PaymentActions } from './PaymentActions';
import { Pagination } from '../ui/Pagination';
import ListFilters from '../ui/ListFilters';
import { BackfillModal } from './BackfillModal';
import { useListFilterState } from '../hooks/useListFilters';
import usePaginatedList from '../hooks/usePaginatedList';
import { CouponBadge } from '../ui/CouponBadge';
import { PaymentProviderBadge } from '../ui/PaymentProviderBadge';
import { dashboardMutedPanelClass, dashboardPanelClass } from '../dashboard/dashboardSurfaces';
import { formatCurrency as formatCurrencyUtil } from '../../lib/utils/currency';


const numberFormatter = new Intl.NumberFormat('en-US');

const formatNumber = (value: number) => numberFormatter.format(value);

interface PaginatedPaymentManagementProps {
  initialPayments: AdminPayment[];
  initialTotalCount: number;
  initialPage: number;
  statusTotals?: Record<string, number>;
}

export function PaginatedPaymentManagement({
  initialPayments,
  initialTotalCount,
  initialPage,
  statusTotals
}: PaginatedPaymentManagementProps) {
  const {
    search: filter,
    setSearch: setFilter,
    debouncedSearch,
    datePreset,
    setDatePreset,
    startDate,
    setStartDate,
    endDate,
    setEndDate
  } = useListFilterState('', 'ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'createdAt' | 'expiresAt' | 'amount'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isBackfillModalOpen, setIsBackfillModalOpen] = useState(false);

  const itemsPerPage = 50;

  const { items: rawPayments, totalCount, currentPage, isLoading, nextCursor, fetchPage, fetchNext, refresh } = usePaginatedList<AdminPayment>({
    basePath: '/api/admin/payments',
    initialItems: initialPayments,
    initialTotalCount: initialTotalCount,
    initialPage: initialPage,
    itemsPerPage,
    filters: {
      search: debouncedSearch || undefined,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      sortBy: ['createdAt', 'expiresAt', 'amount'].includes(sortBy) ? sortBy : 'createdAt',
      sortOrder
      ,
      startDate: startDate || undefined,
      endDate: endDate || undefined
    }
  });
  // Server handles global ordering for amount; use raw server-provided ordering
  const payments = rawPayments;

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));

  // keep helpers referenced to silence lint when some flows only render summaries
  void fetchNext;
  void nextCursor;
  void isLoading;

  const formatCurrency = (amountCents: number, currency?: string | null) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: (currency || 'USD').toUpperCase()
      }).format(amountCents / 100);
    } catch (err) {
      void err;
      return formatCurrencyUtil(amountCents, currency || 'usd');
    }
  };

  const getPricingDetails = (payment: AdminPayment) => {
    const subtotal = typeof payment.subtotalCents === 'number' ? payment.subtotalCents : payment.amountCents;
    const discount = typeof payment.discountCents === 'number' ? payment.discountCents : Math.max(0, subtotal - payment.amountCents);
    const hasDiscount = discount > 0.5;
    return {
      subtotal,
      discount,
      hasDiscount
    };
  };

  // Convert AdminPayment to PaymentActionsPayment for the actions component
  const convertToActionsPayment = (payment: AdminPayment): PaymentActionsPayment => ({
    id: payment.id,
    amountCents: payment.amountCents,
    currency: payment.currency,
    status: payment.status,
    createdAt: payment.createdAt,
    subscription: payment.subscription ? {
      id: payment.subscription.id,
      status: payment.subscription.status,
      expiresAt: payment.subscription.expiresAt,
      externalSubscriptionId: payment.subscription.externalSubscriptionId ?? null,
      stripeSubscriptionId: payment.subscription.stripeSubscriptionId ?? null,
      plan: {
        name: payment.subscription.plan.name,
        autoRenew: payment.subscription.plan.autoRenew
      }
    } : undefined,
    user: payment.user ? {
      email: payment.user.email
    } : undefined
  });

  // Get access status based on subscription status
  const getAccessStatus = (payment: AdminPayment): string => {
    if (!payment.subscription) return 'Expired';

    const status = payment.subscription.status;
    const now = new Date();
    const expiresAt = new Date(payment.subscription.expiresAt);

    if (status === 'ACTIVE' && expiresAt > now) return 'Active';
    // Treat PENDING subscriptions as "Pending" in the admin payments list
    if (status === 'PENDING') return 'Pending';
    return 'Expired';
  };

  // Display payment status with SUCCEEDED as Completed, PENDING_SUBSCRIPTION as PENDING
  const getDisplayStatus = (status: string): string => {
    if (status === 'SUCCEEDED') return 'COMPLETED';
    if (status === 'PENDING_SUBSCRIPTION') return 'PENDING';
    return status;
  };

  const handlePageChange = (page: number) => fetchPage(page);

  const handleFilterChange = (newFilter: string) => setFilter(newFilter);

  const handleStatusFilterChange = (status: string) => setStatusFilter(status);

  const refreshPayments = () => refresh();

  const handlePaymentUpdate = (_paymentId: string) => {
    // Refresh payments when one is updated
    void _paymentId;
    refreshPayments();
  };
  // The hook `usePaginatedList` manages cursors internally; keep fetchNext available.
  // ensure these helpers are referenced to avoid lint warnings in builds where only summaries render
  void fetchNext;
  void nextCursor;
  // NOTE: client-side filtering has been removed. Search/status are handled server-side and
  // the API returns the authoritative set of items for the current filters.
  const filteredPayments = payments;

  // status summary helper removed — counts are still available via server-side aggregates on the transactions page

  // statusCards removed: UI summary cards for payment status were removed per request.

  const settings = useFormatSettings();

  // Timezone-aware helpers — compute YYYY-MM-DD in target IANA timezone
  const ymdFromDateInTZ = (date: Date, tz: string) => {
    // en-CA yields YYYY-MM-DD which is convenient
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

  const computePresetRange = (preset: string, tz: string) => {
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
        // first day of previous month in tz
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
        // ALL or CUSTOM or unknown
        startYMD = null;
        endYMD = null;
    }

    return {
      startDate: startYMD ? formatYMD(startYMD) : null,
      endDate: endYMD ? formatYMD(endYMD) : null
    };
  };

  // Keep ListFilters mounted during loading so the search input doesn't
  // get unmounted (which would blur the input). We'll show the loading
  // skeleton inside the payments list area below when there are no items.

  return (
    <div className="space-y-6">
      {/* Status summary cards removed */}

      <div className={dashboardPanelClass('p-4 sm:p-6')}>
        <ListFilters
          search={filter}
          onSearchChange={handleFilterChange}
          statusOptions={['ALL', 'SUCCEEDED', 'PENDING', 'FAILED', 'REFUNDED', 'ACTIVE', 'EXPIRED']}
          currentStatus={statusFilter}
          onStatusChange={handleStatusFilterChange}
          statusTotals={statusTotals}
          onRefresh={refreshPayments}
          placeholder="Search by email, payment ID, or plan..."
          sortOptions={[
            { value: 'createdAt', label: 'Created' },
            { value: 'expiresAt', label: 'Expires' },
            { value: 'amount', label: 'Amount' }
          ]}
          sortBy={sortBy}
          onSortByChange={(v) => setSortBy(v as 'createdAt' | 'expiresAt' | 'amount')}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          datePreset={datePreset}
          startDate={startDate}
          endDate={endDate}
          onDatePresetChange={(p: 'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'LAST_MONTH' | 'THIS_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR' | 'CUSTOM') => {
            setDatePreset(p);
            const { startDate: sd, endDate: ed } = computePresetRange(p, settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
            setStartDate(sd);
            setEndDate(ed);
            // refresh first page on filter change
            void fetchPage(1);
          }}
          onStartDateChange={(d) => { setStartDate(d); void fetchPage(1); }}
          onEndDateChange={(d) => { setEndDate(d); void fetchPage(1); }}
          additionalButton={{
            label: 'Backfill IDs',
            onClick: () => setIsBackfillModalOpen(true)
          }}
        />
      </div>

      <div
        className={dashboardMutedPanelClass(
          'flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:text-sm dark:text-neutral-300'
        )}
      >
        <span>
          Showing {formatNumber(filteredPayments.length)} of {formatNumber(totalCount)} payments
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {(datePreset && datePreset !== 'ALL') || startDate || endDate ? (
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
              Date: {formatDisplayYMD(startDate)}{endDate ? ` → ${formatDisplayYMD(endDate)}` : ''}{datePreset === 'CUSTOM' ? ' (custom)' : ''}
            </span>
          ) : null}
          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
            Status: {statusFilter === 'ALL' ? 'All statuses' : getDisplayStatus(statusFilter)}
          </span>
          {filter ? (
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
              Search: “{filter}”
            </span>
          ) : null}
        </div>
      </div>

      {/* Payments Table */}
      <div className={dashboardPanelClass('p-0 overflow-hidden')}>
        {filteredPayments.length === 0 ? (
          isLoading ? (
            <div className="space-y-3 p-8">
              <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-neutral-800/60" />
              <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-neutral-800/60" />
              <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-neutral-800/60" />
            </div>
          ) : (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-neutral-400">
              {filter ? 'No payments found matching your search.' : 'No payments found.'}
            </div>
          )
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="min-[1025px]:hidden space-y-4 p-4 sm:p-6">
              {filteredPayments.map((payment) => {
                const pricing = getPricingDetails(payment);
                return (
                  <div key={payment.id} className={dashboardMutedPanelClass('space-y-3 p-4')}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <PaymentProviderBadge provider={payment.paymentProvider} variant="icon" size="md" />
                        <div>
                          <div className="text-base font-semibold text-slate-900 dark:text-neutral-100">
                            {payment.amountFormatted ?? formatCurrency(payment.amountCents, payment.currency)}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-neutral-400">
                            {formatDate(payment.createdAt, { mode: settings.mode, timezone: settings.timezone })}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getDisplayStatus(payment.status) === 'COMPLETED'
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
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getAccessStatus(payment) === 'Active'
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

                    {pricing.hasDiscount ? (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-neutral-400">
                        <span className="line-through text-slate-400 dark:text-neutral-500">
                          {payment.subtotalFormatted ?? formatCurrency(pricing.subtotal, payment.currency)}
                        </span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-300">
                          −{payment.discountFormatted ?? formatCurrency(pricing.discount, payment.currency)}
                        </span>
                        <CouponBadge code={payment.couponCode} />
                      </div>
                    ) : null}

                    <div className="text-xs text-slate-500 dark:text-neutral-400">
                      <span className="font-medium text-slate-600 dark:text-neutral-200">User:</span>{' '}
                      {payment.user?.name ? (
                        <div className="font-medium text-slate-900 dark:text-neutral-100">
                          {payment.user.name}
                        </div>
                      ) : null}
                      <div className="text-xs text-slate-500 dark:text-neutral-400 truncate">
                        {payment.user?.email || 'Unknown'}
                      </div>
                    </div>

                    <div className="text-xs text-slate-500 dark:text-neutral-400">
                      <span className="font-medium text-slate-600 dark:text-neutral-200">Plan:</span>{' '}
                      {payment.subscription?.plan?.name || payment.plan?.name || 'No plan'}
                    </div>

                    <div className="text-xs font-mono text-slate-500 dark:text-neutral-400">
                      {payment.id}
                    </div>

                    {(payment.externalPaymentId || payment.externalSessionId || payment.stripeInvoiceId || payment.dashboardUrl) && (
                      <div className="text-xs font-mono">
                        <a
                          className="text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300"
                          href={payment.dashboardUrl || '#'}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {payment.externalPaymentId || payment.stripeInvoiceId || payment.externalSessionId || 'View'}
                        </a>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <PaymentActions
                        payment={convertToActionsPayment(payment)}
                        onPaymentUpdate={() => handlePaymentUpdate(payment.id)}
                        showReceiptButton={false}
                        refundButtonVariant="icon"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden min-[1025px]:block">
              <div className="border-b border-slate-200 bg-slate-50/90 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-1">Provider</div>
                  <div className="col-span-2">Payment</div>
                  <div className="col-span-2">User</div>
                  <div className="col-span-2">Plan / Amount</div>
                  <div className="col-span-1">Status</div>
                  <div className="col-span-1">Access</div>
                  <div className="col-span-2">Date</div>
                  <div className="col-span-1 text-right">Actions</div>
                </div>
              </div>

              <div className="divide-y divide-slate-100/80 dark:divide-neutral-800/80">
                {filteredPayments.map((payment) => {
                  const pricing = getPricingDetails(payment);
                  return (
                    <div
                      key={payment.id}
                      className="grid grid-cols-12 items-center gap-4 px-6 py-4 text-sm text-slate-600 transition-colors hover:bg-slate-50/70 dark:text-neutral-300 dark:hover:bg-neutral-900/60"
                    >
                      {/* Provider Column */}
                      <div className="col-span-1 min-w-0">
                        <PaymentProviderBadge provider={payment.paymentProvider} size="sm" showName={false} />
                      </div>

                      <div className="col-span-2 min-w-0">
                        <div className="text-xs font-mono text-slate-500 dark:text-neutral-500 truncate">{payment.id}</div>
                        {(payment.externalPaymentId || payment.stripeInvoiceId || payment.externalSessionId || payment.dashboardUrl) ? (
                          <div className="text-xs font-mono mt-1 truncate">
                            <a
                              className="text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300"
                              href={payment.dashboardUrl || '#'}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {payment.externalPaymentId || payment.stripeInvoiceId || payment.externalSessionId || 'View'}
                            </a>
                          </div>
                        ) : (
                          <div className="text-xs font-mono mt-1 text-slate-400 dark:text-neutral-500">—</div>
                        )}
                      </div>


                      <div className="col-span-2 min-w-0">
                        {payment.user?.name ? (
                          <>
                            <div className="font-semibold text-slate-900 dark:text-neutral-100 truncate">
                              {payment.user.name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-neutral-400 truncate">
                              {payment.user.email || 'Unknown'}
                            </div>
                          </>
                        ) : (
                          <div className="truncate">{payment.user?.email || 'Unknown'}</div>
                        )}
                      </div>

                      <div className="col-span-2 min-w-0">
                        <div className="truncate font-medium">{payment.subscription?.plan?.name || payment.plan?.name || 'No plan'}</div>
                        <div className="mt-1 text-sm">
                          <div className="font-medium text-slate-800 dark:text-neutral-100">{payment.amountFormatted ?? formatCurrency(payment.amountCents, payment.currency)}</div>
                          {pricing.hasDiscount ? (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-neutral-400">
                              <span className="line-through text-slate-400 dark:text-neutral-500">{payment.subtotalFormatted ?? formatCurrency(pricing.subtotal, payment.currency)}</span>
                              <span className="font-medium text-emerald-600 dark:text-emerald-300">−{payment.discountFormatted ?? formatCurrency(pricing.discount, payment.currency)}</span>
                              <CouponBadge code={payment.couponCode} />
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="col-span-1">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getDisplayStatus(payment.status) === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100'
                          : payment.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-100'
                            : payment.status === 'FAILED'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-100'
                              : payment.status === 'REFUNDED'
                                ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-100'
                                : 'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300'
                          }`}>{getDisplayStatus(payment.status)}</span>
                      </div>

                      <div className="col-span-1">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getAccessStatus(payment) === 'Active'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100'
                          : getAccessStatus(payment) === 'Pending'
                            ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-100'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-100'
                          }`}>{getAccessStatus(payment)}</span>
                      </div>

                      <div className="col-span-2 min-w-0 text-xs text-slate-500 dark:text-neutral-400">
                        <div className="truncate">{formatDate(payment.createdAt, { mode: settings.mode, timezone: settings.timezone })}</div>
                        {payment.subscription?.expiresAt ? (
                          <div className="text-[13px] text-slate-400 dark:text-neutral-500 truncate">→ {formatDate(payment.subscription.expiresAt, { mode: settings.mode, timezone: settings.timezone })}</div>
                        ) : null}
                      </div>

                      <div className="col-span-1 flex justify-end">
                        <PaymentActions payment={convertToActionsPayment(payment)} onPaymentUpdate={() => handlePaymentUpdate(payment.id)} showReceiptButton={false} refundButtonVariant="icon" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {(totalPages > 1 || nextCursor) && (
        <div className={dashboardPanelClass('p-4 sm:p-6')}>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            totalItems={totalCount}
            itemsPerPage={itemsPerPage}
            nextCursor={nextCursor}
            onNextWithCursor={() => fetchPage(currentPage + 1, false, nextCursor)}
          />
        </div>
      )}

      <BackfillModal
        isOpen={isBackfillModalOpen}
        onClose={() => setIsBackfillModalOpen(false)}
        onRefresh={refreshPayments}
      />
    </div>
  );
}
