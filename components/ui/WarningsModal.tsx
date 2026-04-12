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

  const normalizedWarnings = useMemo(() => {
    const seen = new Set<string>();

    return warnings.filter((warning) => {
      const key = `${String(warning.code || '')}::${String(warning.message || '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [warnings]);

  const resolvedTitle = title || warningTitle(warnings);
  const resolvedDescription = description || warningDescription(warnings, tokenName);
  const normalizedDescription = resolvedDescription.trim();
  const isErrorState = normalizedWarnings.some((warning) => String(warning.code || '') === 'error');
  const toneClasses = isErrorState
    ? {
        badge: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200',
        panel: 'border-rose-200 bg-rose-50/90 dark:border-rose-500/25 dark:bg-rose-500/10',
        title: 'text-rose-900 dark:text-rose-100',
        body: 'text-rose-800/90 dark:text-rose-100/85',
        dot: 'bg-rose-500 dark:bg-rose-400',
      }
    : {
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
        panel: 'border-amber-200 bg-amber-50/90 dark:border-amber-500/25 dark:bg-amber-500/10',
        title: 'text-amber-900 dark:text-amber-100',
        body: 'text-amber-900/85 dark:text-amber-100/85',
        dot: 'bg-amber-500 dark:bg-amber-400',
      };
  const primaryWarningMessage = normalizedWarnings[0]?.message?.trim() || '';
  const isDuplicateSummary = normalizedWarnings.length === 1 && primaryWarningMessage === normalizedDescription;
  const additionalWarnings = isDuplicateSummary
    ? []
    : normalizedWarnings.filter((warning) => String(warning.message || '').trim() !== normalizedDescription);
  const summaryMessage = normalizedDescription || primaryWarningMessage;

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[70000] flex min-h-screen items-center justify-center bg-slate-900/50 px-4 py-8 backdrop-blur-sm dark:bg-black/60">
      <div className="w-full max-w-lg overflow-hidden rounded-[calc(var(--theme-surface-radius)+6px)] border border-slate-200/90 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] dark:border-neutral-800 dark:bg-neutral-950/95 dark:shadow-[0_28px_70px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200/90 px-6 py-5 dark:border-neutral-800">
          <div className="space-y-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${toneClasses.badge}`}>
              {isErrorState ? 'Action required' : 'Review'}
            </span>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{resolvedTitle}</h2>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-white"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {summaryMessage ? (
            <div className={`rounded-[var(--theme-surface-radius)] border p-4 ${toneClasses.panel}`}>
              <div className={`text-sm font-semibold ${toneClasses.title}`}>{isErrorState ? 'Issue summary' : 'Summary'}</div>
              <p className={`mt-1 text-sm leading-6 ${toneClasses.body}`}>{summaryMessage}</p>
            </div>
          ) : null}

          {additionalWarnings.length > 0 ? (
            <div className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-slate-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Details</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-neutral-200">
                {additionalWarnings.map((warning, idx) => (
                  <li key={`${String(warning.code)}-${idx}`} className="flex gap-2">
                    <span className={`mt-2 h-1.5 w-1.5 flex-none rounded-full ${toneClasses.dot}`} />
                    <div>
                      <div className="font-medium">{String(warning.message || warning.code || 'warning')}</div>
                      {warning.code === 'soft_cap_exceeded' && (
                        <div className="mt-1 text-xs text-slate-500 dark:text-neutral-400">
                          Cap: {formatNumber(warning.cap)} · Usage: {formatNumber(warning.usageBefore)} → {formatNumber(warning.usageAfter)}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {context?.sharedCap && (
            <div className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-slate-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/40">
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

        <div className="flex justify-end gap-3 px-6 pb-6 pt-1">
          <button
            onClick={onClose}
            className="rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--accent-rgb))] bg-[color:rgb(var(--accent-rgb))] px-4 py-2 font-semibold text-white shadow-[0_10px_24px_rgb(var(--accent-rgb)_/_0.2)] transition duration-200 hover:brightness-[1.03] hover:shadow-[0_14px_30px_rgb(var(--accent-rgb)_/_0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--accent-rgb)_/_0.22)]"
          >
            {acknowledgeLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
