'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import usePaginatedList from '../hooks/usePaginatedList';
import { Pagination } from '../ui/Pagination';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';
import { formatCurrency as formatCurrencyUtil } from '../../lib/utils/currency';


interface Payment {
  id: string;
  amount: number;
  amountFormatted?: string | null;
  displayCurrency?: string | null;
  currency: string;
  status: string;
  createdAt: string;
  planName?: string;
  paymentProvider?: string | null;
  externalPaymentId?: string | null;
  externalSessionId?: string | null;
  externalRefundId?: string | null;
  dashboardUrl?: string | null;
}

interface UserPaymentsModalProps {
  userId: string;
  userEmail: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function UserPaymentsModal({ userId, userEmail, isOpen, onClose }: UserPaymentsModalProps) {
  const itemsPerPage = 25;
  const { items: payments, totalCount, currentPage, isLoading: loading, nextCursor, fetchPage } = usePaginatedList<Payment>({
    basePath: `/api/admin/users/${userId}/payments`,
    initialItems: [],
    initialTotalCount: 0,
    initialPage: 1,
    itemsPerPage,
    itemsKey: 'payments'
  });
  const settings = useFormatSettings();

  // Portal container for rendering overlay as a direct child of <body>
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'payments-modal-portal';
    document.body.appendChild(el);
    setPortalEl(el);
    return () => {
      try { document.body.removeChild(el); } catch { /* ignore */ }
    };
  }, []);

  // When modal opens, fetch first page and reset list
  useEffect(() => {
    if (!isOpen || !userId) return;
    // Ensure hook points to correct basePath — re-run fetchPage for page 1
    void fetchPage(1, false, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId]);

  const formatAmount = (amountCents: number, currency?: string | null) =>
    formatCurrencyUtil(amountCents, currency || '');

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'succeeded':
      case 'completed':
        return 'text-green-400';
      case 'pending':
        return 'text-yellow-400';
      case 'failed':
      case 'canceled':
        return 'text-red-400';
      default:
        return 'text-neutral-400';
    }
  };

  if (!isOpen || !portalEl) return null;

  const modal = (
    <div className="fixed inset-0 z-50 mt-0 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[80vh] w-full max-w-4xl flex-col rounded-lg border border-neutral-700 bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-700 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Payment History</h2>
            <p className="text-sm text-neutral-400">
              {userEmail || 'User'} • {totalCount} payment{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white text-xl"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 sm:px-5 sm:py-4">
          {loading ? (
            <div className="divide-y divide-slate-200/70 dark:divide-neutral-800/70">
              {[...Array(itemsPerPage)].map((_, i) => (
                <div key={i} className="animate-pulse bg-neutral-800 rounded h-12"></div>
              ))}
            </div>
          ) : payments.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-neutral-500">No payments found for this user.</div>
          ) : (
            <div className="divide-y divide-slate-200/70 dark:divide-neutral-800/70">
              {payments.map((payment) => (
                <div key={payment.id} className="flex flex-col items-start gap-3 px-3 py-2.5 transition hover:bg-slate-50/70 sm:flex-row sm:px-4 dark:hover:bg-neutral-900/50">
                  {/* Amount / plan (top on mobile, left on desktop) */}
                  <div className="flex w-full flex-shrink-0 flex-col justify-start sm:w-32">
                    <div className="font-semibold text-sm truncate">{payment.amountFormatted ?? formatAmount(payment.amount, payment.displayCurrency ?? payment.currency)}</div>
                    <div className="text-[11px] text-neutral-400">{payment.planName ?? ''}</div>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <div className={`text-[11px] px-2 rounded ${getStatusColor(payment.status)} bg-current/8 border border-current py-0.5`}>{payment.status}</div>
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {formatDate(payment.createdAt, { mode: settings.mode, timezone: settings.timezone })}

                      {/* IDs shown under the date: payment id and first-available provider id */}
                      <div className="mt-1.5 truncate font-mono text-[11px] text-neutral-400">
                        {payment.id}
                      </div>
                      {(() => {
                        const providerId = payment.externalPaymentId
                          ?? payment.externalSessionId
                          ?? payment.externalRefundId;
                        if (!providerId) return null;
                        return (
                          <div className="mt-1 truncate font-mono text-[11px] text-neutral-400">Provider ID: {providerId}</div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Actions: full width on mobile, right aligned on desktop */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:gap-2.5">
                    {(payment.dashboardUrl || payment.externalPaymentId || payment.externalSessionId || payment.externalRefundId) && (
                      <a
                        href={payment.dashboardUrl || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full rounded-md bg-purple-600 px-2.5 py-1 text-center text-xs text-white transition-colors hover:bg-purple-700 sm:w-auto"
                      >
                        View
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination footer inside scroll area so it stays visible with long lists */}
          {totalCount > itemsPerPage && (
            <div className="mt-3">
              <Pagination currentPage={currentPage} totalPages={Math.max(1, Math.ceil((totalCount || 0) / itemsPerPage))} onPageChange={(p) => fetchPage(p)} totalItems={totalCount} itemsPerPage={itemsPerPage} nextCursor={nextCursor} onNextWithCursor={() => fetchPage(currentPage + 1, false, nextCursor)} />
            </div>
          )}
        </div>

        {/* Footer removed: use top-right close button and in-modal pagination */}
      </div>
    </div>
  );

  return createPortal(modal, portalEl);
}
