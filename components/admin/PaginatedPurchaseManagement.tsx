"use client";

import { useState } from 'react';
import { formatDisplayYMD } from '../../utils/formatDisplayDate';
import { showToast } from '../ui/Toast';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';
import { Pagination } from '../ui/Pagination';
import { CouponBadge } from '../ui/CouponBadge';
import { ConfirmModal } from '../ui/ConfirmModal';
import ListFilters from '../ui/ListFilters';
import { useListFilterState } from '../hooks/useListFilters';
import usePaginatedList from '../hooks/usePaginatedList';
// AdminStatCard not needed for the compact purchases summary
import { dashboardMutedPanelClass, dashboardPanelClass } from '../dashboard/dashboardSurfaces';
import { PaymentActions } from './PaymentActions';
import { PaymentActionsPayment } from '@/lib/types/admin';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleXmark, faCircleNotch, faHourglass, faPenToSquare } from '@fortawesome/free-solid-svg-icons';
import PaymentProviderBadge from '../ui/PaymentProviderBadge';
import { formatCurrency as formatCurrencyUtil } from '../../lib/utils/currency';
import { SubscriptionEditModal } from './SubscriptionEditModal';
// status icons removed since summary cards are being removed

type PurchaseRow = {
  id: string;
  planName: string;
  userName?: string | null;
  userEmail?: string | null;
  userId: string;
  amountCents: number;
  amountFormatted?: string | null;
  subtotalCents?: number | null;
  subtotalFormatted?: string | null;
  discountCents?: number | null;
  discountFormatted?: string | null;
  couponCode?: string | null;
  currency?: string | null;
  status: string;
  createdAt: string;
  externalPaymentId?: string | null;
  externalSessionId?: string | null;
  dashboardUrl?: string | null;
  paymentProvider?: string | null;
  subscription?: {
    id: string;
    status: string;
    expiresAt?: string | null;
    canceledAt?: string | null;
    externalSubscriptionId?: string | null;
  } | null;
};

interface PaginatedPurchaseManagementProps {
  initialPurchases: PurchaseRow[];
  initialTotalCount: number;
  initialPage: number;
  statusTotals?: {
    All: number;
    Succeeded: number;
    Pending: number;
    Failed: number;
    Refunded: number;
    Active: number;
    Expired: number;
  };
  /** Currency code to use for display/formatting (central currency setting). */
  displayCurrency?: string;
}

const numberFormatter = new Intl.NumberFormat('en-US');

const formatNumber = (value: number) => numberFormatter.format(value);

// Best-effort provider inference when the explicit provider is missing
const inferProviderFromIds = (ids: Array<string | null | undefined>): string | null => {
  const id = ids.find((v) => typeof v === 'string' && v.trim().length > 0);
  if (!id) return null;
  if (id.startsWith('pi_') || id.startsWith('cs_') || id.startsWith('ch_')) return 'stripe';
  if (/^\d+$/.test(id)) return 'paystack';
  return null;
};

export function PaginatedPurchaseManagement({
  initialPurchases,
  initialTotalCount,
  initialPage,
  statusTotals,
  displayCurrency
}: PaginatedPurchaseManagementProps) {
  const itemsPerPage = 50;
  const {
    search,
    setSearch,
    debouncedSearch,
    status,
    setStatus,
    datePreset,
    setDatePreset,
    startDate,
    setStartDate,
    endDate,
    setEndDate
  } = useListFilterState('', 'ALL');
  const [sortBy, setSortBy] = useState<'createdAt' | 'expiresAt' | 'amount'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const {
    items: rawPurchases,
    setItems: _setItems,
    totalCount,
    currentPage,
    isLoading,
    nextCursor,
    fetchPage,
    fetchNext: _fetchNext,
    refresh
  } = usePaginatedList<PurchaseRow>({
    basePath: '/api/admin/purchases',
    initialItems: initialPurchases,
    initialTotalCount: initialTotalCount,
    initialPage,
    itemsPerPage,
    itemsKey: 'purchases',
    filters: {
      search: debouncedSearch || undefined,
      status: (status === 'ALL' || status === 'ACTIVE' || status === 'EXPIRED') ? undefined : status,
      access: (status === 'ACTIVE' || status === 'EXPIRED') ? status : undefined,
      sort: ['createdAt', 'expiresAt', 'amount'].includes(sortBy) ? sortBy : 'createdAt',
      order: sortOrder
      ,
      startDate: startDate || undefined,
      endDate: endDate || undefined
    }
  });
  // Server handles global ordering for amount; use raw server-provided ordering
  const purchases = rawPurchases;
  const [expireLoading, setExpireLoading] = useState<Record<string, boolean>>({});
  void _setItems;
  void _fetchNext;
  const settings = useFormatSettings();

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

  const computePresetRange = (preset: 'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'LAST_MONTH' | 'THIS_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR' | 'CUSTOM', tz: string) => {
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

  const formatCurrency = (amountCents: number, currency?: string | null) =>
    formatCurrencyUtil(amountCents, displayCurrency || currency || 'usd');

  const getPricingDetails = (purchase: PurchaseRow) => {
    const subtotal = typeof purchase.subtotalCents === 'number' ? purchase.subtotalCents : purchase.amountCents;
    const discount = typeof purchase.discountCents === 'number' ? purchase.discountCents : Math.max(0, subtotal - purchase.amountCents);
    const hasDiscount = discount > 0.5;
    return {
      subtotal,
      discount,
      hasDiscount
    };
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));

  const getPaymentStatus = (purchase: PurchaseRow): string => {
    return purchase.status === 'SUCCEEDED' ? 'COMPLETED' : purchase.status;
  };

  const getAccessStatus = (purchase: PurchaseRow): string => {
    if (!purchase.subscription) return 'Expired';

    const statusValue = purchase.subscription.status;
    const now = new Date();
    const expiresAt = purchase.subscription.expiresAt ? new Date(purchase.subscription.expiresAt) : null;

    if (statusValue === 'ACTIVE' && expiresAt && expiresAt > now) return 'Active';
    if (statusValue === 'PENDING') return 'Pending';
    return 'Expired';
  };

  const handlePageChange = (page: number) => fetchPage(page);

  const handleFilterChange = (newFilter: string) => setSearch(newFilter);

  const handleStatusFilterChange = (statusVal: string) => {
    setStatus(statusVal);
    fetchPage(1);
  };

  const refreshPurchases = () => refresh();

  const handleNextWithCursor = async (cursor: string) => {
    if (!cursor) return;
    await fetchPage(currentPage + 1, false, cursor);
  };

  const convertToActionsPayment = (purchase: PurchaseRow): PaymentActionsPayment => ({
    id: purchase.id,
    amountCents: purchase.amountCents,
    currency: purchase.currency,
    status: getPaymentStatus(purchase),
    createdAt: new Date(purchase.createdAt),
    subscription: purchase.subscription
      ? {
        id: purchase.subscription.id,
        status: purchase.subscription.status,
        expiresAt: purchase.subscription.expiresAt ?? null,
        externalSubscriptionId: purchase.subscription.externalSubscriptionId ?? null,
        plan: {
          name: purchase.planName || 'Unknown plan',
          autoRenew: null
        }
      }
      : undefined,
    user: purchase.userEmail ? { email: purchase.userEmail } : undefined
  });

  const handlePaymentUpdate = (updated: PaymentActionsPayment) => {
    void updated;
    refreshPurchases();
  };

  const [purchaseToExpire, setPurchaseToExpire] = useState<PurchaseRow | null>(null);
  const [editTarget, setEditTarget] = useState<PurchaseRow | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleExpirePlan = (purchase: PurchaseRow) => {
    if (!purchase.subscription || purchase.subscription.status !== 'ACTIVE') {
      showToast('No active plan to expire', 'info');
      return;
    }
    setPurchaseToExpire(purchase);
  };

  const executeExpirePlan = async () => {
    if (!purchaseToExpire) return;
    const purchase = purchaseToExpire;

    if (expireLoading[purchase.id]) return;

    try {
      setExpireLoading(prev => ({ ...prev, [purchase.id]: true }));

      const response = await fetch(`/api/admin/purchases/${purchase.id}/expire`, {
        method: 'POST'
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        showToast(data?.error ?? 'Unable to expire plan', 'error');
        return;
      }

      showToast('Plan expired', 'success');
      refreshPurchases();
      setPurchaseToExpire(null);
    } catch (err) {
      void err;
      showToast('Unable to expire plan', 'error');
    } finally {
      setExpireLoading(prev => ({ ...prev, [purchase.id]: false }));
    }
  };

  const openEditModal = (purchase: PurchaseRow) => {
    if (!purchase.subscription) {
      showToast('No subscription attached', 'info');
      return;
    }
    setEditError(null);
    setEditTarget(purchase);
  };

  const executeEdit = async (purchase: PurchaseRow, payload: {
    status: 'ACTIVE' | 'EXPIRED';
    expiresAt: string;
    clearScheduledCancellation: boolean;
    allowLocalOverride: boolean;
  }) => {
    if (!purchase.subscription) return;

    try {
      setEditLoading(true);
      setEditError(null);

      const response = await fetch(`/api/admin/subscriptions/${purchase.subscription.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setEditError(data?.error ?? 'Subscription update failed');
        return;
      }

      showToast(`Updated ${purchase.planName}`, 'success');
      if (data?.warning) {
        showToast(data.warning, 'info');
      }
      refreshPurchases();
      setEditTarget(null);
    } catch {
      setEditError('Subscription update failed');
    } finally {
      setEditLoading(false);
    }
  };

  // status summary removed; keep helper logic in server-side aggregates if needed



  // status cards removed

  return (
    <div className="space-y-6">
      {/* Status summary cards removed */}

      <div className={dashboardPanelClass('p-4 sm:p-6')}>
        <ListFilters
          search={search}
          onSearchChange={handleFilterChange}
          statusOptions={['ALL', 'SUCCEEDED', 'PENDING', 'FAILED', 'REFUNDED', 'ACTIVE', 'EXPIRED']}
          currentStatus={status}
          onStatusChange={handleStatusFilterChange}
          onRefresh={refreshPurchases}
          placeholder="Search by email, user ID, plan, or Provider Payment/Invoice ID..."
          statusTotals={statusTotals}
          sortOptions={[
            { value: 'createdAt', label: 'Created' },
            { value: 'expiresAt', label: 'Expires' },
            { value: 'amount', label: 'Amount' }
          ]}
          sortBy={sortBy}
          onSortByChange={(v) => {
            setSortBy(v as 'createdAt' | 'expiresAt' | 'amount');
            // refresh results with new sort
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
          onDatePresetChange={(p: 'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'LAST_MONTH' | 'THIS_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR' | 'CUSTOM') => {
            setDatePreset(p);
            const { startDate: sd, endDate: ed } = computePresetRange(p, settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
            setStartDate(sd);
            setEndDate(ed);
            fetchPage(1);
          }}
          onStartDateChange={(d) => { setStartDate(d); fetchPage(1); }}
          onEndDateChange={(d) => { setEndDate(d); fetchPage(1); }}
        />
      </div>

      <div
        className={dashboardMutedPanelClass(
          'flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:text-sm dark:text-neutral-300'
        )}
      >
        <span>
          Showing {formatNumber(purchases.length)} of {formatNumber(totalCount)} purchases
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {(datePreset && datePreset !== 'ALL') || startDate || endDate ? (
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
              Date: {formatDisplayYMD(startDate)}{endDate ? ` → ${formatDisplayYMD(endDate)}` : ''}{datePreset === 'CUSTOM' ? ' (custom)' : ''}
            </span>
          ) : null}
          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
            Status: {status === 'ALL' ? 'All statuses' : status === 'SUCCEEDED' ? 'Completed' : status.toLowerCase().replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase())}
          </span>
          {search ? (
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
              Search: “{search}”
            </span>
          ) : null}
        </div>
      </div>

      <div className={dashboardPanelClass('p-0 overflow-hidden')}>
        {purchases.length === 0 ? (
          isLoading ? (
            <div className="space-y-3 p-8">
              <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-neutral-800/60" />
              <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-neutral-800/60" />
              <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-neutral-800/60" />
            </div>
          ) : (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-neutral-400">
              {search ? 'No purchases found matching your search.' : 'No purchases found.'}
            </div>
          )
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-4 p-4 sm:p-6">
              {purchases.map((purchase) => {
                const pricing = getPricingDetails(purchase);
                const actionsPayment = convertToActionsPayment(purchase);
                const derivedProvider = purchase.paymentProvider || inferProviderFromIds([
                  purchase.externalPaymentId,
                  purchase.externalSessionId
                ]);
                const hasSubscription = Boolean(purchase.subscription);
                const isActiveSubscription = hasSubscription && purchase.subscription?.status === 'ACTIVE';
                const isExpiring = !!expireLoading[purchase.id];
                const isEditing = editLoading && editTarget?.id === purchase.id;
                const expireDisabled = isExpiring || !isActiveSubscription;
                const expireTooltip = !hasSubscription
                  ? 'No subscription attached'
                  : !isActiveSubscription
                    ? 'Subscription not active'
                    : 'Expire plan';
                const expireIcon = hasSubscription ? faHourglass : faCircleXmark;

                return (
                  <div key={purchase.id} className={dashboardMutedPanelClass('space-y-3 p-4')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{purchase.planName}</div>
                        <div>
                          {purchase.userName ? (
                            <div className="font-medium text-slate-900 dark:text-neutral-100">
                              {purchase.userName}
                            </div>
                          ) : null}
                          <div className="text-xs text-slate-500 dark:text-neutral-400 truncate">
                            {purchase.userEmail || purchase.userId}
                          </div>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <div className="text-base font-semibold text-slate-900 dark:text-neutral-100">
                          {purchase.amountFormatted ?? formatCurrency(purchase.amountCents, purchase.currency)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-neutral-400">
                          {formatDate(purchase.createdAt, { mode: settings.mode, timezone: settings.timezone })}
                        </div>
                      </div>
                    </div>

                    {pricing.hasDiscount ? (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-neutral-400">
                        <span className="line-through text-slate-400 dark:text-neutral-500">
                          {purchase.subtotalFormatted ?? formatCurrency(pricing.subtotal, purchase.currency)}
                        </span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-300">
                          −{purchase.discountFormatted ?? formatCurrency(pricing.discount, purchase.currency)}
                        </span>
                        <CouponBadge code={purchase.couponCode} />
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getPaymentStatus(purchase) === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100'
                          : getPaymentStatus(purchase) === 'PENDING'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-100'
                            : getPaymentStatus(purchase) === 'FAILED'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-100'
                              : getPaymentStatus(purchase) === 'REFUNDED'
                                ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-100'
                                : 'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300'
                          }`}
                      >
                        {getPaymentStatus(purchase)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getAccessStatus(purchase) === 'Active'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100'
                          : getAccessStatus(purchase) === 'Pending'
                            ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-100'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-100'
                          }`}
                      >
                        {getAccessStatus(purchase)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-neutral-400">
                      <PaymentProviderBadge provider={derivedProvider} size="sm" showName={false} />
                      {purchase.dashboardUrl ? (
                        <a
                          className="font-mono text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300"
                          href={purchase.dashboardUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {purchase.externalPaymentId || purchase.externalSessionId || 'View on Dashboard'}
                        </a>
                      ) : (
                        <span className="font-mono">{purchase.id}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      {hasSubscription ? (
                        <button
                          type="button"
                          onClick={() => openEditModal(purchase)}
                          disabled={isEditing}
                          aria-label={isEditing ? 'Edit in progress' : 'Edit subscription'}
                          title={isEditing ? 'Edit in progress' : 'Edit subscription'}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 disabled:cursor-not-allowed ${isEditing
                            ? 'border border-slate-200 bg-slate-100 text-slate-400 hover:bg-slate-100 focus:ring-slate-200 dark:border-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:focus:ring-neutral-700/60'
                            : 'border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 focus:ring-sky-400 dark:border-neutral-500 dark:bg-neutral-700 dark:text-white dark:hover:bg-neutral-600'
                            }`}
                        >
                          <FontAwesomeIcon icon={isEditing ? faCircleNotch : faPenToSquare} className={`h-3.5 w-3.5 ${isEditing ? 'animate-spin' : ''}`.trim()} />
                        </button>
                      ) : null}
                      <PaymentActions
                        payment={actionsPayment}
                        onPaymentUpdate={handlePaymentUpdate}
                        displayCurrency={displayCurrency}
                        showReceiptButton={false}
                        refundButtonVariant="icon"
                        refundTooltip="Refund purchase"
                      />
                      <button
                        type="button"
                        onClick={() => handleExpirePlan(purchase)}
                        disabled={expireDisabled}
                        aria-label={expireTooltip}
                        title={expireTooltip}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 disabled:cursor-not-allowed ${expireDisabled
                          ? 'border border-slate-200 bg-slate-100 text-slate-400 hover:bg-slate-100 focus:ring-slate-200 dark:border-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:focus:ring-neutral-700/60'
                          : 'border border-amber-500 bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500 dark:border-amber-500/70 dark:bg-amber-500/80 dark:hover:bg-amber-500 dark:focus:ring-amber-400'
                          }`}
                      >
                        {isExpiring ? (
                          <FontAwesomeIcon icon={faCircleNotch} className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FontAwesomeIcon icon={expireIcon} className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block">
              <div className="border-b border-slate-200 bg-slate-50/90 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300">
                <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr_0.5fr_1.25fr_0.75fr] gap-3">
                  <div>Plan & Amount</div>
                  <div>User</div>
                  <div>Payment Status</div>
                  <div>Access</div>
                  <div>Valid Period</div>
                  <div>Provider</div>
                  <div>Payment ID</div>
                  <div className="text-right">Actions</div>
                </div>
              </div>

              <div className="divide-y divide-slate-100/80 dark:divide-neutral-800/80">
                {purchases.map((purchase) => {
                  const pricing = getPricingDetails(purchase);
                  const actionsPayment = convertToActionsPayment(purchase);
                  const derivedProvider = purchase.paymentProvider || inferProviderFromIds([
                    purchase.externalPaymentId,
                    purchase.externalSessionId
                  ]);
                  const hasSubscription = Boolean(purchase.subscription);
                  const isActiveSubscription = hasSubscription && purchase.subscription?.status === 'ACTIVE';
                  const isExpiring = !!expireLoading[purchase.id];
                  const isEditing = editLoading && editTarget?.id === purchase.id;
                  const expireDisabled = isExpiring || !isActiveSubscription;
                  const expireTooltip = !hasSubscription
                    ? 'No subscription attached'
                    : !isActiveSubscription
                      ? 'Subscription not active'
                      : 'Expire plan';
                  const expireIcon = hasSubscription ? faHourglass : faCircleXmark;
                  return (
                    <div
                      key={purchase.id}
                      className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr_0.5fr_1.25fr_0.75fr] items-center gap-3 px-6 py-4 text-sm text-slate-600 transition-colors hover:bg-slate-50/70 dark:text-neutral-300 dark:hover:bg-neutral-900/60"
                    >
                      {/* Combined Plan & Amount Column */}
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-neutral-100 truncate">
                          {purchase.planName}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-neutral-300 mt-1">
                          <span className="font-semibold text-slate-900 dark:text-neutral-100">
                            {purchase.amountFormatted ?? formatCurrency(purchase.amountCents, purchase.currency)}
                          </span>
                          {pricing.hasDiscount ? (
                            <>
                              <span className="line-through text-slate-400 dark:text-neutral-500">
                                {purchase.subtotalFormatted ?? formatCurrency(pricing.subtotal, purchase.currency)}
                              </span>
                              <span className="font-medium text-emerald-600 dark:text-emerald-300">
                                −{purchase.discountFormatted ?? formatCurrency(pricing.discount, purchase.currency)}
                              </span>
                              <CouponBadge code={purchase.couponCode} />
                            </>
                          ) : null}
                        </div>
                      </div>

                      {/* User Column */}
                      <div className="min-w-0">
                        {purchase.userName ? (
                          <>
                            <div className="font-semibold text-slate-900 dark:text-neutral-100 truncate">
                              {purchase.userName}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-neutral-400 truncate">
                              {purchase.userEmail || purchase.userId}
                            </div>
                          </>
                        ) : (
                          <div className="truncate text-xs">{purchase.userEmail || purchase.userId}</div>
                        )}
                      </div>

                      {/* Payment Status Column */}
                      <div>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${getPaymentStatus(purchase) === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100'
                            : getPaymentStatus(purchase) === 'PENDING'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-100'
                              : getPaymentStatus(purchase) === 'FAILED'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-100'
                                : getPaymentStatus(purchase) === 'REFUNDED'
                                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-100'
                                  : 'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300'
                            }`}
                        >
                          {getPaymentStatus(purchase)}
                        </span>
                      </div>

                      {/* Access Status Column */}
                      <div>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${getAccessStatus(purchase) === 'Active'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100'
                            : getAccessStatus(purchase) === 'Pending'
                              ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-100'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-100'
                            }`}
                        >
                          {getAccessStatus(purchase)}
                        </span>
                      </div>

                      {/* Valid Period Column */}
                      <div className="text-xs text-slate-500 dark:text-neutral-400 whitespace-nowrap">
                        <div>{formatDate(purchase.createdAt, { mode: settings.mode, timezone: settings.timezone })}</div>
                        {purchase.subscription?.expiresAt ? (
                          <div className="text-slate-400 dark:text-neutral-500">
                            → {formatDate(purchase.subscription.expiresAt, { mode: settings.mode, timezone: settings.timezone })}
                          </div>
                        ) : (
                          <div className="text-slate-400 dark:text-neutral-500">No expiry</div>
                        )}
                      </div>

                      {/* Provider Column */}
                      <div className="flex items-center">
                        <PaymentProviderBadge provider={derivedProvider} size="sm" showName={false} />
                      </div>

                      {/* Payment ID Column */}
                      <div className="text-xs font-mono text-slate-500 dark:text-neutral-400 truncate">
                        {purchase.dashboardUrl ? (
                          <>
                            <a
                              className="text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300 truncate block"
                              href={purchase.dashboardUrl}
                              target="_blank"
                              rel="noreferrer"
                              title={purchase.externalPaymentId || purchase.externalSessionId || ''}
                            >
                              {purchase.externalPaymentId || purchase.externalSessionId || 'View'}
                            </a>
                            <div className="text-slate-400 dark:text-neutral-500 text-[11px] mt-1 truncate" title={purchase.id}>
                              {purchase.id}
                            </div>
                          </>
                        ) : (
                          <div>
                            <div className="text-slate-400 dark:text-neutral-500">—</div>
                            <div className="text-slate-400 dark:text-neutral-500 text-[11px] mt-1 truncate" title={purchase.id}>
                              {purchase.id}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions Column */}
                      <div className="flex items-center justify-end gap-2 flex-shrink-0">
                        {hasSubscription ? (
                          <button
                            type="button"
                            onClick={() => openEditModal(purchase)}
                            disabled={isEditing}
                            aria-label={isEditing ? 'Edit in progress' : 'Edit subscription'}
                            title={isEditing ? 'Edit in progress' : 'Edit subscription'}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed dark:focus:ring-offset-neutral-900 ${isEditing
                              ? 'border border-slate-200 bg-slate-100 text-slate-400 focus:ring-slate-200 dark:border-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-400'
                              : 'border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 focus:ring-sky-400 dark:border-neutral-500 dark:bg-neutral-700 dark:text-white dark:hover:bg-neutral-600'
                              }`}
                          >
                            <FontAwesomeIcon icon={isEditing ? faCircleNotch : faPenToSquare} className={`h-3.5 w-3.5 ${isEditing ? 'animate-spin' : ''}`.trim()} />
                          </button>
                        ) : null}
                        <PaymentActions
                          payment={actionsPayment}
                          onPaymentUpdate={handlePaymentUpdate}
                          displayCurrency={displayCurrency}
                          showReceiptButton={false}
                          refundButtonVariant="icon"
                          refundTooltip="Refund purchase"
                        />
                        <button
                          type="button"
                          onClick={() => handleExpirePlan(purchase)}
                          disabled={expireDisabled}
                          aria-label={expireTooltip}
                          title={expireTooltip}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed flex-shrink-0 ${expireDisabled
                            ? 'border border-slate-200 bg-slate-100 text-slate-400 focus:ring-slate-200 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-500'
                            : 'border border-amber-500 bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500 dark:border-amber-500/70 dark:bg-amber-500/80 dark:hover:bg-amber-500'
                            }`}
                        >
                          {isExpiring ? (
                            <FontAwesomeIcon icon={faCircleNotch} className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FontAwesomeIcon icon={expireIcon} className="h-3.5 w-3.5" />
                          )}
                        </button>
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
            onNextWithCursor={handleNextWithCursor}
          />
        </div>
      )}

      <ConfirmModal
        isOpen={!!purchaseToExpire}
        onClose={() => setPurchaseToExpire(null)}
        onConfirm={executeExpirePlan}
        title="Expire Plan"
        description="Are you sure you want to immediately expire this plan? The user will lose access immediately. This action cannot be undone."
        confirmLabel="Expire Plan"
        loading={!!(purchaseToExpire && expireLoading[purchaseToExpire.id])}
      />

      <SubscriptionEditModal
        isOpen={!!editTarget}
        subscription={editTarget && editTarget.subscription ? {
          id: editTarget.subscription.id,
          planName: editTarget.planName,
          userEmail: editTarget.userEmail,
          userId: editTarget.userId,
          status: editTarget.subscription.status,
          expiresAt: editTarget.subscription.expiresAt ?? null,
          canceledAt: editTarget.subscription.canceledAt ?? null,
          paymentProvider: editTarget.paymentProvider,
          externalSubscriptionId: editTarget.subscription.externalSubscriptionId ?? null,
        } : null}
        loading={editLoading}
        error={editError}
        onClose={() => {
          if (editLoading) return;
          setEditTarget(null);
          setEditError(null);
        }}
        onConfirm={(payload) => {
          if (!editTarget) return;
          void executeEdit(editTarget, payload);
        }}
      />
    </div>
  );
}
