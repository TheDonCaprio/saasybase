import clsx, { type ClassValue } from 'clsx';

const basePanel =
	'theme-shadow-panel rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.70))] bg-[color:rgb(var(--bg-secondary))] transition-shadow';

const baseCard =
	'theme-shadow-card rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.70))] bg-[color:rgb(var(--surface-card))] transition-shadow';

const PADDING_OVERRIDE_RE = /(?:^|\s)(?:[a-z-]+:)*!?p(?:x|y|t|r|b|l)?-(?:\[[^\]]+\]|[^\s]+)/;

function withDefaultPadding(defaultPadding: string, ...extra: ClassValue[]) {
	const extraClasses = clsx(...extra);
	if (PADDING_OVERRIDE_RE.test(extraClasses)) {
		return extraClasses;
	}
	return clsx(defaultPadding, extraClasses);
}

export function dashboardPanelClass(...extra: ClassValue[]) {
	return clsx(basePanel, withDefaultPadding('p-6', ...extra));
}

export function dashboardCardClass(...extra: ClassValue[]) {
	return clsx(baseCard, withDefaultPadding('p-6', ...extra));
}

export function dashboardMutedPanelClass(...extra: ClassValue[]) {
	return clsx(
		'theme-shadow-panel rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.60))] bg-[color:rgb(var(--bg-secondary-rgb)_/_calc(var(--bg-secondary-a)*0.70))]',
		withDefaultPadding('p-6', ...extra)
	);
}

export function dashboardDangerPanelClass(...extra: ClassValue[]) {
	return clsx(
		'theme-shadow-panel rounded-[var(--theme-surface-radius)] border border-red-200/80 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10',
		withDefaultPadding('p-6', ...extra)
	);
}

export function dashboardPillClass(...extra: ClassValue[]) {
	return clsx(
		'inline-flex items-center gap-2 rounded-full border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.60))] bg-[color:rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.70))] text-xs font-medium text-slate-600 dark:text-neutral-200',
		withDefaultPadding('px-3 py-1', ...extra)
	);
}
