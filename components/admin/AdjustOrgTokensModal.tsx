"use client";

import React, { useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  orgId: string;
  orgName?: string;
  currentBalance?: number;
  onClose: () => void;
  onSuccess?: (newBalance: number) => void;
};

export default function AdjustOrgTokensModal({ orgId, orgName, currentBalance = 0, onClose, onSuccess }: Props) {
  const [amount, setAmount] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const delta = typeof amount === 'number' ? Math.trunc(amount) : 0;
    if (!delta) return setError('Please enter a non-zero integer amount');
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/adjust-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: delta, reason })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setError(data?.error || 'Failed to adjust balance');
        setLoading(false);
        return;
      }
      onSuccess?.(data.org.tokenBalance);
      setLoading(false);
      onClose();
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[65000] flex items-start justify-center overflow-y-auto px-4 py-6 sm:py-10">
      <div
        className="fixed inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <form onSubmit={handleSubmit} className="relative z-[65001] w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        <header className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Adjust Organization Tokens</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white"
          >
            ✕
          </button>
        </header>

        <div className="space-y-3 text-sm text-slate-600 dark:text-neutral-300">
          <div>
            <div className="text-xs text-slate-500 dark:text-neutral-400">Organization</div>
            <div className="font-medium text-slate-900 dark:text-white">{orgName ?? orgId}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-neutral-400">Current balance</div>
            <div className="font-mono text-slate-900 dark:text-white">{currentBalance}</div>
          </div>

          <label className="block">
            <div className="text-xs text-slate-500 dark:text-neutral-400 mb-1">Amount (positive to credit, negative to debit)</div>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:border-indigo-500"
            />
          </label>

          <label className="block">
            <div className="text-xs text-slate-500 dark:text-neutral-400 mb-1">Reason (optional)</div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:focus:border-indigo-500"
              rows={3}
            />
          </label>

          {error && <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Applying...' : 'Apply Adjustment'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
