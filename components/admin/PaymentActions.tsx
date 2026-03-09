'use client';

import { useState } from 'react';
import { PaymentActionsPayment } from '@/lib/types/admin';
import { RefundModal } from './RefundModal';
import { showToast } from '../ui/Toast';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHandHoldingDollar, faCircleNotch } from '@fortawesome/free-solid-svg-icons';
import { formatCurrency } from '../../lib/utils/currency';

interface PaymentActionsProps {
  payment: PaymentActionsPayment;
  onPaymentUpdate: (payment: PaymentActionsPayment) => void;
  /** Currency code to use for display/formatting (central currency setting). */
  displayCurrency?: string;
  showReceiptButton?: boolean;
  refundButtonVariant?: 'text' | 'icon';
  refundTooltip?: string;
}

export function PaymentActions({
  payment,
  onPaymentUpdate,
  displayCurrency,
  showReceiptButton = true,
  refundButtonVariant = 'text',
  refundTooltip = 'Refund payment'
}: PaymentActionsProps) {
  const [loading, setLoading] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [downloadingReceipt, setDownloadingReceipt] = useState<string | null>(null);

  const handleRefundClick = () => {
    if (loading || payment.status === 'REFUNDED') return;
    setRefundError(null);
    setShowRefundModal(true);
  };

  const handleRefundConfirm = async (
    reason: string,
    customReason?: string,
    cancelSubscription?: boolean,
    cancelMode?: 'immediate' | 'period_end',
    localCancelMode?: 'immediate' | 'period_end',
    clearPaidTokens?: boolean
  ) => {
    setLoading(true);
    
    try {
      const response = await fetch(`/api/admin/payments/${payment.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reason: reason,
          notes: customReason,
          cancelSubscription,
          cancelMode,
          localCancelMode,
          clearPaidTokens
        })
      });

  if (response.ok) {
  const _result = await response.json().catch(() => null);
  void _result;
        const updatedPayment = { ...payment, status: 'REFUNDED' };
        onPaymentUpdate(updatedPayment);
        setShowRefundModal(false);
        setRefundError(null);
        showToast(
          `Refund of ${formatCurrency(payment.amountCents, displayCurrency ?? payment.currency ?? 'usd')} processed successfully`,
          'success'
        );
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || 'An unexpected error occurred while processing the refund.';
        setRefundError(errorMessage);
      }
    } catch (error) {
      console.error('Error processing refund:', error);
      setRefundError('A network error occurred. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefundCancel = () => {
    setShowRefundModal(false);
    setRefundError(null);
  };

  const canRefund = payment.status === 'COMPLETED' || payment.status === 'SUCCEEDED';
  const isRefundDisabled = loading || !canRefund;
  const shouldShowReceipt = showReceiptButton && payment.status === 'REFUNDED';
  const iconOnly = refundButtonVariant === 'icon';
  const hasProviderSubscription = Boolean(payment.subscription?.externalSubscriptionId);

  const handleDownloadRefundReceipt = async (paymentId: string) => {
    setDownloadingReceipt(paymentId);
    try {
      const res = await fetch(`/api/billing/refund-receipt/${paymentId}`);
      if (!res.ok) throw new Error('Failed to generate refund receipt');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `refund-${paymentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast('Refund receipt downloaded', 'success');
    } catch (err) {
      console.error('Error downloading refund receipt', err);
      showToast('Unable to download refund receipt', 'error');
    } finally {
      setDownloadingReceipt(null);
    }
  };

  return (
    <>
      {shouldShowReceipt ? (
        <button
          onClick={() => handleDownloadRefundReceipt(payment.id)}
          disabled={!!downloadingReceipt}
          className="text-xs rounded px-2 py-1 bg-blue-600 text-white border border-blue-700 hover:bg-blue-700"
        >
          {downloadingReceipt === payment.id ? 'Downloading…' : 'Receipt'}
        </button>
      ) : (
        <button
          onClick={handleRefundClick}
          disabled={isRefundDisabled}
          type="button"
          aria-label={refundTooltip}
          title={refundTooltip}
          className={iconOnly
            ? `inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 disabled:cursor-not-allowed ${
                isRefundDisabled
                  ? 'border-slate-200 bg-slate-100 text-slate-400 hover:bg-slate-100 focus:ring-slate-200 dark:border-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:focus:ring-neutral-700/60'
                  : 'border-transparent bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 dark:bg-red-500 dark:hover:bg-red-600'
              }`
            : `inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 disabled:cursor-not-allowed ${
                isRefundDisabled
                  ? 'border-slate-300 bg-slate-200 text-slate-500 hover:bg-slate-200 focus:ring-slate-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:focus:ring-neutral-700'
                  : 'border-red-700 bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 dark:border-red-500 dark:bg-red-500 dark:hover:bg-red-600'
              }`}
        >
          {loading ? (
            iconOnly ? (
              <FontAwesomeIcon icon={faCircleNotch} className="h-4 w-4 animate-spin" />
            ) : (
              'Processing...'
            )
          ) : iconOnly ? (
            <FontAwesomeIcon icon={faHandHoldingDollar} className="h-4 w-4" />
          ) : (
            'Refund'
          )}
        </button>
      )}

      <RefundModal
        isOpen={showRefundModal}
        onClose={handleRefundCancel}
        onConfirm={handleRefundConfirm}
        amount={payment.amountCents}
        displayCurrency={displayCurrency ?? payment.currency ?? undefined}
        paymentId={payment.id}
        loading={loading}
        error={refundError}
        hasActiveSubscription={!!payment.subscription}
        subscriptionPlanAutoRenew={payment.subscription?.plan?.autoRenew ?? null}
        subscriptionExpiresAt={payment.subscription?.expiresAt ?? null}
        hasProviderSubscription={hasProviderSubscription}
      />
    </>
  );
}
