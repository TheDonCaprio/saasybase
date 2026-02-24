import type { ReactNode } from 'react';
import clsx from 'clsx';
import PlanBillingActions from './PlanBillingActions';

type TileTone = 'emerald' | 'rose' | 'violet' | 'blue' | 'amber' | 'slate' | 'indigo';
type BadgeTone = 'emerald' | 'amber' | 'violet' | 'indigo' | 'slate';

const THEME_TILE_CLASS =
	'rounded-xl border border-[color:rgb(var(--border-primary)_/_0.7)] bg-[color:rgb(var(--bg-secondary))] p-3 2xl:p-4 text-[11px] 2xl:text-xs text-slate-700 shadow-sm backdrop-blur-sm transition hover:shadow-md dark:text-neutral-100';

const THEME_BADGE_CLASS =
	'rounded-xl border border-[color:rgb(var(--border-primary)_/_0.7)] bg-[color:rgb(var(--bg-secondary))] p-2 2xl:p-3 text-[10px] 2xl:text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm dark:text-neutral-100';

const tileToneClasses: Record<TileTone, string> = {
	emerald: THEME_TILE_CLASS,
	rose: THEME_TILE_CLASS,
	violet: THEME_TILE_CLASS,
	blue: THEME_TILE_CLASS,
	amber: THEME_TILE_CLASS,
	slate: THEME_TILE_CLASS,
	indigo: THEME_TILE_CLASS,
};

const tileAccentClasses: Record<TileTone, string> = {
	emerald: 'text-[color:rgb(var(--accent-primary)_/_0.82)] dark:text-[color:rgb(var(--accent-primary)_/_0.88)]',
	rose: 'text-[color:rgb(var(--accent-primary)_/_0.82)] dark:text-[color:rgb(var(--accent-primary)_/_0.88)]',
	violet: 'text-[color:rgb(var(--accent-primary)_/_0.82)] dark:text-[color:rgb(var(--accent-primary)_/_0.88)]',
	blue: 'text-[color:rgb(var(--accent-primary)_/_0.82)] dark:text-[color:rgb(var(--accent-primary)_/_0.88)]',
	amber: 'text-[color:rgb(var(--accent-primary)_/_0.82)] dark:text-[color:rgb(var(--accent-primary)_/_0.88)]',
	slate: 'text-slate-500 dark:text-neutral-400',
	indigo: 'text-[color:rgb(var(--accent-primary)_/_0.82)] dark:text-[color:rgb(var(--accent-primary)_/_0.88)]',
};

const badgeToneClasses: Record<BadgeTone, string> = {
	emerald: THEME_BADGE_CLASS,
	amber: THEME_BADGE_CLASS,
	violet: THEME_BADGE_CLASS,
	indigo: THEME_BADGE_CLASS,
	slate: THEME_BADGE_CLASS,
};

const badgeAccentClasses: Record<BadgeTone, string> = {
	emerald: 'text-[color:rgb(var(--accent-primary)_/_0.82)] dark:text-[color:rgb(var(--accent-primary)_/_0.88)]',
	amber: 'text-[color:rgb(var(--accent-primary)_/_0.82)] dark:text-[color:rgb(var(--accent-primary)_/_0.88)]',
	violet: 'text-[color:rgb(var(--accent-primary)_/_0.82)] dark:text-[color:rgb(var(--accent-primary)_/_0.88)]',
	indigo: 'text-[color:rgb(var(--accent-primary)_/_0.82)] dark:text-[color:rgb(var(--accent-primary)_/_0.88)]',
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
					<div className="rounded-2xl border border-[color:rgb(var(--border-primary)_/_0.7)] bg-[color:rgb(var(--bg-secondary)_/_0.65)] p-6 text-center shadow-sm backdrop-blur-sm dark:bg-[color:rgb(var(--bg-secondary)_/_0.45)]">
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
						<div className="rounded-2xl border border-[color:rgb(var(--border-primary)_/_0.7)] bg-[color:rgb(var(--bg-secondary))] p-4 text-sm shadow-sm backdrop-blur-sm">
							<div className="font-semibold text-[color:rgb(var(--accent-primary)_/_0.90)] dark:text-[color:rgb(var(--accent-primary)_/_0.95)]">{cancellationNotice.heading}</div>
							<p className="mt-1 text-[color:rgb(var(--text-secondary))]">{cancellationNotice.body}</p>
						</div>
					) : null}

					{pendingSwitchNotice ? (
						<div className="rounded-2xl border border-[color:rgb(var(--border-primary)_/_0.7)] bg-[color:rgb(var(--bg-secondary))] p-4 text-sm shadow-sm backdrop-blur-sm">
							<div className="font-semibold text-[color:rgb(var(--accent-primary)_/_0.90)] dark:text-[color:rgb(var(--accent-primary)_/_0.95)]">{pendingSwitchNotice.heading}</div>
							<p className="mt-1 text-[color:rgb(var(--text-secondary))]">{pendingSwitchNotice.body}</p>
						</div>
					) : null}

					<div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
						<div className="rounded-2xl border border-[color:rgb(var(--accent-primary)_/_0.20)] relative h-full overflow-hidden bg-[linear-gradient(135deg,var(--theme-page-gradient-from),var(--theme-page-gradient-via),var(--theme-page-gradient-to))] transition-shadow hover:shadow-lg dark:border-[color:rgb(var(--accent-primary)_/_0.32)]">
							<div
								className="pointer-events-none absolute inset-0 opacity-75 bg-[radial-gradient(circle_at_top,_rgb(var(--accent-primary)_/_0.18),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgb(var(--accent-primary)_/_0.28),_transparent_60%)]"
								aria-hidden="true"
							/>
							<div className="relative z-10 space-y-6 p-6">
								<div>
									{planSummary?.eyebrow ? (
										<p className="text-xs uppercase tracking-[0.18em] text-[color:rgb(var(--accent-primary)_/_0.82)] dark:text-[color:rgb(var(--accent-primary)_/_0.90)]">{planSummary.eyebrow}</p>
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
													<div className="flex items-baseline justify-between gap-2 2xl:block">
														{tile.label ? (
															<p className={clsx('text-[12px] 2xl:text-[10px] font-semibold uppercase tracking-wide', accent)}>
																{tile.label}
															</p>
														) : null}
														{tile.value ? (
															<p className="text-sm 2xl:text-base font-semibold text-slate-900 dark:text-neutral-50">{tile.value}</p>
														) : null}
													</div>
													{tile.helper ? (
														<p className="mt-1 text-[10px] text-slate-500 dark:text-neutral-400">{tile.helper}</p>
													) : null}
												</div>
											);
										})}
									</div>
								) : null}
							</div>
						</div>

									<div className="rounded-2xl border border-[color:rgb(var(--accent-primary)_/_0.20)] relative flex h-full flex-col overflow-hidden bg-[linear-gradient(135deg,var(--theme-page-gradient-from),var(--theme-page-gradient-via),var(--theme-page-gradient-to))] transition-shadow hover:shadow-lg dark:border-[color:rgb(var(--accent-primary)_/_0.32)]">
							<div
											className="pointer-events-none absolute inset-0 opacity-75 bg-[radial-gradient(circle_at_top,_rgb(var(--accent-primary)_/_0.16),_transparent_60%)] dark:bg-[radial-gradient(circle_at_top,_rgb(var(--accent-primary)_/_0.26),_transparent_55%)]"
								aria-hidden="true"
							/>
										<div className="relative z-10 flex h-full flex-col gap-6 p-6">
											{progress?.label || progress?.dateDisplay ? (
												<div className="flex flex-col items-start gap-2 text-[color:rgb(var(--accent-primary)_/_0.82)] dark:text-[color:rgb(var(--accent-primary)_/_0.90)] 2xl:flex-row 2xl:items-center 2xl:justify-between 2xl:gap-3">
																		<span className="uppercase tracking-[0.18em] text-[11px]">{progress?.label}</span>
													<span className="rounded-full border border-[color:rgb(var(--border-primary)_/_0.7)] bg-[color:rgb(var(--bg-secondary)_/_0.65)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-800 shadow-sm backdrop-blur-sm dark:bg-[color:rgb(var(--bg-secondary)_/_0.45)] dark:text-neutral-100">
																			{progress?.dateDisplay ?? '—'}
																		</span>
									</div>
								) : null}

								<div className="flex-1 flex flex-col justify-center space-y-4">
									<div className="h-2 w-full overflow-hidden rounded-full bg-[color:rgb(var(--border-primary)_/_0.30)] dark:bg-[color:rgb(var(--border-primary)_/_0.18)]">
										<div
											className="h-full rounded-full bg-[linear-gradient(90deg,_rgb(var(--accent-primary)_/_0.95),_rgb(var(--accent-primary)_/_0.55))] transition-all"
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

