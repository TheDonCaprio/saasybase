import clsx from 'clsx';

type AppShellLoadingProps = {
	section: 'Admin' | 'Dashboard';
	showSidebarLabel?: boolean;
};

export function AppShellLoading({ section, showSidebarLabel = true }: AppShellLoadingProps) {
	return (
		<div className="relative w-full space-y-6">
			<div className="rounded-[24px] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.5))] bg-[linear-gradient(135deg,rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.85)),rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.78))),linear-gradient(140deg,var(--theme-card-gradient-from),var(--theme-card-gradient-via),var(--theme-card-gradient-to))] p-3 shadow-sm backdrop-blur-sm sm:p-4 lg:p-6">
				{showSidebarLabel ? (
					<div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{section}</div>
				) : null}
				<div className={clsx('h-10 max-w-full animate-pulse rounded-2xl bg-slate-200/80 dark:bg-neutral-800/70', showSidebarLabel ? 'mt-4 w-64' : 'w-72')} />
				<div className="mt-3 h-4 w-full animate-pulse rounded-full bg-slate-200/65 dark:bg-neutral-800/55" />
				<div className="mt-2 h-4 w-11/12 animate-pulse rounded-full bg-slate-200/55 dark:bg-neutral-800/45 sm:w-10/12" />
				<div className="mt-5 grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
					{Array.from({ length: 4 }).map((_, index) => (
						<div
							key={index}
							className="min-w-0 rounded-[22px] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.45))] bg-white/60 p-3 dark:bg-neutral-950/35 sm:p-4"
						>
							<div className="h-4 w-20 animate-pulse rounded-full bg-slate-200/70 dark:bg-neutral-800/60" />
							<div className="mt-4 h-8 w-24 animate-pulse rounded-2xl bg-slate-200/80 dark:bg-neutral-800/70" />
							<div className="mt-3 h-3 w-16 animate-pulse rounded-full bg-slate-200/60 dark:bg-neutral-800/50" />
						</div>
					))}
				</div>
			</div>

			<div className="rounded-[24px] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.5))] bg-[color:rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.78))] p-3 shadow-sm backdrop-blur-sm sm:p-4 lg:p-5">
				<div className="space-y-3">
					{Array.from({ length: 6 }).map((_, index) => (
						<div
							key={index}
							className="h-14 w-full animate-pulse rounded-2xl bg-slate-200/70 dark:bg-neutral-800/60"
						/>
					))}
				</div>
			</div>
		</div>
	);
}