import type { ReactNode } from 'react';
import clsx from 'clsx';
import PlanBillingActions from './PlanBillingActions';

type TileTone = 'emerald' | 'rose' | 'violet' | 'blue' | 'amber' | 'slate' | 'indigo';
type BadgeTone = 'emerald' | 'amber' | 'violet' | 'indigo' | 'slate';

const tileToneClasses: Record<TileTone, string> = {
	emerald:
		'rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-white p-4 text-xs text-slate-700 shadow-sm backdrop-blur-sm transition hover:shadow-md dark:border-emerald-500/40 dark:from-emerald-500/10 dark:via-neutral-900/60 dark:to-transparent dark:text-neutral-100',
	rose:
		'rounded-xl border border-rose-200/70 bg-gradient-to-br from-rose-50 via-white to-white p-4 text-xs text-slate-700 shadow-sm backdrop-blur-sm transition hover:shadow-md dark:border-rose-500/40 dark:from-rose-500/10 dark:via-neutral-900/60 dark:to-transparent dark:text-neutral-100',
	violet:
		'rounded-xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-white p-4 text-xs text-slate-700 shadow-sm backdrop-blur-sm transition hover:shadow-md dark:border-violet-500/40 dark:from-violet-500/10 dark:via-neutral-900/60 dark:to-transparent dark:text-neutral-100',
	blue:
		'rounded-xl border border-blue-200/70 bg-gradient-to-br from-blue-50 via-white to-white p-4 text-xs text-slate-700 shadow-sm backdrop-blur-sm transition hover:shadow-md dark:border-blue-500/40 dark:from-blue-500/10 dark:via-neutral-900/60 dark:to-transparent dark:text-neutral-100',
	amber:
		'rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-white p-4 text-xs text-slate-700 shadow-sm backdrop-blur-sm transition hover:shadow-md dark:border-amber-500/40 dark:from-amber-500/10 dark:via-neutral-900/60 dark:to-transparent dark:text-neutral-100',
	slate:
		'rounded-xl border border-slate-200/80 bg-white/80 p-4 text-xs text-slate-600 shadow-sm backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300',
	indigo:
		'rounded-xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-white to-white p-4 text-xs text-slate-700 shadow-sm backdrop-blur-sm transition hover:shadow-md dark:border-indigo-500/40 dark:from-indigo-500/10 dark:via-neutral-900/60 dark:to-transparent dark:text-neutral-100',
};

	const tileAccentClasses: Record<TileTone, string> = {
		emerald: 'text-emerald-600 dark:text-emerald-200',
		rose: 'text-rose-600 dark:text-rose-200',
		violet: 'text-violet-600 dark:text-violet-200',
		blue: 'text-blue-600 dark:text-blue-200',
		amber: 'text-amber-600 dark:text-amber-300',
		slate: 'text-slate-500 dark:text-neutral-400',
		indigo: 'text-indigo-600 dark:text-indigo-200',
	};

const badgeToneClasses: Record<BadgeTone, string> = {
	emerald:
		'rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-white p-3 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm dark:border-emerald-500/40 dark:from-emerald-500/10 dark:via-neutral-900/60 dark:to-transparent dark:text-neutral-100',
	amber:
		'rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-white p-3 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm dark:border-amber-500/40 dark:from-amber-500/10 dark:via-neutral-900/60 dark:to-transparent dark:text-neutral-100',
	violet:
		'rounded-xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-white p-3 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm dark:border-violet-500/40 dark:from-violet-500/10 dark:via-neutral-900/60 dark:to-transparent dark:text-neutral-100',
	indigo:
		'rounded-xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-white to-white p-3 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm dark:border-indigo-500/40 dark:from-indigo-500/10 dark:via-neutral-900/60 dark:to-transparent dark:text-neutral-100',
	slate:
		'rounded-xl border border-slate-200/80 bg-white/80 p-3 text-xs font-medium text-slate-600 shadow-sm backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300',
};

const badgeAccentClasses: Record<BadgeTone, string> = {
	emerald: 'text-emerald-600 dark:text-emerald-200',
	amber: 'text-amber-600 dark:text-amber-300',
	violet: 'text-violet-600 dark:text-violet-200',
	indigo: 'text-indigo-600 dark:text-indigo-200',
	slate: 'text-slate-600 dark:text-neutral-300',
};

export interface PlanInfoTile {
	label: ReactNode;
	value: ReactNode;
	helper?: ReactNode;
	tone?: TileTone;
}

export interface ProgressBadge {
	label: ReactNode;
	value: ReactNode;
	tone?: BadgeTone;
}

export interface PlanProgressSummary {
	label?: ReactNode;
	dateDisplay?: ReactNode;
	percent?: number;
	helper?: ReactNode;
	secondary?: ReactNode;
	badges?: ProgressBadge[];
}

export interface PlanSummary {
	eyebrow?: ReactNode;
	name?: ReactNode;
	description?: ReactNode;
}

export interface EmptyPlanState {
	heading?: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
}

export interface CancellationNotice {
	heading: ReactNode;
	body: ReactNode;
}

export interface PendingSwitchNotice {
	heading: ReactNode;
	body: ReactNode;
}


export interface CurrentPlanStatusProps {
	title?: ReactNode;
	description?: ReactNode;
	isActive: boolean;
	actions?: ReactNode;
	planSummary?: PlanSummary;
	infoTiles?: PlanInfoTile[];
	progress?: PlanProgressSummary;
	cancellationNotice?: CancellationNotice;
	pendingSwitchNotice?: PendingSwitchNotice;
	emptyState?: EmptyPlanState;
	extra?: ReactNode;
	className?: string;
}

const defaultEmptyState: EmptyPlanState = {
	heading: 'No active subscription',
	description: 'Activate a plan to unlock premium features.',
};

const clampPercent = (percent?: number) => {
	if (typeof percent !== 'number' || Number.isNaN(percent)) {
		return 0;
	}
	return Math.max(0, Math.min(100, percent));
};

export function CurrentPlanStatus({
	title,
	description,
	isActive,
	actions,
	planSummary,
	infoTiles,
	progress,
	cancellationNotice,
	pendingSwitchNotice,
	emptyState,
	extra,
	className,
}: CurrentPlanStatusProps) {
	const resolvedEmpty = emptyState ?? defaultEmptyState;
	const tileCount = infoTiles?.length ?? 0;
    		// Stack tiles by default on small devices; at 2xl show columns
    		const tileCols = tileCount >= 3 ? '2xl:grid-cols-3' : tileCount === 2 ? '2xl:grid-cols-2' : 'grid-cols-1';
	const progressPercent = clampPercent(progress?.percent);
	const progressWidth = progressPercent > 0 ? Math.max(4, progressPercent) : 0;

	return (
		<section className={clsx('space-y-6', className)}>
			{(title || description || actions) ? (
				<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
					<div>
						{title ? <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">{title}</h2> : null}
						{description ? (
							<p className="text-sm text-slate-500 dark:text-neutral-400">{description}</p>
						) : null}
					</div>
					{actions ? <div className="shrink-0">{actions}</div> : null}
				</div>
			) : null}

			{!isActive ? (
				<>
					<div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-6 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900/50">
						{resolvedEmpty.heading ? (
							<div className="text-lg font-semibold text-slate-800 dark:text-neutral-100">{resolvedEmpty.heading}</div>
						) : null}
						{resolvedEmpty.description ? (
							<p className="mt-2 text-sm text-slate-500 dark:text-neutral-400">{resolvedEmpty.description}</p>
						) : null}
						{resolvedEmpty.action ? <div className="mt-4 flex justify-center">{resolvedEmpty.action}</div> : null}
					</div>

					{/* Show billing actions even when there is no active subscription (free users still need access) */}
					<div className="mt-4">
						<PlanBillingActions />
					</div>
				</>
			) : (
				<div className="space-y-5">
					{cancellationNotice ? (
						<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
							<div className="font-semibold text-amber-700 dark:text-amber-100">{cancellationNotice.heading}</div>
							<p className="mt-1 text-amber-700/90 dark:text-amber-200/80">{cancellationNotice.body}</p>
						</div>
					) : null}

					{pendingSwitchNotice ? (
						<div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm shadow-sm dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100">
							<div className="font-semibold text-blue-700 dark:text-blue-100">{pendingSwitchNotice.heading}</div>
							<p className="mt-1 text-blue-700/90 dark:text-blue-200/80">{pendingSwitchNotice.body}</p>
						</div>
					) : null}

					<div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
						<div className="rounded-2xl border border-purple-200/70 relative h-full overflow-hidden bg-gradient-to-br from-purple-50 via-white to-white transition-shadow hover:shadow-lg dark:border-purple-500/40 dark:from-purple-500/10 dark:via-neutral-900/60 dark:to-transparent">
							<div
								className="pointer-events-none absolute inset-0 opacity-75 bg-[radial-gradient(circle_at_top,_rgba(192,132,252,0.22),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgba(192,132,252,0.32),_transparent_60%)]"
								aria-hidden="true"
							/>
							<div className="relative z-10 space-y-6 p-6">
								<div>
									{planSummary?.eyebrow ? (
										<p className="text-xs uppercase tracking-[0.18em] text-purple-600 dark:text-purple-200">{planSummary.eyebrow}</p>
									) : null}
									{planSummary?.name ? (
										<h3 className="mt-3 text-xl font-semibold text-slate-900 dark:text-neutral-50">{planSummary.name}</h3>
									) : null}
									{planSummary?.description ? (
										<p className="mt-2 text-sm text-slate-600 dark:text-neutral-300">{planSummary.description}</p>
									) : null}
								</div>

								{tileCount > 0 ? (
									<div className={clsx('grid gap-3', tileCols)}>
										{infoTiles!.map((tile, index) => {
											const tone = tileToneClasses[tile.tone ?? 'slate'];
																const accent = tileAccentClasses[tile.tone ?? 'slate'];
											return (
												<div key={index} className={tone}>
													{tile.label ? (
																			<p className={clsx('text-xs font-semibold uppercase tracking-wide', accent)}>
															{tile.label}
														</p>
													) : null}
													{tile.value ? (
														<p className="mt-2 text-base font-semibold text-slate-900 dark:text-neutral-50">{tile.value}</p>
													) : null}
													{tile.helper ? (
														<p className="mt-1 text-[11px] text-slate-500 dark:text-neutral-400">{tile.helper}</p>
													) : null}
												</div>
											);
										})}
									</div>
								) : null}
							</div>
						</div>

									<div className="rounded-2xl border border-indigo-200/70 relative flex h-full flex-col overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-white transition-shadow hover:shadow-lg dark:border-indigo-500/40 dark:from-indigo-500/10 dark:via-neutral-900/60 dark:to-transparent">
							<div
								className="pointer-events-none absolute inset-0 opacity-75 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_60%)] dark:bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.28),_transparent_55%)]"
								aria-hidden="true"
							/>
										<div className="relative z-10 flex h-full flex-col gap-6 p-6">
											{progress?.label || progress?.dateDisplay ? (
																	<div className="flex flex-col items-start gap-2 text-indigo-600 dark:text-indigo-200 2xl:flex-row 2xl:items-center 2xl:justify-between 2xl:gap-3">
																		<span className="uppercase tracking-[0.18em] text-[11px]">{progress?.label}</span>
																		<span className="rounded-full border border-indigo-100/70 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-indigo-700 shadow-sm dark:border-white/10 dark:bg-neutral-900/40 dark:text-neutral-100">
																			{progress?.dateDisplay ?? '—'}
																		</span>
									</div>
								) : null}

								<div className="flex-1 flex flex-col justify-center space-y-4">
									<div className="h-2 w-full overflow-hidden rounded-full bg-indigo-100/70 dark:bg-neutral-800/50">
										<div
											className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-fuchsia-400 transition-all"
											style={{ width: `${progressWidth}%` }}
											aria-hidden="true"
										/>
									</div>
									{progress?.helper || progress?.secondary ? (
										<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-neutral-300">
											<span>{progress?.helper}</span>
											{progress?.secondary ? <span>{progress.secondary}</span> : null}
										</div>
									) : null}
								</div>

												{progress?.badges && progress.badges.length > 0 ? (
													  <div className="mt-auto grid gap-3 grid-cols-1 2xl:grid-cols-2">
														{progress.badges.map((badge, index) => {
															const toneKey = badge.tone ?? 'slate';
															const tone = badgeToneClasses[toneKey];
															const accent = badgeAccentClasses[toneKey];
																					const valueClass = clsx(
																						'text-slate-700 dark:text-neutral-200',
																						badge.label ? 'ml-1' : null
																					);
											return (
												<div key={index} className={tone}>
																	{badge.label ? (
																		<span className={clsx('font-semibold', accent)}>{badge.label}</span>
																	) : null}
																							{badge.value ? <span className={valueClass}>{badge.value}</span> : null}
												</div>
											);
										})}
									</div>
								) : null}
							</div>
						</div>
					</div>

					{extra}
				</div>
			)}
		</section>
	);
}

