"use client";

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

export interface TrafficDrilldownRow {
  label: string;
  count: number;
  percentage?: number;
}

interface TrafficDrilldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  rows: TrafficDrilldownRow[];
  totalRows: number;
  totalMetricValue: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  loading: boolean;
  error?: string | null;
  onPageChange: (page: number) => void;
  emptyMessage?: string;
}

export function TrafficDrilldownModal({
  isOpen,
  onClose,
  title,
  subtitle,
  rows,
  totalRows,
  totalMetricValue,
  page,
  pageSize,
  hasMore,
  loading,
  error,
  onPageChange,
  emptyMessage = 'No data available for this period.'
}: TrafficDrilldownModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => b.count - a.count);
  }, [rows]);

  const hasPercentage = sortedRows.some((row) => typeof row.percentage === 'number');
  const effectiveTotalCount = totalMetricValue > 0 ? totalMetricValue : sortedRows.reduce((acc, row) => acc + row.count, 0);
  const startRank = (page - 1) * pageSize;
  const fromItem = totalRows === 0 ? 0 : Math.min(totalRows, startRank + 1);
  const toItem = totalRows === 0 ? 0 : Math.min(totalRows, startRank + sortedRows.length);
  const disablePrev = loading || page <= 1;
  const disableNext = loading || !hasMore;

  if (!isOpen || !mounted || typeof document === 'undefined') {
    return null;
  }

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 sm:px-6">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-900 shadow-2xl transition-all dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100">
        <div className="flex items-start justify-between border-b border-neutral-200 p-6 dark:border-neutral-800">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{title}</h2>
            {subtitle ? <p className="text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p> : null}
            {effectiveTotalCount > 0 ? (
              <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{Math.round(effectiveTotalCount).toLocaleString()} total</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Close drilldown"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-6">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          ) : sortedRows.length === 0 && !loading ? (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-100 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-400">
              {emptyMessage}
            </div>
          ) : (
            <table className="w-full table-auto border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  <th className="pb-3 font-medium">Rank</th>
                  <th className="pb-3 font-medium">Label</th>
                  <th className="pb-3 font-medium text-right">Count</th>
                  {hasPercentage ? <th className="pb-3 font-medium text-right">Share</th> : null}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, index) => (
                  <tr
                    key={`${row.label}-${startRank + index}`}
                    className="border-t border-neutral-200 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-900/70"
                  >
                    <td className="py-3 pr-4 align-middle text-xs text-neutral-500 dark:text-neutral-400">#{startRank + index + 1}</td>
                    <td className="py-3 pr-4 align-middle">
                      <span className="break-words">{row.label || 'Unknown'}</span>
                    </td>
                    <td className="py-3 pr-4 align-middle text-right font-medium text-blue-600 dark:text-blue-300">
                      {row.count.toLocaleString()}
                    </td>
                    {hasPercentage ? (
                      <td className="py-3 align-middle text-right text-neutral-500 dark:text-neutral-400">
                        {typeof row.percentage === 'number' ? `${row.percentage.toFixed(1)}%` : '—'}
                      </td>
                    ) : null}
                  </tr>
                ))}
                {loading ? (
                  <tr>
                    <td colSpan={hasPercentage ? 4 : 3} className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                      Loading…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-100 px-6 py-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-300">
          {totalRows > 0 ? (
            <div>
              Showing {fromItem.toLocaleString()}–{toItem.toLocaleString()} of {totalRows.toLocaleString()}
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={disablePrev}
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300 px-3 py-1.5 font-medium text-neutral-600 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Prev
            </button>
            <span className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Page {page.toLocaleString()} of {Math.max(1, Math.ceil(totalRows / pageSize)).toLocaleString()}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={disableNext}
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300 px-3 py-1.5 font-medium text-neutral-600 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Next
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 font-medium text-neutral-700 transition-colors hover:bg-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-neutral-700 dark:bg-transparent dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
