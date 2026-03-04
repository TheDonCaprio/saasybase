"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CouponRedeemer, type CouponRedemptionRow } from './CouponRedeemer';
import { dashboardPanelClass } from './dashboardSurfaces';
import { showToast } from '../ui/Toast';

export default function PlanBillingActions({ displayCurrency }: { displayCurrency?: string }) {
  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemLoading] = useState(false);
  const [initialCoupons, setInitialCoupons] = useState<CouponRedemptionRow[]>([]);
  const [initialTotal, setInitialTotal] = useState<number>(0);
  const [initialPage, setInitialPage] = useState<number>(1);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showRedeem && !redeemLoading) setShowRedeem(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showRedeem, redeemLoading]);

  useEffect(() => {
    const fetchUnusedCoupons = async () => {
      setInitialLoading(true);
      try {
        const res = await fetch('/api/dashboard/coupons?unusedOnly=true');
        if (!res.ok) {
          showToast('Unable to load coupons', 'error');
          return;
        }
        const json = await res.json().catch(() => null) as unknown;
        if (!json || typeof json !== 'object') {
          return;
        }
        const data = json as Record<string, unknown>;
        const couponsRaw = Array.isArray(data.coupons) ? data.coupons : [];
        const filtered = couponsRaw.filter((row) => {
          if (!row || typeof row !== 'object') return false;
          const record = row as Record<string, unknown>;
          return record.consumedAt == null;
        }) as CouponRedemptionRow[];
        setInitialCoupons(filtered);
        const total = typeof data.totalCount === 'number' ? data.totalCount : filtered.length;
        setInitialTotal(total);
        const page = typeof data.currentPage === 'number' ? data.currentPage : 1;
        setInitialPage(page);
        setInitialLoaded(true);
      } catch (err) {
        console.error('Failed to preload coupons', err);
        showToast('Unable to load coupons', 'error');
      } finally {
        setInitialLoading(false);
      }
    };

    if (showRedeem && !initialLoaded && !initialLoading) {
      void fetchUnusedCoupons();
    }
  }, [showRedeem, initialLoaded, initialLoading]);

  const modalFilters = useMemo(() => ({ unusedOnly: 'true' }), []);

  // Use .text-actual-white utility to ensure white text even in light theme

  return (
    <div className={dashboardPanelClass('mt-4')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600 dark:text-neutral-300 sm:max-w-[55%]">
          Looking for recent activity? View transactions and invoices for a quick audit of charges.
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/transactions"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
          >
            Recent transactions
          </Link>

          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-purple-300 hover:bg-purple-50 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
          >
            Billing settings
          </Link>

          <button
            type="button"
            onClick={() => setShowRedeem(true)}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white text-actual-white shadow-sm transition hover:bg-emerald-700"
          >
            Redeem a coupon
          </button>
        </div>
      </div>

      {showRedeem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowRedeem(false)} />
          <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-neutral-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Redeem a coupon</h3>
              <button
                onClick={() => setShowRedeem(false)}
                disabled={redeemLoading}
                className="text-slate-500 hover:text-slate-700 dark:text-neutral-300 dark:hover:text-neutral-100"
                aria-label="Close redeem coupon modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6 p-6">
              {initialLoading ? (
                <div className="flex items-center justify-center py-12 text-sm font-medium text-slate-500 dark:text-neutral-300">
                  <div className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-neutral-700 dark:border-t-neutral-200" />
                  Loading available coupons…
                </div>
              ) : (
                <>
                  <CouponRedeemer
                    initialRedemptions={initialCoupons}
                    initialTotalCount={initialTotal}
                    initialPage={initialPage}
                    pageSize={20}
                    initialFilters={modalFilters}
                    displayCurrency={displayCurrency}
                  />
                  <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 text-xs text-slate-600 dark:bg-neutral-800/70 dark:text-neutral-300 sm:flex-row sm:items-center sm:justify-between">
                    <span>Need to review redeemed or expired codes? Open the full coupon manager.</span>
                    <Link
                      href="/dashboard/coupons"
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
                    >
                      Go to coupon dashboard
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
