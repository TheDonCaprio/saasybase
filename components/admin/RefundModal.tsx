'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency } from '../../lib/utils/currency';

interface RefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    reason: string,
    customReason?: string,
    cancelSubscription?: boolean,
    cancelMode?: 'immediate' | 'period_end',
    localCancelMode?: 'immediate' | 'period_end',
    clearPaidTokens?: boolean
  ) => void;
  amount: number;
  paymentId: string;
  loading?: boolean;
  error?: string | null;
  hasActiveSubscription?: boolean;
  subscriptionPlanAutoRenew?: boolean | null;
  subscriptionExpiresAt?: Date | string | null;
  hasStripeSubscription?: boolean;
}

const REFUND_REASONS = [
  { value: 'requested_by_customer', label: 'Requested by Customer', description: 'Customer requested a refund' },
  { value: 'duplicate', label: 'Duplicate Payment', description: 'Payment was processed multiple times' },
  { value: 'fraudulent', label: 'Fraudulent Payment', description: 'Payment was fraudulent or unauthorized' },
];

export function RefundModal({
  isOpen,
  onClose,
  onConfirm,
  amount,
  paymentId,
  loading = false,
  error = null,
  hasActiveSubscription = false,
  subscriptionPlanAutoRenew = null,
  subscriptionExpiresAt = null,
  hasStripeSubscription = false
}: RefundModalProps) {
  const [selectedReason, setSelectedReason] = useState('requested_by_customer');
  const [customReason, setCustomReason] = useState('');
  const [cancelSubscription, setCancelSubscription] = useState(() => hasStripeSubscription);
  const [cancelMode, setCancelMode] = useState<'immediate' | 'period_end'>('immediate');
  const [localCancelMode, setLocalCancelMode] = useState<'immediate' | 'period_end'>('immediate');
  const [clearPaidTokens, setClearPaidTokens] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  const expiresAtDate = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
  const formattedExpiresAt = expiresAtDate
    ? expiresAtDate.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedReason('requested_by_customer');
      setCustomReason('');
      setCancelSubscription(hasStripeSubscription);
      setCancelMode('immediate');
      setLocalCancelMode('immediate');
    }
  }, [isOpen, hasStripeSubscription]);

  // Initialize clearPaidTokens default from global admin settings when modal opens
  useEffect(() => {
    let mounted = true;
    async function loadDefault() {
      if (!isOpen) return;
      try {
        const key = subscriptionPlanAutoRenew === true ? 'TOKENS_RESET_ON_EXPIRY_RECURRING' : 'TOKENS_RESET_ON_EXPIRY_ONE_TIME';
        const res = await fetch(`/api/admin/settings?key=${encodeURIComponent(key)}`);
        if (!res.ok) return;
        const j = await res.json().catch(() => null);
        if (!mounted) return;
        setClearPaidTokens(j?.value === 'true');
      } catch (e) {
        void e;
      }
    }
    void loadDefault();
    return () => { mounted = false; };
  }, [isOpen, subscriptionPlanAutoRenew]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    if (!isOpen) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleConfirm = () => {
    onConfirm(
      selectedReason,
      customReason,
      cancelSubscription,
      cancelSubscription ? cancelMode : undefined,
      hasActiveSubscription ? localCancelMode : undefined
      , clearPaidTokens
    );
  };

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const selectedReasonData = REFUND_REASONS.find(r => r.value === selectedReason);

  const modalContent = (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3">
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <h2 className="text-base font-semibold text-white">Process Refund</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              {/* Payment Info + Reason */}
              <div className="bg-neutral-800/50 rounded border border-neutral-700 p-3">
                <div className="grid grid-cols-2 gap-4 items-start">
                  <div>
                    <div className="text-xs text-neutral-400 mb-1">Payment ID</div>
                    <div className="font-mono text-xs text-neutral-300 break-all">{paymentId}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-neutral-400 mb-1">Refund Amount</div>
                    <div className="text-lg font-semibold text-white">{formatCurrency(amount, 'usd')}</div>
                  </div>
                </div>
              </div>

              {/* Reason Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-white">
                  Refund Reason
                </label>
                <select
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  disabled={loading}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                >
                  {REFUND_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
                {selectedReasonData && (
                  <p className="text-xs text-neutral-400">{selectedReasonData.description}</p>
                )}
              </div>
            </div>

            {/* Custom Reason/Notes */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-white">
                Additional Notes (Optional)
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                disabled={loading}
                placeholder="Add any additional context for this refund..."
                rows={3}
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 resize-none min-h-[96px]"
              />
            </div>
          </div>

          {/* Cancel Subscription Controls */}
          {hasActiveSubscription && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                {hasStripeSubscription ? (
                  <>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cancelSubscription}
                        onChange={(e) => setCancelSubscription(e.target.checked)}
                        disabled={loading}
                        className="mt-0.5 w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 disabled:opacity-50"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-medium text-white">Cancel subscription with payment provider</div>
                        <div className="text-[11px] text-neutral-400 mt-0.5">
                          If checked, choose how the provider should handle the cancellation (immediate vs. at period end).
                        </div>
                      </div>
                    </label>

                    {cancelSubscription && (
                      <div className="space-y-2 rounded border border-neutral-800 bg-neutral-900/50 p-3">
                        <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Provider cancellation timing</label>
                        <div className="grid grid-cols-1 gap-2">
                          <label className={`flex items-start gap-2 rounded border ${cancelMode === 'immediate' ? 'border-red-500 bg-red-500/10' : 'border-neutral-700 bg-neutral-800/50'} p-2 transition cursor-pointer`}>
                            <input
                              type="radio"
                              name="cancel-mode"
                              value="immediate"
                              checked={cancelMode === 'immediate'}
                              onChange={() => setCancelMode('immediate')}
                              disabled={loading}
                              className="mt-0.5 w-4 h-4 border-neutral-600 text-red-600 focus:ring-red-500"
                            />
                            <div className="text-xs text-neutral-200">
                              <div className="font-semibold text-white">Cancel immediately</div>
                              <p className="mt-1 text-neutral-400">
                                Access is revoked right away, the subscription status becomes <strong>CANCELLED</strong>, and future renewals are stopped.
                              </p>
                            </div>
                          </label>

                          <label className={`flex items-start gap-2 rounded border ${cancelMode === 'period_end' ? 'border-amber-500 bg-amber-500/10' : 'border-neutral-700 bg-neutral-800/50'} p-2 transition cursor-pointer`}>
                            <input
                              type="radio"
                              name="cancel-mode"
                              value="period_end"
                              checked={cancelMode === 'period_end'}
                              onChange={() => setCancelMode('period_end')}
                              disabled={loading}
                              className="mt-0.5 w-4 h-4 border-neutral-600 text-amber-600 focus:ring-amber-500"
                            />
                            <div className="text-xs text-neutral-200">
                              <div className="font-semibold text-white">Cancel at period end</div>
                              <p className="mt-1 text-neutral-400">
                                The customer keeps access until the billing period ends. The cancellation is scheduled and we mark the subscription as pending cancellation locally.
                              </p>
                            </div>
                          </label>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-neutral-200 bg-white/95 p-4 text-xs text-neutral-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70 dark:text-neutral-300">
                    <div className="font-semibold text-neutral-800 dark:text-white">Provider subscription not detected</div>
                    <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                      This plan doesn&apos;t renew automatically with the configured provider, so we&apos;ll handle access locally. Use the controls across to decide when access should end.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Local access handling</label>
                <div className="grid grid-cols-1 gap-2">
                  <label className={`flex items-start gap-2 rounded border ${localCancelMode === 'immediate' ? 'border-rose-500 bg-rose-500/10' : 'border-neutral-700 bg-neutral-800/50'} p-2 transition cursor-pointer`}>
                    <input
                      type="radio"
                      name="local-cancel-mode"
                      value="immediate"
                      checked={localCancelMode === 'immediate'}
                      onChange={() => setLocalCancelMode('immediate')}
                      disabled={loading}
                      className="mt-0.5 w-4 h-4 border-neutral-600 text-rose-500 focus:ring-rose-500"
                    />
                    <div className="text-xs text-neutral-200">
                      <div className="font-semibold text-white">Revoke access immediately</div>
                      <p className="mt-1 text-neutral-400">
                        We expire the local entitlement now and promote any pending subscriptions for this user.
                      </p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2 rounded border ${localCancelMode === 'period_end' ? 'border-amber-500 bg-amber-500/10' : 'border-neutral-700 bg-neutral-800/50'} p-2 transition cursor-pointer`}>
                    <input
                      type="radio"
                      name="local-cancel-mode"
                      value="period_end"
                      checked={localCancelMode === 'period_end'}
                      onChange={() => setLocalCancelMode('period_end')}
                      disabled={loading}
                      className="mt-0.5 w-4 h-4 border-neutral-600 text-amber-500 focus:ring-amber-500"
                    />
                    <div className="text-xs text-neutral-200">
                      <div className="font-semibold text-white">Keep access until it expires</div>
                        <p className="mt-1 text-neutral-400">
                        We will leave the local subscription active until the current term ends{formattedExpiresAt ? ` (${formattedExpiresAt})` : ''}.
                        </p>
                    </div>
                  </label>
                </div>
                {!hasStripeSubscription && subscriptionPlanAutoRenew === false ? (
                  <p className="text-[11px] text-neutral-500">
                    One-time plans don&apos;t renew automatically. Choosing &ldquo;Keep access until it expires&rdquo; honors the original end date while still recording the refund.
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {/* Clear paid tokens toggle for admin actions (show even when no active subscription) */}
          <div className="p-3 border-t border-neutral-800">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={clearPaidTokens}
                onChange={(e) => setClearPaidTokens(e.target.checked)}
                disabled={loading}
                className="mt-0.5 w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 disabled:opacity-50"
              />
              <div className="flex-1">
                <div className="text-xs font-medium text-white">Also clear paid tokens</div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  When checked, this will zero the paid token balance for the user as part of processing this refund/cancellation.
                  { !hasActiveSubscription ? ' The user has no active subscription but you can still clear their paid tokens.' : '' }
                </div>
              </div>
            </label>
          </div>

          {/* Warning */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded p-3">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="text-xs text-amber-900 dark:text-amber-300">
                <div className="font-medium mb-1 text-amber-900 dark:text-amber-200">This action cannot be undone</div>
                <div className="text-amber-700 dark:text-amber-400">
                  The payment will be refunded via the configured provider using the &quot;{selectedReasonData?.label}&quot; reason.
                  {customReason && ' Your additional notes will be saved for internal tracking.'}
                </div>
                {hasActiveSubscription ? (
                  <div className="text-amber-700 dark:text-amber-400 mt-1 space-y-1">
                    <div>
                      <strong>Provider handling:</strong>{' '}
                      {hasStripeSubscription
                        ? cancelSubscription
                          ? cancelMode === 'period_end'
                            ? 'Scheduled to end at period close.'
                            : 'Cancelled immediately to stop future renewals.'
                          : 'Left active with provider.'
                        : 'Managed locally (no provider subscription).'}
                    </div>
                    <div>
                      <strong>Local access:</strong>{' '}
                      {localCancelMode === 'period_end'
                        ? `Access remains until the current term ends${formattedExpiresAt ? ` (${formattedExpiresAt})` : ''}.`
                        : 'Access is revoked right away and pending stack entries will be promoted if available.'}
                    </div>
                  </div>
                ) : (
                  <div className="text-amber-700 dark:text-amber-400 mt-1">
                    <strong>Subscription Impact:</strong> Access will be revoked immediately in our system.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>


        {/* Actions */}
        <div className="p-4 pt-0 space-y-3">
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 dark:border-red-700/60 dark:bg-red-900/20 p-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 shrink-0 text-red-500 dark:text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <div className="text-sm font-medium text-red-800 dark:text-red-300">Refund failed</div>
                  <div className="text-sm text-red-700 dark:text-red-400 mt-0.5">{error}</div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-3 py-2 border border-neutral-700 text-neutral-300 rounded hover:bg-neutral-800 transition-colors disabled:opacity-50 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Processing...
              </div>
            ) : (
              'Process Refund'
            )}
          </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
