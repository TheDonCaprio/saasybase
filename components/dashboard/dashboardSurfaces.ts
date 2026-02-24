import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const basePanel =
	'rounded-2xl border border-[color:rgb(var(--border-primary)_/_0.70)] bg-[color:rgb(var(--bg-secondary))] p-6 shadow-sm transition-shadow dark:shadow-[0_0_25px_rgba(15,23,42,0.45)]';

const baseCard =
	'rounded-2xl border border-[color:rgb(var(--border-primary)_/_0.70)] bg-[color:rgb(var(--surface-card))] p-6 shadow-sm transition-shadow dark:shadow-[0_0_25px_rgba(15,23,42,0.45)]';

export function dashboardPanelClass(...extra: ClassValue[]) {
	return twMerge(basePanel, clsx(extra));
}

export function dashboardCardClass(...extra: ClassValue[]) {
	return twMerge(baseCard, clsx(extra));
}

export function dashboardMutedPanelClass(...extra: ClassValue[]) {
	return twMerge(
		'rounded-2xl border border-[color:rgb(var(--border-primary)_/_0.60)] bg-[color:rgb(var(--bg-secondary)_/_0.70)] p-6 shadow-sm backdrop-blur-sm',
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
		'inline-flex items-center gap-2 rounded-full border border-[color:rgb(var(--border-primary)_/_0.60)] bg-[color:rgb(var(--surface-card)_/_0.70)] px-3 py-1 text-xs font-medium text-slate-600 backdrop-blur-sm dark:text-neutral-200',
		clsx(extra)
	);
}
