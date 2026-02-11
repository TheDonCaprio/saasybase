'use client';

interface ProvisionRefreshButtonProps {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
}

export function ProvisionRefreshButton({ onRefresh, disabled }: ProvisionRefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-purple-500 hover:text-purple-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200"
    >
      {disabled ? 'Refreshing…' : 'Refresh data'}
    </button>
  );
}
