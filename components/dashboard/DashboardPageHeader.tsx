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
	actions?: ReactNode;
	actionsAlign?: 'left' | 'right';
	stats?: DashboardPageHeaderStat[];
	children?: ReactNode;
	className?: string;
}

const cx = (...inputs: ClassValue[]) => twMerge(clsx(...inputs));

const accentStyles: Record<Accent, { wrapper: string; overlay: string; pill: string; dot: string }> = {
	theme: {
		wrapper:
			'border-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.18))] bg-[linear-gradient(135deg,rgb(var(--surface-hero-rgb)_/_calc(var(--surface-hero-a)*0.72)),rgb(var(--surface-hero-rgb)_/_calc(var(--surface-hero-a)*0.72))),linear-gradient(135deg,var(--theme-hero-gradient-from),var(--theme-hero-gradient-via),var(--theme-hero-gradient-to))] shadow-[0_12px_45px_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.12))] dark:border-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.30))] dark:bg-[linear-gradient(135deg,rgb(var(--surface-hero-rgb)_/_calc(var(--surface-hero-a)*0.42)),rgb(var(--surface-hero-rgb)_/_calc(var(--surface-hero-a)*0.42))),linear-gradient(135deg,var(--theme-hero-gradient-from),var(--theme-hero-gradient-via),var(--theme-hero-gradient-to))] dark:shadow-[0_0_40px_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.18))]',
		overlay:
			'bg-[radial-gradient(circle_at_top,_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.18)),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.28)),_transparent_60%)]',
		pill:
			'inline-flex items-center gap-2 rounded-full border border-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.25))] bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.08))] px-3 py-1 text-xs font-medium text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.88))] dark:border-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.35))] dark:bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.12))] dark:text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.95))]',
		dot: 'h-2 w-2 rounded-full bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.9))] animate-pulse dark:bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.95))]'
	},
	indigo: {
		wrapper:
			'border-slate-200 bg-gradient-to-br from-indigo-100 via-sky-50 to-white shadow-[0_12px_45px_rgba(30,64,175,0.12)] dark:border-neutral-800 dark:from-indigo-500/15 dark:via-blue-500/10 dark:to-transparent dark:shadow-[0_0_40px_rgba(59,130,246,0.15)]',
		overlay:
			'bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.28),_transparent_60%)]',
		pill:
			'inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-indigo-100',
		dot: 'h-2 w-2 rounded-full bg-indigo-500 animate-pulse dark:bg-indigo-300'
	},
	violet: {
		wrapper:
			'border-purple-200 bg-gradient-to-br from-violet-100 via-fuchsia-50 to-white shadow-[0_12px_45px_rgba(109,40,217,0.12)] dark:border-purple-500/40 dark:from-violet-500/15 dark:via-fuchsia-500/10 dark:to-transparent dark:shadow-[0_0_40px_rgba(168,85,247,0.18)]',
		overlay:
			'bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.2),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgba(192,132,252,0.28),_transparent_60%)]',
		pill:
			'inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-600 dark:border-purple-500/40 dark:bg-purple-500/10 dark:text-purple-100',
		dot: 'h-2 w-2 rounded-full bg-purple-500 animate-pulse dark:bg-purple-200'
	},
	emerald: {
		wrapper:
			'border-emerald-200 bg-gradient-to-br from-emerald-100 via-teal-50 to-white shadow-[0_12px_45px_rgba(16,185,129,0.12)] dark:border-emerald-500/40 dark:from-emerald-500/15 dark:via-teal-500/10 dark:to-transparent dark:shadow-[0_0_40px_rgba(16,185,129,0.18)]',
		overlay:
			'bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.28),_transparent_60%)]',
		pill:
			'inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100',
		dot: 'h-2 w-2 rounded-full bg-emerald-500 animate-pulse dark:bg-emerald-200'
	},
	amber: {
		wrapper:
			'border-amber-200 bg-gradient-to-br from-amber-100 via-orange-50 to-white shadow-[0_12px_45px_rgba(251,191,36,0.14)] dark:border-amber-500/40 dark:from-amber-500/20 dark:via-orange-500/10 dark:to-transparent dark:shadow-[0_0_40px_rgba(251,191,36,0.22)]',
		overlay:
			'bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.22),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.32),_transparent_60%)]',
		pill:
			'inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-600 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100',
		dot: 'h-2 w-2 rounded-full bg-amber-500 animate-pulse dark:bg-amber-200'
	}
,
	rose: {
		wrapper:
			'border-rose-200 bg-gradient-to-br from-rose-100 via-red-50 to-white shadow-[0_12px_45px_rgba(220,38,38,0.12)] dark:border-rose-500/40 dark:from-rose-500/15 dark:via-red-500/10 dark:to-transparent dark:shadow-[0_0_40px_rgba(239,68,68,0.18)]',
		overlay:
			'bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.22),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.32),_transparent_60%)]',
		pill:
			'inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100',
		dot: 'h-2 w-2 rounded-full bg-rose-500 animate-pulse dark:bg-rose-200'
	}
};

const statToneStyles: Record<Tone, { wrapper: string; label: string; value: string; helper: string }> = {
	theme: {
		wrapper:
			'rounded-2xl border border-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.20))] bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.06))] px-3 py-2 shadow-sm dark:border-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.30))] dark:bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.10))]',
		label:
			'text-xs uppercase tracking-wide text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.78))] dark:text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.75))]',
		value:
			'mt-1 text-base font-semibold text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.92))] dark:text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.95))]',
		helper:
			'text-xs text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.70))] dark:text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.70))]'
	},
	indigo: {
		wrapper: 'rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10',
		label: 'text-xs uppercase tracking-wide text-indigo-600/80 dark:text-indigo-100/70',
		value: 'mt-1 text-base font-semibold text-indigo-700 dark:text-indigo-100',
		helper: 'text-xs text-indigo-600/70 dark:text-indigo-200/70'
	},
	emerald: {
		wrapper: 'rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10',
		label: 'text-xs uppercase tracking-wide text-emerald-600/80 dark:text-emerald-100/70',
		value: 'mt-1 text-base font-semibold text-emerald-700 dark:text-emerald-100',
		helper: 'text-xs text-emerald-600/70 dark:text-emerald-200/70'
	},
	purple: {
		wrapper: 'rounded-2xl border border-purple-200 bg-purple-50 px-3 py-2 shadow-sm dark:border-purple-500/30 dark:bg-purple-500/10',
		label: 'text-xs uppercase tracking-wide text-purple-600/80 dark:text-purple-100/70',
		value: 'mt-1 text-base font-semibold text-purple-700 dark:text-purple-100',
		helper: 'text-xs text-purple-600/70 dark:text-purple-200/70'
	},
	blue: {
		wrapper: 'rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 shadow-sm dark:border-blue-500/30 dark:bg-blue-500/10',
		label: 'text-xs uppercase tracking-wide text-blue-600/80 dark:text-blue-100/70',
		value: 'mt-1 text-base font-semibold text-blue-700 dark:text-blue-100',
		helper: 'text-xs text-blue-600/70 dark:text-blue-200/70'
	},
	amber: {
		wrapper: 'rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10',
		label: 'text-xs uppercase tracking-wide text-amber-600/80 dark:text-amber-100/70',
		value: 'mt-1 text-base font-semibold text-amber-700 dark:text-amber-100',
		helper: 'text-xs text-amber-600/70 dark:text-amber-200/70'
	},
	rose: {
		wrapper: 'rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 shadow-sm dark:border-rose-500/30 dark:bg-rose-500/10',
		label: 'text-xs uppercase tracking-wide text-rose-600/80 dark:text-rose-100/70',
		value: 'mt-1 text-base font-semibold text-rose-700 dark:text-rose-100',
		helper: 'text-xs text-rose-600/70 dark:text-rose-200/70'
	},
	slate: {
		wrapper:
			'rounded-2xl border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.55))] bg-[linear-gradient(135deg,rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.75)),rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.75))),linear-gradient(135deg,var(--theme-card-gradient-from),var(--theme-card-gradient-via),var(--theme-card-gradient-to))] px-3 py-2 shadow-sm backdrop-blur-sm',
		label: 'text-xs uppercase tracking-wide text-[color:rgb(var(--text-secondary-rgb)_/_calc(var(--text-secondary-a)*0.85))]',
		value: 'mt-1 text-base font-semibold text-[color:rgb(var(--text-primary))]',
		helper: 'text-xs text-[color:rgb(var(--text-secondary-rgb)_/_calc(var(--text-secondary-a)*0.80))]'
	}
};

export function DashboardPageHeader({
	accent = 'theme',
	eyebrow,
	eyebrowIcon,
	title,
	description,
	actions,
	actionsAlign = 'left',
	stats,
	children,
	className
}: DashboardPageHeaderProps) {
	void accent;
	const palette = accentStyles.theme;

	return (
		<div
			data-dashboard-page-header="true"
			className={cx(
				'relative overflow-hidden rounded-3xl border p-6 transition-shadow',
				palette.wrapper,
				className
			)}
		>
			<div className="pointer-events-none absolute inset-0" aria-hidden="true">
				<div className={cx('h-full w-full', palette.overlay)} />
			</div>

			<div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div className="max-w-2xl space-y-3">
					{eyebrow ? (
						<div className={palette.pill}>
							<span className={palette.dot} />
							{eyebrowIcon ? <span className="hidden sm:inline-block text-base leading-none">{eyebrowIcon}</span> : null}
							<span>{eyebrow}</span>
						</div>
					) : null}

					<div className="space-y-2">
						<h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl dark:text-neutral-50">{title}</h1>
						{description ? (
							<p className="text-sm text-slate-600 dark:text-neutral-200/80">{description}</p>
						) : null}
					</div>

					{children ? <div className="space-y-2 text-sm text-slate-600 dark:text-neutral-200/80">{children}</div> : null}

					{actions && actionsAlign === 'left' ? (
						<div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">{actions}</div>
					) : null}
				</div>

				{actionsAlign === 'right' || (stats && stats.length > 0) ? (
					<div className="w-full max-w-lg space-y-2">
						{actions && actionsAlign === 'right' ? (
							<div className="flex w-full justify-end">
								<div className="flex flex-col gap-2 sm:flex-row sm:items-center">{actions}</div>
							</div>
						) : null}

						{stats && stats.length > 0 ? (
							<div className="grid w-full gap-2 text-sm grid-cols-2">
								{stats.map((stat, index) => {
								// Always use the themed neutral card style so all stat cards
								// look uniform against the gradient hero background.
								const tone = statToneStyles['slate'];
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
