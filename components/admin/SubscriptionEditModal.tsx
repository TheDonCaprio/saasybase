'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type EditableStatus = 'ACTIVE' | 'EXPIRED';

type EditableSubscription = {
  id: string;
  planName: string;
  userEmail?: string | null;
  userId: string;
  status: string;
  expiresAt?: string | null;
  canceledAt?: string | null;
  paymentProvider?: string | null;
  externalSubscriptionId?: string | null;
};

interface SubscriptionEditModalProps {
  isOpen: boolean;
  subscription: EditableSubscription | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (payload: {
    status: EditableStatus;
    expiresAt: string;
    clearScheduledCancellation: boolean;
    allowLocalOverride: boolean;
  }) => void;
}

function toLocalInputValue(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function SubscriptionEditModalPanel({
  subscription,
  loading = false,
  error = null,
  onClose,
  onConfirm,
}: Omit<SubscriptionEditModalProps, 'isOpen'>) {
  const [status, setStatus] = useState<EditableStatus>(subscription?.status === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE');
  const [expiresAt, setExpiresAt] = useState(() => toLocalInputValue(subscription?.expiresAt));
  const [clearScheduledCancellation, setClearScheduledCancellation] = useState(Boolean(subscription?.canceledAt));
  const [allowLocalOverride, setAllowLocalOverride] = useState(false);
  const [openedAtMs] = useState(() => Date.now());

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loading) {
        onClose();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [loading, onClose]);

  const isProviderBacked = Boolean(subscription?.externalSubscriptionId);
  const providerLabel = (subscription?.paymentProvider || 'provider').toUpperCase();

  const validationMessage = useMemo(() => {
    if (!subscription) return 'Subscription unavailable.';
    if (!expiresAt) return 'Choose a billing date to save.';
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime())) return 'Choose a valid billing date.';
    if (status === 'ACTIVE' && parsed.getTime() <= openedAtMs) {
      return 'Active subscriptions require a future billing date.';
    }
    return null;
  }, [expiresAt, openedAtMs, status, subscription]);

  if (!subscription) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-3">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 flex flex-col dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-neutral-800">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">Edit subscription</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">Provider-aware status and billing date changes for {subscription.planName}.</p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 transition-colors hover:text-slate-700 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-white"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-300">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-500">Plan</div>
                <div className="mt-1 font-semibold text-slate-950 dark:text-white">{subscription.planName}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-500">Subscriber</div>
                <div className="mt-1">{subscription.userEmail || subscription.userId}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-500">Current status</div>
                <div className="mt-1">{subscription.status}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-500">Current billing date</div>
                <div className="mt-1">{subscription.expiresAt ? new Date(subscription.expiresAt).toLocaleString() : 'Not set'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-500">Provider</div>
                <div className="mt-1">{isProviderBacked ? `${providerLabel} (${subscription.externalSubscriptionId})` : 'Local only'}</div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-800 dark:text-white">Target status</label>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as EditableStatus)}
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:border-transparent dark:focus:ring-blue-500"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="EXPIRED">EXPIRED</option>
                </select>
                <p className="text-[11px] text-slate-500 dark:text-neutral-400">
                  Use the existing cancel actions for provider-level cancellation flows. This editor is for reactivation, local expiry normalization, and billing date repair.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-800 dark:text-white">Next billing / access end</label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:border-transparent dark:focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-500 dark:text-neutral-400">
                  For active subscriptions this must be in the future. For expired subscriptions it should be at or before the current time.
                </p>
              </div>

              <label className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
                <input
                  type="checkbox"
                  checked={clearScheduledCancellation}
                  onChange={(event) => setClearScheduledCancellation(event.target.checked)}
                  disabled={loading}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 bg-white text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800"
                />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-900 dark:text-white">Clear scheduled cancellation</div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-neutral-400">
                    If the provider still has a cancel-at-period-end flag, the server will try to undo it before saving locally.
                  </div>
                </div>
              </label>

              {isProviderBacked ? (
                <label className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/70 dark:bg-amber-950/20">
                  <input
                    type="checkbox"
                    checked={allowLocalOverride}
                    onChange={(event) => setAllowLocalOverride(event.target.checked)}
                    disabled={loading}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-300 bg-white text-amber-600 focus:ring-2 focus:ring-amber-500 focus:ring-offset-0 disabled:opacity-50 dark:border-amber-700 dark:bg-neutral-800 dark:text-amber-500"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-amber-950 dark:text-white">Allow local override if {providerLabel} cannot match this change</div>
                    <div className="mt-1 text-[11px] text-amber-800 dark:text-neutral-400">
                      Keep this off to require provider-backed verification. Turn it on only when you intentionally want the app state to diverge from the provider for repair purposes.
                    </div>
                  </div>
                </label>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          ) : null}

          {validationMessage ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-200">
              {validationMessage}
            </div>
          ) : null}
        </div>

        <div className="flex gap-3 border-t border-slate-200 p-4 dark:border-neutral-800">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({
              status,
              expiresAt: new Date(expiresAt).toISOString(),
              clearScheduledCancellation,
              allowLocalOverride,
            })}
            disabled={loading || !!validationMessage}
            className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SubscriptionEditModal(props: SubscriptionEditModalProps) {
  if (!props.isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <SubscriptionEditModalPanel
      key={props.subscription ? `${props.subscription.id}:${props.subscription.status}:${props.subscription.expiresAt ?? ''}:${props.subscription.canceledAt ?? ''}` : 'subscription-edit-modal'}
      subscription={props.subscription}
      loading={props.loading}
      error={props.error}
      onClose={props.onClose}
      onConfirm={props.onConfirm}
    />,
    document.body,
  );
}