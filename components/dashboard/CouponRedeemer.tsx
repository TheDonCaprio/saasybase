"use client";

import React, { useMemo, useState } from 'react';
import usePaginatedList from '../hooks/usePaginatedList';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { Pagination } from '../ui/Pagination';
import { showToast } from '../ui/Toast';
import { formatCurrency } from '../../lib/utils/currency';

export type CouponRedemptionRow = {
  id: string;
  couponId: string;
  code: string;
  description: string | null;
  percentOff: number | null;
  amountOffCents: number | null;
  redeemedAt: string;
  redeemedAtFormatted?: string | null;
  consumedAt: string | null;
  consumedAtFormatted?: string | null;
  startsAt: string | null;
  startsAtFormatted?: string | null;
  endsAt: string | null;
  endsAtFormatted?: string | null;
  active: boolean;
  currentlyActive: boolean;
  eligiblePlans: Array<{ id: string; name: string | null }>;
};

type RedemptionStatus = 'ready' | 'used' | 'expired' | 'inactive' | 'scheduled';

function formatMoney(cents: number | null, currency: string): string {
  if (!cents) return formatCurrency(0, currency);
  return formatCurrency(cents, currency);
}

function formatDate(value: string | null, preformatted?: string | null): string {
  // Prefer a server-provided preformatted string to ensure SSR/CSR match
  if (preformatted) return preformatted;
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function computeStatus(row: CouponRedemptionRow): RedemptionStatus {
  const now = new Date();
  if (!row.active) return 'inactive';
  if (row.consumedAt) return 'used';
  if (row.endsAt && new Date(row.endsAt) < now) return 'expired';
  if (row.startsAt && new Date(row.startsAt) > now) return 'scheduled';
  return 'ready';
}

function statusLabel(status: RedemptionStatus): { label: string; className: string } {
  switch (status) {
    case 'ready':
      return { label: 'Ready to apply', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' };
    case 'used':
      return { label: 'Used', className: 'bg-slate-200 text-slate-600 dark:bg-neutral-800/60 dark:text-neutral-300' };
    case 'expired':
      return { label: 'Expired', className: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-200' };
    case 'inactive':
      return { label: 'Inactive', className: 'bg-slate-200 text-slate-600 dark:bg-neutral-800/60 dark:text-neutral-300' };
    case 'scheduled':
      return { label: 'Starts soon', className: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200' };
    default:
      return { label: 'Unknown', className: 'bg-slate-200 text-slate-600 dark:bg-neutral-800/60 dark:text-neutral-300' };
  }
}

interface CouponRedeemerProps {
  initialRedemptions: CouponRedemptionRow[];
  initialTotalCount: number;
  initialPage: number;
  pageSize?: number;
  initialSearch?: string;
  initialFilters?: Record<string, string | number | boolean | undefined>;
  displayCurrency?: string;
}

export function CouponRedeemer({
  initialRedemptions,
  initialTotalCount,
  initialPage,
  pageSize = 20,
  initialSearch = '',
  initialFilters = {},
  displayCurrency,
}: CouponRedeemerProps) {
  const [codeInput, setCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState(initialSearch);
  const debouncedFilter = useDebouncedValue(filter, 400);

  const combinedFilters = useMemo(() => {
    return {
      ...initialFilters,
      search: debouncedFilter || undefined,
    } as Record<string, string | number | boolean | undefined>;
  }, [initialFilters, debouncedFilter]);

  const {
    items: redemptions,
    totalCount,
    currentPage,
    isLoading,
    nextCursor,
    fetchPage,
  } = usePaginatedList<CouponRedemptionRow>({
    basePath: '/api/dashboard/coupons',
    initialItems: initialRedemptions,
    initialTotalCount,
    initialPage,
    itemsPerPage: pageSize,
    filters: combinedFilters,
    itemsKey: 'coupons',
  });

  // Use .text-actual-white utility class to ensure white text on the redeem button

  const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : Math.max(1, currentPage + (nextCursor ? 1 : 0));

  async function redeem() {
    const trimmed = codeInput.trim();
    if (!trimmed) {
      showToast('Enter a coupon code to redeem', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json?.error || 'Unable to redeem coupon', 'error');
        return;
      }
      if (json?.redemption) {
        await fetchPage(1);
      }
      setCodeInput('');
      showToast('Coupon redeemed. You can now apply it at checkout.', 'success');
    } catch {
      showToast('Network error redeeming coupon', 'error');
    } finally {
      setLoading(false);
    }
  }

  const resolvedCurrency = displayCurrency ?? 'usd';

  return (
    <div className="space-y-6">
      <section className="space-y-4 lg:rounded-[var(--theme-surface-radius)] lg:border lg:border-slate-200 lg:bg-white lg:p-4 xl:p-5 lg:shadow-sm dark:lg:border-neutral-800 dark:lg:bg-neutral-900/60">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Redeem a coupon</h2>
          <p className="text-sm text-slate-500 dark:text-neutral-400">
            Each code can only be redeemed once per account.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
          <input
            type="text"
            value={codeInput}
            onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
            placeholder="WELCOME-2025"
            maxLength={64}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold tracking-[0.25em] uppercase text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
          <button
            onClick={redeem}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white text-actual-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {loading ? 'Redeeming…' : 'Redeem code'}
          </button>
        </div>
      </section>

      <section className="space-y-4 lg:rounded-[var(--theme-surface-radius)] lg:border lg:border-slate-200 lg:bg-white lg:p-4 xl:p-5 lg:shadow-sm dark:lg:border-neutral-800 dark:lg:bg-neutral-900/60">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Your coupons</h2>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative w-full md:w-72">
              <input
                type="text"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter by code or description..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
              {filter.trim().length > 0 ? (
                <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setFilter('')}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                  >
                    ×
                  </button>
                </div>
              ) : null}
            </div>
            <div className="text-xs text-slate-500 dark:text-neutral-400 md:text-right">
              Showing {redemptions.length} of {typeof totalCount === 'number' ? totalCount : redemptions.length}
            </div>
          </div>
        </div>

        {redemptions.length === 0 ? (
          <div className="rounded-[var(--theme-surface-radius)] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-neutral-700 dark:text-neutral-400">
            {isLoading
              ? 'Loading coupons…'
              : filter
              ? 'No coupons match your filters.'
              : 'No coupons yet. Redeem a code above to have it ready for your next checkout.'}
          </div>
        ) : (
          <>
            {/* Mobile stacked cards */}
            <div className="space-y-3 p-3 sm:p-4 md:hidden">
              {redemptions.map((row) => {
                const discount = row.percentOff !== null ? `${row.percentOff}% off` : formatMoney(row.amountOffCents, resolvedCurrency);
                const status = statusLabel(computeStatus(row));
                const windowText = `${formatDate(row.startsAt, row.startsAtFormatted)} → ${formatDate(row.endsAt, row.endsAtFormatted)}`;
                return (
                  <div key={row.id} className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60 sm:p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-mono text-sm font-semibold tracking-[0.3em] text-slate-900 dark:text-neutral-100">{row.code}</div>
                        {row.description ? <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">{row.description}</p> : null}
                        <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">Eligible: {row.eligiblePlans.length > 0 ? row.eligiblePlans.map((p) => p.name || 'Unnamed').join(', ') : 'All plans'}</p>
                      </div>
                      <div className="ml-4 flex-shrink-0 text-right">
                        <div className="text-sm font-semibold text-slate-800 dark:text-neutral-100">{discount}</div>
                        <div className="mt-2"><span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span></div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-600 dark:text-neutral-300">
                      <div>Redeemed: {formatDate(row.redeemedAt, row.redeemedAtFormatted)}</div>
                      {row.consumedAt ? <div className="text-xs text-slate-500 dark:text-neutral-400">Used {formatDate(row.consumedAt, row.consumedAtFormatted)}</div> : null}
                      <div className="mt-2">{windowText}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="theme-shadow-panel hidden md:block overflow-hidden rounded-[var(--theme-surface-radius)] border border-slate-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-neutral-900 dark:text-neutral-400">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Code</th>
                    <th className="px-3 py-2.5 text-left">Discount</th>
                    <th className="px-3 py-2.5 text-left">Status</th>
                    <th className="px-3 py-2.5 text-left">Redeemed</th>
                    <th className="px-3 py-2.5 text-left">Valid window</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((row) => {
                    const discount = row.percentOff !== null ? `${row.percentOff}% off` : formatMoney(row.amountOffCents, resolvedCurrency);
                    const status = statusLabel(computeStatus(row));
                    const windowText = `${formatDate(row.startsAt, row.startsAtFormatted)} → ${formatDate(row.endsAt, row.endsAtFormatted)}`;

                    return (
                      <tr key={row.id} className="border-t border-slate-200/80 dark:border-neutral-800/80">
                        <td className="px-3 py-2.5 align-top">
                          <div className="font-mono text-sm font-semibold tracking-[0.3em] text-slate-900 dark:text-neutral-100">{row.code}</div>
                          {row.description ? (
                            <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-neutral-400">{row.description}</p>
                          ) : null}
                          <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">
                            Eligible for:{' '}
                            {row.eligiblePlans.length > 0
                              ? row.eligiblePlans.map((plan) => plan.name || 'Unnamed plan').join(', ')
                              : 'All plans'}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 align-top text-slate-700 dark:text-neutral-200">{discount}</td>
                        <td className="px-3 py-2.5 align-top">
                          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
                        </td>
                        <td className="px-3 py-2.5 align-top text-slate-600 dark:text-neutral-300">
                          <div>{formatDate(row.redeemedAt, row.redeemedAtFormatted)}</div>
                          {row.consumedAt ? (
                            <div className="text-xs text-slate-500 dark:text-neutral-400">Used {formatDate(row.consumedAt, row.consumedAtFormatted)}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 align-top text-slate-600 dark:text-neutral-300">{windowText}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {totalPages > 1 ? (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={(page) => fetchPage(page)}
            totalItems={typeof totalCount === 'number' ? totalCount : redemptions.length}
            itemsPerPage={pageSize}
            nextCursor={nextCursor}
            onNextWithCursor={(cursor) => fetchPage(currentPage + 1, false, cursor)}
          />
        ) : null}
      </section>
    </div>
  );
}
