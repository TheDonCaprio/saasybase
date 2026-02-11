'use client';

import { useState } from 'react';
import { useFormatSettings } from '../../components/FormatSettingsProvider';
import { CancelSubscriptionModal } from './CancelSubscriptionModal';
import { showToast } from '../ui/Toast';
import { formatDate } from '../../lib/formatDate';

interface PaymentManagementProps {
  isActive: boolean;
  recentPayments: Array<{
    id: string;
    amountCents: number;
    currency: string;
    status: string;
    createdAt: Date;
    subscription?: {
      plan?: {
        name: string;
      };
    } | null;
  }>;
  isCancellationScheduled?: boolean;
  canceledAt?: string | null;
  planAutoRenew?: boolean;
  nextBillingDate?: string | null;
  preformattedNextBillingDate?: string | null;
  preformattedCanceledAt?: string | null;
  preformattedRecentPayments?: Array<{ id: string; formattedCreatedAt: string }>;
}

export default function PaymentManagement({
  isActive,
  recentPayments,
  isCancellationScheduled,
  canceledAt,
  planAutoRenew = true,
  nextBillingDate = null
  , preformattedNextBillingDate = null, preformattedCanceledAt = null, preformattedRecentPayments = []
}: PaymentManagementProps) {
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState<string | null>(null);

  const settings = useFormatSettings();

  const handleUpdatePaymentMethod = async () => {
    setIsUpdatingPayment(true);
    try {
      const response = await fetch('/api/billing/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to create customer portal session');
      }

      const data = await response.json();
      const url = typeof data?.url === 'string' ? data.url : null;
      const supported = data?.supported !== false;
      const message = typeof data?.message === 'string' ? data.message : null;

      if (!supported) {
        showToast(message || 'Payment portal is not available for your provider.', 'error');
        return;
      }

      if (!url) {
        throw new Error('Missing portal URL');
      }

      window.location.href = url;

    } catch (error) {
      console.error('Error opening customer portal:', error);
      showToast('Unable to open payment management. Please try again.', 'error');
    } finally {
      setIsUpdatingPayment(false);
    }
  };

  const handleDownloadInvoice = async (paymentId: string) => {
    setIsDownloadingInvoice(paymentId);
    try {
      const response = await fetch(`/api/billing/invoice/${paymentId}`);
      if (!response.ok) throw new Error('Failed to generate invoice');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${paymentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading invoice:', err);
      showToast('Unable to download invoice. Please try again.', 'error');
    } finally {
      setIsDownloadingInvoice(null);
    }
  };

  const handleDownloadRefundReceipt = async (paymentId: string) => {
    setIsDownloadingInvoice(paymentId);
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
    } catch (err) {
      console.error('Error downloading refund receipt:', err);
      showToast('Unable to download refund receipt. Please try again.', 'error');
    } finally {
      setIsDownloadingInvoice(null);
    }
  };

  const formatCurrency = (amountCents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amountCents / 100);
  };

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Billing management</h3>
            <p className="text-sm text-slate-500 dark:text-neutral-400">
              Update payment methods, download invoices, or adjust your subscription in a few clicks.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-600">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Update payment method</p>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">Manage your cards and billing profile inside the billing portal.</p>
                </div>
                <button
                  onClick={handleUpdatePaymentMethod}
                  disabled={isUpdatingPayment}
                  className="inline-flex items-center gap-2 self-start rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {isUpdatingPayment ? 'Opening…' : 'Manage payment'}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/40">
              <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Download invoices</p>
              <p className="text-xs text-slate-500 dark:text-neutral-400">Invoices are available for every completed payment below.</p>
            </div>

            {isActive ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-red-200/80 bg-red-50 p-5 shadow-sm dark:border-red-500/40 dark:bg-red-500/10">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-red-700 dark:text-red-200">Cancel subscription</p>
                    <p className="text-xs text-red-600/80 dark:text-red-200/70">Canceling stops future renewals. You&apos;ll retain access until the end of the current cycle.</p>
                    {isCancellationScheduled && (preformattedCanceledAt ?? canceledAt) ? (
                      <p className="text-[11px] text-amber-600/80 dark:text-amber-200/80">
                        Cancellation scheduled on {preformattedCanceledAt ?? formatDate(canceledAt, { mode: settings.mode, timezone: settings.timezone })}
                      </p>
                    ) : null}
                  </div>
                  {!planAutoRenew ? (
                    <div className="rounded-xl border border-red-200/70 bg-white/80 px-4 py-3 text-xs text-red-700 shadow-sm dark:border-red-500/40 dark:bg-transparent dark:text-red-200/80">
                      This plan is non-recurring. Your workspace stays active until {preformattedNextBillingDate ?? (nextBillingDate ? formatDate(nextBillingDate, { mode: settings.mode, timezone: settings.timezone }) : 'the period end')}.
                    </div>
                  ) : !isCancellationScheduled ? (
                    <button
                      onClick={() => setShowCancelModal(true)}
                      disabled={isCancelling}
                      className="inline-flex items-center gap-2 self-start rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                    >
                      {isCancelling ? 'Cancelling…' : 'Cancel subscription'}
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        setIsUndoing(true);
                        try {
                          const res = await fetch('/api/billing/undo-cancel', { method: 'POST' });
                          const j = await res.json();
                          if (!res.ok || !j.ok) {
                            showToast('Unable to undo cancellation: ' + (j?.error || 'Unknown error'), 'error');
                          } else {
                            showToast('Cancellation undone. Your subscription will continue to auto-renew.', 'success');
                            window.location.reload();
                          }
                        } catch (err) {
                          console.error('Undo error', err);
                          showToast('Unable to undo cancellation. Please try again later.', 'error');
                        } finally {
                          setIsUndoing(false);
                        }
                      }}
                      disabled={isUndoing}
                      className="inline-flex items-center gap-2 self-start rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    >
                      {isUndoing ? 'Undoing…' : 'Undo cancellation'}
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {recentPayments.length > 0 ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Recent payments</h3>
              <p className="text-sm text-slate-500 dark:text-neutral-400">Download invoices or review the status of your latest charges.</p>
            </div>
            <div className="space-y-3">
              {recentPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-600"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{payment.subscription?.plan?.name || 'Pro Plan'}</p>
                      <p className="text-xs text-slate-500 dark:text-neutral-400">
                        {(
                          preformattedRecentPayments?.find((r) => r.id === payment.id)?.formattedCreatedAt ??
                          formatDate(payment.createdAt, { mode: settings.mode, timezone: settings.timezone })
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-mono text-sm text-slate-900 dark:text-neutral-100">{formatCurrency(payment.amountCents, payment.currency)}</p>
                        <p
                          className={`text-xs font-semibold ${payment.status === 'COMPLETED' || payment.status === 'SUCCEEDED'
                              ? 'text-emerald-600 dark:text-emerald-300'
                              : payment.status === 'REFUNDED'
                                ? 'text-red-600 dark:text-red-300'
                                : 'text-amber-600 dark:text-amber-300'
                            }`}
                        >
                          {payment.status}
                        </p>
                      </div>
                      {(payment.status === 'COMPLETED' || payment.status === 'SUCCEEDED') && (
                        <button
                          onClick={() => handleDownloadInvoice(payment.id)}
                          disabled={isDownloadingInvoice === payment.id}
                          className="inline-flex items-center gap-2 rounded-full border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:border-blue-300 hover:bg-blue-50 dark:border-blue-500/40 dark:text-blue-200 dark:hover:border-blue-400 dark:hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:border-blue-200/70 disabled:text-blue-300"
                        >
                          {isDownloadingInvoice === payment.id ? 'Downloading…' : 'Invoice'}
                        </button>
                      )}
                      {payment.status === 'REFUNDED' && (
                        <button
                          onClick={() => handleDownloadRefundReceipt(payment.id)}
                          disabled={isDownloadingInvoice === payment.id}
                          className="inline-flex items-center gap-2 rounded-full border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:border-blue-300 hover:bg-blue-50 dark:border-blue-500/40 dark:text-blue-200 dark:hover:border-blue-400 dark:hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:border-blue-200/70 disabled:text-blue-300"
                        >
                          {isDownloadingInvoice === payment.id ? 'Downloading…' : 'Receipt'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center text-xs">
              <a
                href="/dashboard/transactions"
                className="inline-flex items-center gap-1 text-blue-600 underline-offset-4 transition hover:underline dark:text-blue-300"
              >
                View all transactions
              </a>
            </div>
          </div>
        ) : null}
      </div>

      <CancelSubscriptionModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        loading={isCancelling}
        onConfirm={async () => {
          setIsCancelling(true);
          try {
            const res = await fetch('/api/billing/cancel', { method: 'POST' });
            const j = await res.json();
            if (!res.ok || !j.ok) {
              showToast('Unable to cancel subscription: ' + (j?.error || 'Unknown error'), 'error');
            } else if (j.message === 'non_recurring') {
              showToast('This plan is non-recurring. Your access will end on: ' + formatDate(j.expiresAt, { mode: settings.mode, timezone: settings.timezone }), 'info');
            } else if (j.message === 'cancellation_scheduled') {
              showToast('Cancellation scheduled. Your subscription will not renew and will end at the period end.', 'success');
            } else {
              showToast('Cancellation result: ' + JSON.stringify(j), 'info');
            }
            setShowCancelModal(false);
            // reload to reflect new subscription state
            window.location.reload();
          } catch (err) {
            console.error('Cancel error', err);
            showToast('Unable to cancel subscription. Please try again later.', 'error');
          } finally {
            setIsCancelling(false);
          }
        }}
      />


    </>
  );
}
