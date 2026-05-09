"use client";

import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cx = (...inputs: ClassValue[]) => twMerge(clsx(...inputs));

export interface SystemBadgeProps {
  label: string;
  value: string;
  tone?: 'emerald' | 'amber' | 'blue' | 'violet' | 'slate';
  title?: string;
  valueClassName?: string;
}

// Use a loose string index here to avoid narrowing issues when `tone` may be undefined.
const toneMap: Record<string, string> = {
  emerald:
    'from-emerald-100 to-emerald-50 border-emerald-200 text-emerald-700 shadow-sm dark:from-emerald-500/15 dark:to-emerald-500/5 dark:border-emerald-500/30 dark:text-emerald-100 dark:shadow-inner',
  amber:
    'from-amber-100 to-amber-50 border-amber-200 text-amber-700 shadow-sm dark:from-amber-500/15 dark:to-amber-500/5 dark:border-amber-500/30 dark:text-amber-100 dark:shadow-inner',
  blue:
    'from-sky-100 to-sky-50 border-sky-200 text-sky-700 shadow-sm dark:from-sky-500/15 dark:to-sky-500/5 dark:border-sky-500/30 dark:text-sky-100 dark:shadow-inner',
  violet:
    'from-violet-100 to-violet-50 border-violet-200 text-violet-700 shadow-sm dark:from-violet-500/15 dark:to-violet-500/5 dark:border-violet-500/30 dark:text-violet-100 dark:shadow-inner',
  slate:
    'from-slate-100 to-white border-slate-200 text-slate-700 shadow-sm dark:from-slate-500/15 dark:to-slate-500/5 dark:border-slate-500/30 dark:text-slate-100 dark:shadow-inner'
};

export function SystemBadge({ label, value, tone = 'slate', title, valueClassName }: SystemBadgeProps) {
  return (
    <div className={cx('rounded-2xl border bg-gradient-to-br p-4', toneMap[tone])} title={title}>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className={cx('mt-2 text-[0.8rem] font-semibold leading-tight sm:text-sm', valueClassName)}>{value}</p>
    </div>
  );
}
