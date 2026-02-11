'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import usePaginatedList from '../hooks/usePaginatedList';
import { Pagination } from '../ui/Pagination';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';


interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  planName?: string;
  stripePaymentIntentId?: string | null;
  stripeInvoiceId?: string | null;
  stripeCheckoutSessionId?: string | null;
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

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 mt-0">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-neutral-700">
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

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="divide-y divide-slate-200/70 dark:divide-neutral-800/70">
              {[...Array(itemsPerPage)].map((_, i) => (
                <div key={i} className="animate-pulse bg-neutral-800 rounded h-12"></div>
              ))}
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">No payments found for this user.</div>
          ) : (
            <div className="divide-y divide-slate-200/70 dark:divide-neutral-800/70">
              {payments.map((payment) => (
                <div key={payment.id} className="flex flex-col sm:flex-row items-start gap-4 py-3 px-4 transition hover:bg-slate-50/70 dark:hover:bg-neutral-900/50">
                  {/* Amount / plan (top on mobile, left on desktop) */}
                  <div className="w-full sm:w-32 flex-shrink-0 flex flex-col justify-start">
                    <div className="font-semibold text-sm truncate">{formatAmount(payment.amount, payment.currency)}</div>
                    <div className="text-[11px] text-neutral-400">{payment.planName ?? ''}</div>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <div className={`text-[11px] px-2 rounded ${getStatusColor(payment.status)} bg-current/8 border border-current py-0.5`}>{payment.status}</div>
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">
                      {formatDate(payment.createdAt, { mode: settings.mode, timezone: settings.timezone })}

                      {/* IDs shown under the date: payment id and first-available Stripe id */}
                      <div className="mt-2 text-[11px] text-neutral-400 font-mono truncate">
                        {payment.id}
                      </div>
                      {(() => {
                        const stripeId = payment.stripePaymentIntentId ?? payment.stripeInvoiceId ?? payment.stripeCheckoutSessionId;
                        if (!stripeId) return null;
                        return (
                          <div className="mt-1 text-[11px] text-neutral-400 font-mono truncate">Provider ID: {stripeId}</div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Actions: full width on mobile, right aligned on desktop */}
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    {(payment.dashboardUrl || payment.stripePaymentIntentId || payment.stripeInvoiceId || payment.stripeCheckoutSessionId) && (
                      <a
                        href={payment.dashboardUrl || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full sm:w-auto text-center text-xs bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded transition-colors"
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
            <div className="mt-4">
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
