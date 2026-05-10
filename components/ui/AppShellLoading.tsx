import clsx from 'clsx';

type AppShellLoadingProps = {
	section: 'Admin' | 'Dashboard';
	showSidebarLabel?: boolean;
};

export function AppShellLoading({ section, showSidebarLabel = true }: AppShellLoadingProps) {
	return (
		<div className="min-h-screen w-full overflow-x-clip lg:flex lg:gap-3">
			<div className="hidden w-64 flex-shrink-0 lg:block" />

			<aside className="theme-shadow-sidebar hidden h-screen w-64 flex-col border-r border-[color:var(--theme-sidebar-border)] bg-[color:var(--theme-sidebar-bg)] lg:fixed lg:left-0 lg:top-0 lg:flex lg:z-30">
				<div className="h-16 flex-shrink-0" />
				<div className="flex flex-1 flex-col space-y-4 overflow-y-auto px-4 pt-4">
					{showSidebarLabel ? (
						<div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{section}</div>
					) : null}
					<div className="space-y-2.5">
						{Array.from({ length: 8 }).map((_, index) => (
							<div
								key={index}
								className={clsx(
									'h-10 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-neutral-800/60',
									index > 4 ? 'w-10/12' : 'w-full',
								)}
							/>
						))}
					</div>
				</div>
				<div className="mt-auto p-4">
					<div className="h-16 animate-pulse rounded-3xl bg-slate-200/70 dark:bg-neutral-800/60" />
				</div>
			</aside>

			<main className="relative flex-1 min-w-0 w-full max-w-none px-3 py-3 sm:px-4 lg:px-4 lg:py-3">
				<div className="relative space-y-6 w-full">
					<div className="rounded-[28px] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.5))] bg-[linear-gradient(135deg,rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.85)),rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.78))),linear-gradient(140deg,var(--theme-card-gradient-from),var(--theme-card-gradient-via),var(--theme-card-gradient-to))] p-5 shadow-sm backdrop-blur-sm sm:p-6">
						<div className="h-5 w-28 animate-pulse rounded-full bg-slate-200/70 dark:bg-neutral-800/60" />
						<div className="mt-4 h-10 w-64 max-w-full animate-pulse rounded-2xl bg-slate-200/80 dark:bg-neutral-800/70" />
						<div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded-full bg-slate-200/65 dark:bg-neutral-800/55" />
						<div className="mt-2 h-4 w-10/12 max-w-xl animate-pulse rounded-full bg-slate-200/55 dark:bg-neutral-800/45" />
						<div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
							{Array.from({ length: 4 }).map((_, index) => (
								<div
									key={index}
									className="rounded-[24px] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.45))] bg-white/60 p-4 dark:bg-neutral-950/35"
								>
									<div className="h-4 w-20 animate-pulse rounded-full bg-slate-200/70 dark:bg-neutral-800/60" />
									<div className="mt-4 h-8 w-24 animate-pulse rounded-2xl bg-slate-200/80 dark:bg-neutral-800/70" />
									<div className="mt-3 h-3 w-16 animate-pulse rounded-full bg-slate-200/60 dark:bg-neutral-800/50" />
								</div>
							))}
						</div>
					</div>

					<div className="rounded-[28px] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.5))] bg-[color:rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.78))] p-4 shadow-sm backdrop-blur-sm sm:p-5">
						<div className="space-y-3">
							{Array.from({ length: 6 }).map((_, index) => (
								<div
									key={index}
									className="h-14 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-neutral-800/60"
								/>
							))}
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}