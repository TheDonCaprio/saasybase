import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const basePanel =
	'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow dark:border-neutral-800 dark:bg-neutral-900/60 dark:shadow-[0_0_25px_rgba(15,23,42,0.45)]';

export function dashboardPanelClass(...extra: ClassValue[]) {
	return twMerge(basePanel, clsx(extra));
}

export function dashboardMutedPanelClass(...extra: ClassValue[]) {
	return twMerge(
		'rounded-2xl border border-slate-200 bg-slate-50/70 p-6 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/40',
		clsx(extra)
	);
}

export function dashboardDangerPanelClass(...extra: ClassValue[]) {
	return twMerge(
		'rounded-2xl border border-red-200/80 bg-red-50 p-6 shadow-sm dark:border-red-500/40 dark:bg-red-500/10',
		clsx(extra)
	);
}

export function dashboardPillClass(...extra: ClassValue[]) {
	return twMerge(
		'inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600 backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200',
		clsx(extra)
	);
}
