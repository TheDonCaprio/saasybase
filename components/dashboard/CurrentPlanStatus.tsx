import type { ReactNode } from 'react';
import clsx from 'clsx';
import PlanBillingActions from './PlanBillingActions';
import { AdminStatCard } from '../admin/AdminStatCard';

type TileTone = 'emerald' | 'rose' | 'violet' | 'blue' | 'amber' | 'slate' | 'indigo';

export interface PlanInfoTile {
	label: ReactNode;
	value: ReactNode;
	helper?: ReactNode;
	tone?: TileTone;
}

export interface ProgressBadge {
	label: ReactNode;
	value: ReactNode;
	tone?: 'emerald' | 'amber' | 'violet' | 'indigo' | 'slate';
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

const toPlainText = (value: ReactNode, fallback = '—') => {
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return String(value);
	return fallback;
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
	const progressTile = progress?.label || progress?.dateDisplay
		? {
			label: progress?.label,
			value: progress?.dateDisplay,
			helper: progress?.helper,
			tone: 'blue' as const,
		}
		: null;
	const allTiles = [...(infoTiles ?? []), ...(progressTile ? [progressTile] : [])];
	const tileCount = allTiles.length;
	// Use a 2-column base so cards form a 2x2 layout on mobile. If there's
	// only one tile keep it single-column. Larger breakpoints are handled
	// by `tileCols` (xl/md overrides).
	const tileBaseCols = tileCount === 1 ? 'grid-cols-1' : 'grid-cols-2';
	const tileCols = tileCount >= 4 ? 'xl:grid-cols-4' : tileCount === 3 ? 'xl:grid-cols-3' : '';

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
					<div className="rounded-2xl border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] bg-[color:rgb(var(--bg-secondary-rgb)_/_calc(var(--bg-secondary-a)*0.65))] p-6 text-center shadow-sm backdrop-blur-sm dark:bg-[color:rgb(var(--bg-secondary-rgb)_/_calc(var(--bg-secondary-a)*0.45))]">
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
						<div className="rounded-2xl border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] bg-[color:rgb(var(--bg-secondary))] p-4 text-sm shadow-sm backdrop-blur-sm">
							<div className="font-semibold text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.90))] dark:text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.95))]">{cancellationNotice.heading}</div>
							<p className="mt-1 text-[color:rgb(var(--text-secondary))]">{cancellationNotice.body}</p>
						</div>
					) : null}

					{pendingSwitchNotice ? (
						<div className="rounded-2xl border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] bg-[color:rgb(var(--bg-secondary))] p-4 text-sm shadow-sm backdrop-blur-sm">
							<div className="font-semibold text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.90))] dark:text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.95))]">{pendingSwitchNotice.heading}</div>
							<p className="mt-1 text-[color:rgb(var(--text-secondary))]">{pendingSwitchNotice.body}</p>
						</div>
					) : null}

					<div className="space-y-4">
						{planSummary?.eyebrow || planSummary?.name || planSummary?.description ? (
							<div>
								{planSummary?.eyebrow ? (
									<p className="text-xs uppercase tracking-[0.18em] text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.82))] dark:text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.90))]">{planSummary.eyebrow}</p>
								) : null}
								{planSummary?.name ? (
									<h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-neutral-50">{planSummary.name}</h3>
								) : null}
								{planSummary?.description ? (
									<p className="mt-2 text-sm text-slate-600 dark:text-neutral-300">{planSummary.description}</p>
								) : null}
							</div>
						) : null}

						{tileCount > 0 ? (
							<div className={clsx('grid gap-3', tileBaseCols, tileCols)}>
								{allTiles.map((tile, index) => {
									return (
										<AdminStatCard
											key={index}
											label={toPlainText(tile.label, '')}
											value={toPlainText(tile.value)}
											helper={typeof tile.helper === 'string' ? tile.helper : undefined}
											accent="theme"
											size="compact"
											className="h-full"
										/>
									);
								})}
									</div>
						) : null}
					</div>

					{extra}
				</div>
			)}
		</section>
	);
}

