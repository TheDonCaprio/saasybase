'use client';

import { useState } from 'react';
import { formatDisplayYMD } from '../../utils/formatDisplayDate';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';
import { showToast } from '../ui/Toast';
import { ConfirmModal } from '../ui/ConfirmModal';
import { RefundModal } from './RefundModal';
import { SubscriptionEditModal } from './SubscriptionEditModal';
import { Pagination } from '../ui/Pagination';
import { CouponBadge } from '../ui/CouponBadge';
import { PaymentProviderBadge } from '../ui/PaymentProviderBadge';
import ListFilters from '../ui/ListFilters';
import { useListFilterState } from '../hooks/useListFilters';
import usePaginatedList from '../hooks/usePaginatedList';
// AdminStatCard not needed in compact subscriptions view
import { dashboardMutedPanelClass, dashboardPanelClass } from '../dashboard/dashboardSurfaces';
import { formatCurrency as formatCurrencyUtil } from '../../lib/utils/currency';
// status icons removed; status summary cards are being removed per request
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBan,
  faCalendarXmark,
  faArrowRotateLeft,
  faHandHoldingDollar,
  faPenToSquare,
  faSpinner
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

// Best-effort provider inference when explicit provider is missing
const inferProviderFromIds = (ids: Array<string | null | undefined>): string | null => {
  const id = ids.find((v) => typeof v === 'string' && v.trim().length > 0);
  if (!id) return null;
  if (id.startsWith('pi_') || id.startsWith('cs_') || id.startsWith('ch_')) return 'stripe';
  if (/^\d+$/.test(id)) return 'paystack';
  return null;
};

type SubRow = {
  id: string;
  planName: string;
  userEmail?: string | null;
  userName?: string | null;
  userId: string;
  status: string;
  expiresAt?: string | null;
  canceledAt?: string | null;
  planAutoRenew?: boolean | null;
  createdAt: string;
  externalSubscriptionId?: string | null;
  dashboardUrl?: string | null;
  /** Payment provider for this subscription */
  paymentProvider?: string | null;
  latestPayment?: {
    id: string;
    amountCents: number;
    subtotalCents?: number | null;
    discountCents?: number | null;
    amountFormatted?: string | null;
    subtotalFormatted?: string | null;
    discountFormatted?: string | null;
    couponCode?: string | null;
    currency?: string | null;
    createdAt?: string | null;
    externalPaymentId?: string | null;
    externalSessionId?: string | null;
    externalRefundId?: string | null;
    status?: string | null;
    dashboardUrl?: string | null;
    /** Payment provider for the payment */
    paymentProvider?: string | null;
  } | null;
};

interface PaginatedSubscriptionsManagementProps {
  initialSubs: SubRow[];
  initialTotalCount: number;
  initialPage: number;
  statusTotals?: {
    All: number;
    Active: number;
    'Scheduled Cancel': number;
    Cancelled: number;
    Expired: number;
    Succeeded?: number;
    Pending?: number;
    Failed?: number;
    Refunded?: number;
  };
  /** Currency code to use for display/formatting (central currency setting). */
  displayCurrency: string;
}

type PaymentInfo = {
  id: string;
  amount: number;
  subtotal: number;
  discount: number;
  hasDiscount: boolean;
  amountFormatted: string;
  subtotalFormatted: string | null;
  discountFormatted: string | null;
  currency?: string | null;
  couponCode?: string | null;
  externalPaymentId?: string | null;
  externalSessionId?: string | null;
  status: string | null;
  externalRefundId?: string | null;
} | null;

const numberFormatter = new Intl.NumberFormat('en-US');

const formatNumber = (value: number) => numberFormatter.format(value);

const getSubscriptionStatus = (sub: SubRow): string => {
  const isCancelled = (value?: string) => value === 'CANCELLED';
  if (isCancelled(sub.status)) return 'CANCELLED';
  if (sub.canceledAt) return 'SCHEDULED_CANCEL';
  return sub.status;
};

const getLatestPaymentDetails = (sub: SubRow, displayCurrency: string) => {
  const payment = sub.latestPayment;
  if (!payment || typeof payment.amountCents !== 'number' || !payment.id) {
    return null;
  }

  const subtotal = typeof payment.subtotalCents === 'number' ? payment.subtotalCents : payment.amountCents;
  const computedDiscountCents = typeof payment.discountCents === 'number'
    ? payment.discountCents
    : Math.max(0, subtotal - payment.amountCents);
  const hasDiscount = computedDiscountCents > 0.5;

  const amountFormatted = payment.amountFormatted ?? formatCurrencyUtil(payment.amountCents, displayCurrency || payment.currency || '');
  const subtotalFormatted = hasDiscount
    ? payment.subtotalFormatted ?? formatCurrencyUtil(subtotal, displayCurrency || payment.currency || '')
    : null;
  const discountFormatted = hasDiscount
    ? payment.discountFormatted ?? formatCurrencyUtil(computedDiscountCents, displayCurrency || payment.currency || '')
    : null;

  const status = typeof payment.status === 'string' ? payment.status : null;
  return {
    id: payment.id,
    amount: payment.amountCents,
    subtotal,
    discount: computedDiscountCents,
    hasDiscount,
    amountFormatted,
    subtotalFormatted,
    discountFormatted,
    currency: payment.currency,
    couponCode: payment.couponCode,
    externalPaymentId: payment.externalPaymentId,
    externalSessionId: payment.externalSessionId,
    status,
    externalRefundId: payment.externalRefundId
  };
};

const formatStatusFilterLabel = (value: string) => {
  if (value === 'ALL') return 'All statuses';
  return value
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

const getStatusBadgeClass = (statusValue: string) => {
  switch (statusValue) {
    case 'ACTIVE':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100';
    case 'SCHEDULED_CANCEL':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-100';
    case 'CANCELLED':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-100';
    case 'EXPIRED':
      return 'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300';
  }
};

const baseActionButtonClass =
  'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 disabled:cursor-not-allowed';
const disabledActionButtonClass =
  'border border-slate-200 bg-slate-100 text-slate-400 hover:bg-slate-100 focus:ring-slate-200 dark:border-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:focus:ring-neutral-700/60';
const actionButtonVariants: Record<'force-cancel' | 'schedule-cancel' | 'undo' | 'refund' | 'edit', string> = {
  'force-cancel':
    'border border-rose-600 bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500 dark:border-rose-500 dark:bg-rose-500 dark:hover:bg-rose-600',
  'schedule-cancel':
    'border border-amber-500 bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500 dark:border-amber-500/70 dark:bg-amber-500/80 dark:hover:bg-amber-500 dark:focus:ring-amber-400',
  undo:
    'border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 dark:border-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600',
  refund:
    'border border-purple-600 bg-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500 dark:border-purple-500 dark:bg-purple-500 dark:hover:bg-purple-600',
  edit:
    'border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 focus:ring-sky-400 dark:border-neutral-500 dark:bg-neutral-700 dark:text-white dark:hover:bg-neutral-600'
};

const getActionButtonClass = (variant: 'force-cancel' | 'schedule-cancel' | 'undo' | 'refund' | 'edit', disabled: boolean) =>
  `${baseActionButtonClass} ${disabled ? disabledActionButtonClass : actionButtonVariants[variant]}`;

const renderActionButtonContent = (isLoading: boolean, icon: IconDefinition, label: string) => {
  const busy = Boolean(isLoading);
  return (
    <>
      <FontAwesomeIcon
        icon={busy ? faSpinner : icon}
        className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`.trim()}
        aria-hidden="true"
      />
      <span className="sr-only">{busy ? `Processing ${label}` : label}</span>
    </>
  );
};

function SubscriptionRowActions({
  sub,
  paymentInfo,
  onRefresh,
}: {
  sub: SubRow;
  paymentInfo: PaymentInfo;
  onRefresh: () => Promise<unknown> | unknown;
}) {
  const settings = useFormatSettings();
  const [busyAction, setBusyAction] = useState<'force-cancel' | 'schedule-cancel' | 'undo' | 'refund' | 'edit' | null>(null);
  const [pendingAction, setPendingAction] = useState<'force-cancel' | 'schedule-cancel' | 'undo' | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [pendingClearPaidTokens, setPendingClearPaidTokens] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const formatDisplayDate = (iso?: string | null) =>
    iso ? formatDate(iso, { mode: settings.mode, timezone: settings.timezone }) : 'Not set';

  const getActionCopy = (action: 'force-cancel' | 'schedule-cancel' | 'undo') => {
    const subscriber = sub.userEmail || sub.userId;
    const statusLabel = getSubscriptionStatus(sub);
    const planSummary = (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800/40 dark:text-neutral-200">
        <div className="font-semibold text-neutral-900 dark:text-neutral-100">{sub.planName}</div>
        <dl className="mt-3 space-y-2 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-neutral-500 dark:text-neutral-400">Subscriber</span>
            <span className="font-medium text-neutral-800 dark:text-neutral-100">{subscriber}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-neutral-500 dark:text-neutral-400">Current status</span>
            <span className="font-medium text-neutral-800 dark:text-neutral-100">{statusLabel}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-neutral-500 dark:text-neutral-400">Period ends</span>
            <span className="font-medium text-neutral-800 dark:text-neutral-100">{formatDisplayDate(sub.expiresAt)}</span>
          </div>
          {sub.canceledAt && (
            <div className="flex justify-between gap-4">
              <span className="text-neutral-500 dark:text-neutral-400">Scheduled cancel</span>
              <span className="font-medium text-neutral-800 dark:text-neutral-100">{formatDisplayDate(sub.canceledAt)}</span>
            </div>
          )}
        </dl>
      </div>
    );

    switch (action) {
      case 'force-cancel':
        return {
          title: 'Force cancel subscription',
          description: 'Cancel this subscription immediately. The customer will lose access right away and the payment provider will stop future renewals.',
          confirmLabel: 'Force cancel now',
          body: (
            <div className="space-y-4 text-sm">
              {planSummary}
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">
                <p className="font-semibold text-red-900 dark:text-red-100 mb-2">What happens next</p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>The subscription is cancelled immediately locally and with the provider; no further invoices will generate.</li>
                  <li>The subscription status is set to <strong>CANCELLED</strong> and access is revoked instantly.</li>
                  <li>Any scheduled cancellation timestamp is replaced with the current time for audit history.</li>
                </ul>
              </div>
            </div>
          )
        };
      case 'schedule-cancel': {
        const targetDate = sub.canceledAt || sub.expiresAt;
        return {
          title: 'Schedule cancellation',
          description: 'Let the subscription run until the end of the current billing period, then automatically cancel it.',
          confirmLabel: 'Schedule cancellation',
          body: (
            <div className="space-y-4 text-sm">
              {planSummary}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                <p className="font-semibold mb-2">What to expect</p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Stripe marks the subscription to cancel at period end; no immediate charges are refunded.</li>
                  <li>The customer keeps access until <strong>{formatDisplayDate(targetDate)}</strong>.</li>
                  <li>You can undo the scheduled cancellation any time before the period ends.</li>
                </ul>
              </div>
            </div>
          )
        };
      }
      default:
        return {
          title: 'Undo scheduled cancellation',
          description: 'Keep this subscription active and clear the scheduled cancellation date in Stripe.',
          confirmLabel: 'Undo cancellation',
          body: (
            <div className="space-y-4 text-sm">
              {planSummary}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200">
                <p className="font-semibold mb-2">After you confirm</p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Stripe clears the <code>cancel_at_period_end</code> flag so this subscription can renew normally.</li>
                  <li>The local subscription status returns to <strong>ACTIVE</strong> and the scheduled cancel date is removed.</li>
                  <li>The customer retains uninterrupted access to their plan.</li>
                </ul>
              </div>
            </div>
          )
        };
    }
  };

  const canRefundPayment = Boolean(
    paymentInfo && (paymentInfo.status === 'COMPLETED' || paymentInfo.status === 'SUCCEEDED')
  );
  const isBusy = busyAction !== null;
  const isForceDisabled = isBusy || sub.status === 'CANCELLED';
  const isScheduleDisabled = isBusy || sub.status === 'CANCELLED';
  const isUndoDisabled = isBusy || sub.status === 'CANCELLED';
  const isRefundDisabled = isBusy || !canRefundPayment;
  const isEditDisabled = isBusy;

  const busyTooltip = 'Action in progress';
  const alreadyCancelledTooltip = 'Subscription already cancelled';

  const forceTooltip = isForceDisabled ? (isBusy ? busyTooltip : alreadyCancelledTooltip) : 'Force cancel subscription';
  const scheduleTooltip = isScheduleDisabled
    ? (isBusy ? busyTooltip : alreadyCancelledTooltip)
    : 'Schedule cancellation';
  const undoTooltip = isUndoDisabled
    ? (isBusy ? busyTooltip : 'Cannot undo a fully cancelled subscription')
    : 'Undo scheduled cancellation';
  const editTooltip = isEditDisabled ? busyTooltip : 'Edit subscription status and billing date';
  const refundTooltip = isRefundDisabled
    ? isBusy
      ? busyTooltip
      : paymentInfo
        ? paymentInfo.status === 'REFUNDED'
          ? 'Payment already refunded'
          : 'Refund not available for this payment'
        : 'Refund not available'
    : 'Refund latest payment';

  const pendingActionCopy = pendingAction ? getActionCopy(pendingAction) : null;

  const requestAction = (action: 'force-cancel' | 'schedule-cancel' | 'undo') => {
    setPendingAction(action);
    void (async () => {
      try {
        const planAuto = sub.planAutoRenew === true;
        const key = planAuto ? 'TOKENS_RESET_ON_EXPIRY_RECURRING' : 'TOKENS_RESET_ON_EXPIRY_ONE_TIME';
        const res = await fetch(`/api/admin/settings?key=${encodeURIComponent(key)}`);
        if (!res.ok) {
          setPendingClearPaidTokens(false);
          return;
        }
        const json = await res.json().catch(() => null);
        setPendingClearPaidTokens(json?.value === 'true');
      } catch {
        setPendingClearPaidTokens(false);
      }
    })();
  };

  const executeAction = async (action: 'force-cancel' | 'schedule-cancel' | 'undo') => {
    try {
      setBusyAction(action);
      const res = await fetch(`/api/admin/subscriptions/${sub.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearPaidTokens: pendingClearPaidTokens })
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        showToast(json?.error || 'Request failed', 'error');
      } else {
        const actionSuccess = action === 'force-cancel'
          ? 'Force cancellation completed'
          : action === 'schedule-cancel'
            ? 'Cancellation scheduled'
            : 'Scheduled cancellation removed';
        showToast(`${actionSuccess} for ${sub.planName}`, 'success');
        await onRefresh();
      }
    } catch {
      showToast('Request failed', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const executeRefund = async (
    reason: string,
    notes?: string,
    cancelSubscription?: boolean,
    cancelMode?: 'immediate' | 'period_end',
    localCancelMode?: 'immediate' | 'period_end',
    clearPaidTokens?: boolean
  ) => {
    if (!paymentInfo) return;
    try {
      setRefundLoading(true);
      setBusyAction('refund');
      const res = await fetch(`/api/admin/payments/${paymentInfo.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, notes, cancelSubscription, cancelMode, localCancelMode, clearPaidTokens })
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setRefundError(json?.error || 'Refund request failed');
      } else {
        showToast(`Refund processed for ${formatCurrencyUtil(paymentInfo.amount, paymentInfo.currency ?? '')}`, 'success');
        await onRefresh();
        setRefundOpen(false);
        setRefundError(null);
      }
    } catch {
      setRefundError('A network error occurred. Please check your connection and try again.');
    } finally {
      setBusyAction(null);
      setRefundLoading(false);
    }
  };

  const executeEdit = async (payload: {
    status: 'ACTIVE' | 'EXPIRED';
    expiresAt: string;
    clearScheduledCancellation: boolean;
    allowLocalOverride: boolean;
  }) => {
    try {
      setEditLoading(true);
      setEditError(null);
      setBusyAction('edit');

      const res = await fetch(`/api/admin/subscriptions/${sub.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setEditError(json?.error || 'Subscription update failed');
        return;
      }

      showToast(`Updated ${sub.planName}`, 'success');
      if (json?.warning) {
        showToast(json.warning, 'info');
      }
      await onRefresh();
      setEditOpen(false);
    } catch {
      setEditError('Subscription update failed');
    } finally {
      setBusyAction(null);
      setEditLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setEditError(null);
          setEditOpen(true);
        }}
        className={getActionButtonClass('edit', isEditDisabled)}
        disabled={isEditDisabled}
        title={editTooltip}
        aria-label={editTooltip}
      >
        {renderActionButtonContent(isBusy, faPenToSquare, 'Edit subscription')}
      </button>
      <button
        type="button"
        onClick={() => requestAction('force-cancel')}
        className={getActionButtonClass('force-cancel', isForceDisabled)}
        disabled={isForceDisabled}
        title={forceTooltip}
        aria-label={forceTooltip}
      >
        {renderActionButtonContent(isBusy, faBan, 'Force cancel subscription')}
      </button>
      {!sub.canceledAt ? (
        <button
          type="button"
          onClick={() => requestAction('schedule-cancel')}
          className={getActionButtonClass('schedule-cancel', isScheduleDisabled)}
          disabled={isScheduleDisabled}
          title={scheduleTooltip}
          aria-label={scheduleTooltip}
        >
          {renderActionButtonContent(isBusy, faCalendarXmark, 'Schedule cancellation')}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => requestAction('undo')}
          className={getActionButtonClass('undo', isUndoDisabled)}
          disabled={isUndoDisabled}
          title={undoTooltip}
          aria-label={undoTooltip}
        >
          {renderActionButtonContent(isBusy, faArrowRotateLeft, 'Undo scheduled cancellation')}
        </button>
      )}
      {paymentInfo ? (
        <button
          type="button"
          onClick={() => {
            setRefundError(null);
            setRefundOpen(true);
          }}
          className={getActionButtonClass('refund', isRefundDisabled)}
          disabled={isRefundDisabled}
          title={refundTooltip}
          aria-label={refundTooltip}
        >
          {renderActionButtonContent(isBusy, faHandHoldingDollar, 'Refund latest payment')}
        </button>
      ) : null}

      {pendingAction && pendingActionCopy && (
        <ConfirmModal
          isOpen={true}
          title={pendingActionCopy.title}
          description={pendingActionCopy.description}
          confirmLabel={pendingActionCopy.confirmLabel}
          cancelLabel="Cancel"
          loading={modalLoading}
          onClose={() => {
            if (modalLoading) return;
            setPendingAction(null);
          }}
          onConfirm={() => {
            setModalLoading(true);
            void executeAction(pendingAction).finally(() => {
              setModalLoading(false);
              setPendingAction(null);
            });
          }}
        >
          <div className="space-y-4">
            {pendingActionCopy.body}
            {(pendingAction === 'force-cancel' || pendingAction === 'schedule-cancel') && (
              <div className="pt-2 border-t border-neutral-800">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pendingClearPaidTokens}
                    onChange={(event) => setPendingClearPaidTokens(event.target.checked)}
                    disabled={modalLoading}
                    className="mt-0.5 w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 disabled:opacity-50"
                  />
                  <div className="flex-1">
                    <div className="text-xs font-medium text-white">Also clear paid tokens</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">When checked, this will zero the user&apos;s paid token balance as part of this cancellation action.</div>
                  </div>
                </label>
              </div>
            )}
          </div>
        </ConfirmModal>
      )}

      {paymentInfo ? (
        <RefundModal
          isOpen={refundOpen}
          onClose={() => {
            if (refundLoading) return;
            setRefundOpen(false);
            setRefundError(null);
          }}
          onConfirm={executeRefund}
          amount={paymentInfo.amount}
          paymentId={paymentInfo.externalPaymentId || paymentInfo.externalSessionId || paymentInfo.id}
          loading={refundLoading}
          error={refundError}
          hasActiveSubscription={true}
          subscriptionPlanAutoRenew={sub.planAutoRenew ?? null}
          subscriptionExpiresAt={sub.expiresAt ?? null}
          hasProviderSubscription={Boolean(sub.externalSubscriptionId)}
        />
      ) : null}

      <SubscriptionEditModal
        isOpen={editOpen}
        subscription={editOpen ? sub : null}
        loading={editLoading}
        error={editError}
        onClose={() => {
          if (editLoading) return;
          setEditOpen(false);
          setEditError(null);
        }}
        onConfirm={(payload) => {
          void executeEdit(payload);
        }}
      />
    </>
  );
}

export function PaginatedSubscriptionsManagement({
  initialSubs,
  initialTotalCount,
  initialPage,
  statusTotals,
  displayCurrency
}: PaginatedSubscriptionsManagementProps) {
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
  // Only allow server-sortable fields here. Name/Email sorting removed — sorting is server-side.
  const [sortBy, setSortBy] = useState<'createdAt' | 'expiresAt' | 'amount'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const {
    items: rawSubs,
    setItems: _setItems,
    totalCount,
    currentPage,
    isLoading,
    nextCursor,
    fetchPage,
    fetchNext: _fetchNext,
    refresh
  } = usePaginatedList<SubRow>({
    basePath: '/api/admin/subscriptions',
    initialItems: initialSubs,
    initialTotalCount: initialTotalCount,
    initialPage,
    itemsPerPage,
    itemsKey: 'subscriptions',
    filters: {
      search: debouncedSearch || undefined,
      status: status === 'ALL' ? undefined : status,
      sort: ['createdAt', 'expiresAt', 'amount'].includes(sortBy) ? sortBy : 'createdAt',
      order: sortOrder,
      startDate: startDate || undefined,
      endDate: endDate || undefined
    }
  });

  // Server provides the authoritative ordering; do not apply client-side sorts here.
  const subs = rawSubs;

  // underscore-prefixed setters from hook are intentionally unused here in some builds
  void _setItems;
  void _fetchNext;

  const settings = useFormatSettings();

  // Timezone-aware helpers — compute YYYY-MM-DD in target IANA timezone
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

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));

  // usePaginatedList handles fetching; use fetchPage / fetchNext / refresh

  const handlePageChange = (page: number) => fetchPage(page);

  const handleFilterChange = (newFilter: string) => setSearch(newFilter);

  const handleStatusFilterChange = (statusVal: string) => {
    setStatus(statusVal);
    fetchPage(1);
  };

  const refreshSubscriptions = () => refresh();

  // Handler for progressive cursor-based next (navigate with cursor)
  const handleNextWithCursor = async (cursor: string) => {
    if (!cursor) return;
    await fetchPage(currentPage + 1, false, cursor);
  };

  // initialSubs are wired into hook via initialItems; no manual nextCursor derivation needed here

  return (
    <div className="space-y-6">
      {/* Status summary cards removed */}

      <div className={dashboardPanelClass('p-3 sm:p-4')}>
        <ListFilters
          search={search}
          onSearchChange={(v) => handleFilterChange(v)}
          statusOptions={['ALL', 'SUCCEEDED', 'PENDING', 'FAILED', 'REFUNDED', 'ACTIVE', 'SCHEDULED_CANCEL', 'CANCELLED', 'EXPIRED']}
          currentStatus={status}
          onStatusChange={(s) => handleStatusFilterChange(s)}
          onRefresh={refreshSubscriptions}
          placeholder="Search by email, user ID, plan, or subscription ID..."
          statusTotals={statusTotals}
          sortOptions={[
            { value: 'createdAt', label: 'Created' },
            { value: 'expiresAt', label: 'Expires' },
            { value: 'amount', label: 'Amount' }
          ]}
          sortBy={sortBy}
          onSortByChange={(v) => {
            setSortBy(v as 'createdAt' | 'expiresAt' | 'amount');
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
            const { startDate: sd, endDate: ed } = computePresetRange(
              p,
              settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
            );
            setStartDate(sd);
            setEndDate(ed);
            void fetchPage(1);
          }}
          onStartDateChange={(d) => { setStartDate(d); void fetchPage(1); }}
          onEndDateChange={(d) => { setEndDate(d); void fetchPage(1); }}
        />
      </div>

      <div
        className={dashboardMutedPanelClass(
          'px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:text-sm dark:text-neutral-300'
        )}
      >
        <span>
          Showing {formatNumber(subs.length)} of {formatNumber(totalCount)} subscriptions
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {(datePreset && datePreset !== 'ALL') || startDate || endDate ? (
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm dark:bg-neutral-900/60 dark:text-neutral-200">
              Date: {formatDisplayYMD(startDate)}{endDate ? ` → ${formatDisplayYMD(endDate)}` : ''}{datePreset === 'CUSTOM' ? ' (custom)' : ''}
            </span>
          ) : null}
          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm dark:bg-neutral-900/60 dark:text-neutral-200">
            Status: {formatStatusFilterLabel(status)}
          </span>
          {search ? (
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm dark:bg-neutral-900/60 dark:text-neutral-200">
              Search: “{search}”
            </span>
          ) : null}
        </div>
      </div>

      <div className={dashboardPanelClass('overflow-hidden p-0')}>
        {subs.length === 0 ? (
          isLoading ? (
            <div className="space-y-3 p-6">
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-neutral-900/60" />
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-neutral-900/60" />
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-neutral-900/60" />
            </div>
          ) : (
            <div className="p-12 text-center text-sm text-slate-500 dark:text-neutral-400">
              {search ? 'No subscriptions match your search yet.' : 'No subscriptions found.'}
            </div>
          )
        ) : (
          <>
            <div className="space-y-3 p-3 sm:p-4 md:hidden">
              {subs.map((sub) => {
                const paymentInfo = getLatestPaymentDetails(sub, displayCurrency);
                const statusLabel = getSubscriptionStatus(sub);
                const derivedProvider = sub.paymentProvider
                  || sub.latestPayment?.paymentProvider
                  || inferProviderFromIds([
                    sub.latestPayment?.externalPaymentId,
                    sub.externalSubscriptionId
                  ]);

                return (
                  <div key={sub.id} className={dashboardMutedPanelClass('space-y-3 p-3 sm:p-4')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{sub.planName}</p>
                        <div className="text-xs text-slate-500 dark:text-neutral-400">
                          {sub.userName ? (
                            <div className="font-medium text-slate-900 dark:text-neutral-100">
                              {sub.userName}
                            </div>
                          ) : null}
                          <div className="text-xs text-slate-500 dark:text-neutral-400 truncate">
                            {sub.userEmail ?? sub.userId}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getStatusBadgeClass(statusLabel)}`}
                        >
                          {statusLabel}
                        </span>
                        {paymentInfo ? (
                          <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">
                            {paymentInfo.amountFormatted}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {paymentInfo ? (
                      <div className="space-y-1 text-xs text-slate-500 dark:text-neutral-400">
                        {paymentInfo.hasDiscount || paymentInfo.couponCode ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {paymentInfo.hasDiscount ? (
                              <>
                                <span className="line-through text-slate-400 dark:text-neutral-500">
                                  {paymentInfo.subtotalFormatted ?? formatCurrencyUtil(paymentInfo.subtotal, displayCurrency || paymentInfo.currency || '')}
                                </span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-300">
                                  −{paymentInfo.discountFormatted ?? formatCurrencyUtil(paymentInfo.discount, displayCurrency || paymentInfo.currency || '')}
                                </span>
                              </>
                            ) : null}
                            <CouponBadge code={paymentInfo.couponCode} />
                          </div>
                        ) : null}
                        <div className="font-mono text-slate-500 dark:text-neutral-400">
                          Payment ID: {paymentInfo.id}
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-1 text-xs text-slate-500 dark:text-neutral-400">
                      <div>
                        <span className="font-medium text-slate-600 dark:text-neutral-200">Created:</span>{' '}
                        {formatDate(sub.createdAt, { mode: settings.mode, timezone: settings.timezone })}
                      </div>
                      <div>
                        <span className="font-medium text-slate-600 dark:text-neutral-200">Access ends:</span>{' '}
                        {sub.expiresAt
                          ? formatDate(sub.expiresAt, { mode: settings.mode, timezone: settings.timezone })
                          : 'Not set'}
                      </div>
                      {/* cancelled date removed from Dates column - shown in Status column already */}
                    </div>

                    {/* Provider + Dashboard URL */}
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <PaymentProviderBadge provider={derivedProvider} size="sm" showName={false} />
                      {sub.dashboardUrl ? (
                        <a
                          className="text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300"
                          href={sub.dashboardUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {sub.externalSubscriptionId || sub.id}
                        </a>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <SubscriptionRowActions
                        sub={sub}
                        paymentInfo={paymentInfo}
                        onRefresh={refreshSubscriptions}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block">
              <div className="border-b border-slate-200 bg-slate-50/90 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300">
                <div className="grid grid-cols-[1.55fr_1.75fr_1fr_1fr_1fr_0.6fr_1.75fr_1.35fr] gap-3">
                  <div>Plan</div>
                  <div>User</div>
                  <div>Access</div>
                  <div>Payment Status</div>
                  <div>Valid Period</div>
                  <div>Provider</div>
                  <div>Provider / Txn</div>
                  <div className="text-right">Actions</div>
                </div>
              </div>

              <div className="divide-y divide-slate-100/80 dark:divide-neutral-800/80">
                {subs.map((sub) => {
                  const paymentInfo = getLatestPaymentDetails(sub, displayCurrency);
                  const statusLabel = getSubscriptionStatus(sub);
                  const derivedProvider = sub.paymentProvider
                    || sub.latestPayment?.paymentProvider
                    || inferProviderFromIds([
                      sub.latestPayment?.externalPaymentId,
                      sub.externalSubscriptionId
                    ]);

                  return (
                    <div
                      key={sub.id}
                      className="grid grid-cols-[1.55fr_1.75fr_1fr_1fr_1fr_0.6fr_1.75fr_1.35fr] items-center gap-3 px-6 py-4 text-sm text-slate-600 transition-colors hover:bg-slate-50/70 dark:text-neutral-300 dark:hover:bg-neutral-900/60 min-w-0"
                    >
                      {/* Plan Column */}
                      <div className="space-y-1 min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-neutral-100">{sub.planName}</div>
                        {paymentInfo ? (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-neutral-400">
                            <span className="font-semibold text-slate-900 dark:text-neutral-100">
                              {paymentInfo.amountFormatted}
                            </span>
                            {paymentInfo.hasDiscount ? (
                              <div className="flex flex-wrap gap-2 justify-end">
                                <span className="line-through text-slate-400 dark:text-neutral-500">
                                  {paymentInfo.subtotalFormatted ?? formatCurrencyUtil(paymentInfo.subtotal, displayCurrency || paymentInfo.currency || '')}
                                </span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-300">
                                  −{paymentInfo.discountFormatted ?? formatCurrencyUtil(paymentInfo.discount, displayCurrency || paymentInfo.currency || '')}
                                </span>
                              </div>
                            ) : null}
                            <CouponBadge code={paymentInfo.couponCode} />
                          </div>
                        ) : null}
                      </div>

                      {/* User Column */}
                      <div className="min-w-0">
                        {sub.userName ? (
                          <>
                            <div className="font-semibold text-slate-900 dark:text-neutral-100 truncate">
                              {sub.userName}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-neutral-400 truncate">
                              {sub.userEmail ?? sub.userId}
                            </div>
                          </>
                        ) : (
                          <div className="truncate">{sub.userEmail || sub.userId}</div>
                        )}
                      </div>

                      {/* Access Column (was Status) */}
                      <div className="space-y-1">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${getStatusBadgeClass(statusLabel)}`}
                        >
                          {statusLabel}
                        </span>
                        {sub.canceledAt ? (
                          <div className="text-xs font-medium text-amber-600 dark:text-amber-300">
                            Cancels {formatDate(sub.canceledAt, { mode: settings.mode, timezone: settings.timezone })}
                          </div>
                        ) : null}
                      </div>

                      {/* Payment Status Column (new) */}
                      <div>
                        {paymentInfo?.status ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${paymentInfo.status === 'SUCCEEDED' || paymentInfo.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100'
                              : paymentInfo.status === 'PENDING'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-100'
                                : paymentInfo.status === 'FAILED'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-100'
                                  : paymentInfo.status === 'REFUNDED'
                                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-100'
                                    : 'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300'
                              }`}
                          >
                            {paymentInfo.status === 'COMPLETED' ? 'SUCCEEDED' : paymentInfo.status}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-neutral-500">—</span>
                        )}
                      </div>

                      {/* Valid Period Column (simplified Dates) */}
                      <div className="text-xs text-slate-500 dark:text-neutral-400 whitespace-nowrap">
                        <div>{formatDate(sub.createdAt, { mode: settings.mode, timezone: settings.timezone })}</div>
                        {sub.expiresAt ? (
                          <div className="text-slate-400 dark:text-neutral-500">
                            → {formatDate(sub.expiresAt, { mode: settings.mode, timezone: settings.timezone })}
                          </div>
                        ) : (
                          <div className="text-slate-400 dark:text-neutral-500">→ Not set</div>
                        )}
                      </div>

                      {/* Provider Column */}
                      <div className="flex items-center">
                        <PaymentProviderBadge provider={derivedProvider} size="sm" showName={false} />
                      </div>

                      {/* Stripe / Txn Column */}
                      <div className="text-xs font-mono truncate">
                        {paymentInfo?.id ? (
                          <div className="truncate">{paymentInfo.id}</div>
                        ) : null}
                        {sub.dashboardUrl ? (
                          <a
                            className="text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300 block truncate"
                            href={sub.dashboardUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {sub.externalSubscriptionId || sub.id}
                          </a>
                        ) : (
                          paymentInfo?.id ? null : <span className="text-slate-400 dark:text-neutral-500">—</span>
                        )}
                      </div>

                      {/* Actions Column */}
                      <div className="flex flex-wrap gap-2 justify-end">
                        <SubscriptionRowActions
                          sub={sub}
                          paymentInfo={paymentInfo}
                          onRefresh={refreshSubscriptions}
                        />
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
    </div>
  );
}
