import type { ReactNode } from 'react';
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

type Accent = 'theme' | 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose';
type Tone = 'theme' | 'indigo' | 'emerald' | 'purple' | 'blue' | 'amber' | 'rose' | 'slate';

export interface DashboardPageHeaderStat {
	label: ReactNode;
	value: ReactNode;
	helper?: ReactNode;
	tone?: Tone;
}

export interface DashboardPageHeaderProps {
	accent?: Accent;
	eyebrow?: ReactNode;
	eyebrowIcon?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	copyClassName?: string;
	descriptionClassName?: string;
	actions?: ReactNode;
	actionsAlign?: 'left' | 'right';
	stats?: DashboardPageHeaderStat[];
	children?: ReactNode;
	className?: string;
}

const cx = (...inputs: ClassValue[]) => twMerge(clsx(...inputs));

const accentStyles: Record<Accent, { pill: string; dot: string }> = {
	theme: {
		pill:
			'inline-flex items-center gap-2 rounded-full border border-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.25))] bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.08))] px-3 py-1 text-xs font-medium text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.88))] dark:border-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.35))] dark:bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.12))] dark:text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.95))]',
		dot: 'h-2 w-2 rounded-full bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.9))] animate-pulse dark:bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.95))]'
	},
	indigo: {
		pill:
			'inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-indigo-100',
		dot: 'h-2 w-2 rounded-full bg-indigo-500 animate-pulse dark:bg-indigo-300'
	},
	violet: {
		pill:
			'inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-600 dark:border-purple-500/40 dark:bg-purple-500/10 dark:text-purple-100',
		dot: 'h-2 w-2 rounded-full bg-purple-500 animate-pulse dark:bg-purple-200'
	},
	emerald: {
		pill:
			'inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100',
		dot: 'h-2 w-2 rounded-full bg-emerald-500 animate-pulse dark:bg-emerald-200'
	},
	amber: {
		pill:
			'inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-600 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100',
		dot: 'h-2 w-2 rounded-full bg-amber-500 animate-pulse dark:bg-amber-200'
	}
,
	rose: {
		pill:
			'inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100',
		dot: 'h-2 w-2 rounded-full bg-rose-500 animate-pulse dark:bg-rose-200'
	}
};

const themedStatTone = {
	wrapper:
		'theme-shadow-card rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.24))] bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.12))] px-3 py-2',
	label:
		'text-[11px] uppercase tracking-[0.06em] text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.82))] dark:text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.9))]',
	value:
		'mt-1 text-[0.95rem] font-semibold text-[color:rgb(var(--text-primary))] sm:text-[0.98rem]',
	helper:
		'text-xs text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.82))] dark:text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.88))]'
};

const statToneStyles: Record<Tone, { wrapper: string; label: string; value: string; helper: string }> = {
	theme: themedStatTone,
	indigo: themedStatTone,
	emerald: themedStatTone,
	purple: themedStatTone,
	blue: themedStatTone,
	amber: themedStatTone,
	rose: themedStatTone,
	slate: {
		wrapper:
			'rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.55))] bg-[linear-gradient(135deg,rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.75)),rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.75))),linear-gradient(135deg,var(--theme-card-gradient-from),var(--theme-card-gradient-via),var(--theme-card-gradient-to))] px-3 py-2 shadow-sm',
		label: 'text-[11px] uppercase tracking-[0.06em] text-[color:rgb(var(--text-secondary-rgb)_/_calc(var(--text-secondary-a)*0.85))]',
		value: 'mt-1 text-[0.95rem] font-semibold text-[color:rgb(var(--text-primary))] sm:text-[0.98rem]',
		helper: 'text-xs text-[color:rgb(var(--text-secondary-rgb)_/_calc(var(--text-secondary-a)*0.80))]'
	}
};

export function DashboardPageHeader({
	accent = 'theme',
	eyebrow,
	eyebrowIcon,
	title,
	description,
	copyClassName,
	descriptionClassName,
	actions,
	actionsAlign = 'left',
	stats,
	children,
	className
}: DashboardPageHeaderProps) {
	const palette = accentStyles[accent];
	const rightStats = stats ?? [];
	const hasRightStats = rightStats.length > 0;
	const toneForAccent: Record<Accent, Tone> = {
		theme: 'theme',
		indigo: 'theme',
		violet: 'theme',
		emerald: 'theme',
		amber: 'theme',
		rose: 'theme',
	};

	return (
		<div
			data-dashboard-page-header="true"
			className={cx(
				'relative',
				className
			)}
		>
			<div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div
					className={cx(
						'space-y-3',
						actionsAlign === 'right' && !hasRightStats ? 'min-w-0 flex-1 max-w-none' : 'max-w-2xl',
					)}
				>
					{eyebrow ? (
						<div className={palette.pill}>
							<span className={palette.dot} />
							{eyebrowIcon ? <span className="hidden sm:inline-block text-base leading-none">{eyebrowIcon}</span> : null}
							<span>{eyebrow}</span>
						</div>
					) : null}

					<div className={cx('space-y-2', copyClassName)}>
						<h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl dark:text-neutral-50">{title}</h1>
						{description ? (
							<p className={cx('text-sm text-slate-600 dark:text-neutral-200/80', descriptionClassName)}>{description}</p>
						) : null}
					</div>

					{children ? <div className="space-y-2 text-sm text-slate-600 dark:text-neutral-200/80">{children}</div> : null}

					{actions && actionsAlign === 'left' ? (
						<div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">{actions}</div>
					) : null}
				</div>

				{actionsAlign === 'right' || hasRightStats ? (
					<div className={cx(hasRightStats ? 'w-full max-w-lg space-y-2' : 'ml-auto w-auto max-w-full space-y-2')}>
						{actions && actionsAlign === 'right' ? (
							<div className="flex w-full justify-end">
								<div className="flex flex-col gap-2 sm:flex-row sm:items-center">{actions}</div>
							</div>
						) : null}

						{hasRightStats ? (
							<div className="grid w-full gap-2 text-sm grid-cols-2">
								{rightStats.map((stat, index) => {
								const tone = statToneStyles[stat.tone ?? toneForAccent[accent]];
									return (
										<div key={index} className={tone.wrapper}>
											<p className={tone.label}>{stat.label}</p>
											<p className={tone.value}>{stat.value}</p>
											{stat.helper ? <p className={tone.helper}>{stat.helper}</p> : null}
										</div>
									);
								})}
							</div>
						) : null}
					</div>
				) : null}
			</div>
		</div>
	);
}

export function dashboardMetricClass(tone: Tone = 'slate') {
	return statToneStyles[tone];
}
