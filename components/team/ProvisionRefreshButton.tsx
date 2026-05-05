'use client';

import { faArrowsRotate, faCircleNotch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

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
      aria-label={disabled ? 'Refreshing data' : 'Refresh data'}
      title={disabled ? 'Refreshing data' : 'Refresh data'}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 shadow-sm transition hover:border-purple-500 hover:text-purple-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200"
    >
      <FontAwesomeIcon icon={disabled ? faCircleNotch : faArrowsRotate} className={`h-3 w-3 ${disabled ? 'animate-spin' : ''}`.trim()} />
    </button>
  );
}
