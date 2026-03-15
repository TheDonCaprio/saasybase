'use client';

import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { formatDate, type FormatMode } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';

export type AppWarning = {
  code: string;
  message: string;
  [key: string]: unknown;
};

export type SharedCapContext = {
  strategy: 'SOFT' | 'HARD' | 'DISABLED';
  cap: number | null;
  usageBefore: number;
  usageAfter: number;
  remainingBefore: number | null;
  remainingAfter: number | null;
  windowStart: string | null;
  resetIntervalHours: number | null;
};

type Props = {
  isOpen: boolean;
  title?: string;
  description?: string;
  warnings: AppWarning[];
  acknowledgeLabel?: string;
  onClose: () => void;
  context?: {
    tokenName?: string;
    sharedCap?: SharedCapContext;
  };
};

function formatNumber(value: unknown) {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(n)));
}

function warningTitle(warnings: AppWarning[]) {
  const codes = new Set(warnings.map((w) => String(w.code || '')));
  if (codes.has('soft_cap_exceeded')) return 'Workspace cap exceeded';
  return 'Notice';
}

function warningDescription(warnings: AppWarning[], tokenName: string) {
  const codes = new Set(warnings.map((w) => String(w.code || '')));
  if (codes.has('soft_cap_exceeded')) {
    return `You’ve exceeded your workspace ${tokenName} cap. Your request still succeeded because this workspace uses SOFT caps.`;
  }
  return 'Your request succeeded, but there is something you should review.';
}

function resolveDateTimeMode(siteMode: string | undefined): FormatMode {
  // Site settings allow a date-only mode, but for a window start we always want a timestamp.
  if (siteMode === 'iso') return 'iso';
  if (siteMode === 'locale') return 'locale';
  return 'datetime';
}

export function WarningsModal({
  isOpen,
  title,
  description,
  warnings,
  acknowledgeLabel = 'Got it',
  onClose,
  context,
}: Props) {
  const formatSettings = useFormatSettings();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    if (!isOpen) return;
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const tokenName = useMemo(() => {
    const raw = context?.tokenName;
    const normalized = typeof raw === 'string' ? raw.trim() : '';
    return normalized || 'tokens';
  }, [context?.tokenName]);

  const resolvedTitle = title || warningTitle(warnings);
  const resolvedDescription = description || warningDescription(warnings, tokenName);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[70000] flex min-h-screen items-center justify-center bg-slate-900/50 px-4 py-8 backdrop-blur-sm dark:bg-black/60">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6 dark:border-neutral-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{resolvedTitle}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-neutral-300">{resolvedDescription}</p>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 text-slate-400 hover:text-slate-600 transition-colors dark:text-neutral-400 dark:hover:text-white"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/60 dark:bg-amber-950/30">
            <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">Warnings</div>
            <ul className="mt-2 space-y-2 text-sm text-amber-900/90 dark:text-amber-100/90">
              {warnings.map((w, idx) => (
                <li key={`${String(w.code)}-${idx}`} className="flex gap-2">
                  <span className="mt-0.5 h-2 w-2 flex-none rounded-full bg-amber-500 dark:bg-amber-400" />
                  <div>
                    <div className="font-medium">{String(w.message || w.code || 'warning')}</div>
                    {w.code === 'soft_cap_exceeded' && (
                      <div className="mt-1 text-xs text-amber-900/70 dark:text-amber-100/70">
                        Cap: {formatNumber(w.cap)} · Usage: {formatNumber(w.usageBefore)} → {formatNumber(w.usageAfter)}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {context?.sharedCap && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/40">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Cap details</div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500 dark:text-neutral-400">Strategy</div>
                  <div className="text-slate-900 dark:text-neutral-200">{context.sharedCap.strategy}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-neutral-400">Cap</div>
                  <div className="text-slate-900 dark:text-neutral-200">{context.sharedCap.cap == null ? 'Unlimited' : formatNumber(context.sharedCap.cap)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-neutral-400">Remaining (after)</div>
                  <div className="text-slate-900 dark:text-neutral-200">
                    {context.sharedCap.remainingAfter == null ? 'Unlimited' : formatNumber(context.sharedCap.remainingAfter)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-neutral-400">Reset window</div>
                  <div className="text-slate-900 dark:text-neutral-200">
                    {context.sharedCap.resetIntervalHours == null ? 'No reset' : `${formatNumber(context.sharedCap.resetIntervalHours)} hours`}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500 dark:text-neutral-400">
                Window start:{' '}
                {context.sharedCap.windowStart
                  ? formatDate(context.sharedCap.windowStart, {
                      mode: resolveDateTimeMode(formatSettings.mode),
                      timezone: formatSettings.timezone,
                    })
                  : '—'}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 pt-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-amber-600 text-white font-semibold hover:bg-amber-700 transition-colors"
          >
            {acknowledgeLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
