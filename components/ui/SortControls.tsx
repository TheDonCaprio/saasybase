import React from 'react';

type SortOrder = 'asc' | 'desc';

export interface SortOption<T extends string = string> {
  value: T;
  label: string;
}

interface SortControlsProps<T extends string = string> {
  options: SortOption<T>[];
  sortBy?: T;
  onSortByChange?: (v: T) => void;
  sortOrder?: SortOrder;
  onSortOrderChange?: (o: SortOrder) => void;
  // compact mode is used for mobile panel styling
  compact?: boolean;
}

export default function SortControls<T extends string = string>({
  options,
  sortBy,
  onSortByChange,
  sortOrder = 'desc',
  onSortOrderChange,
  compact = false
}: SortControlsProps<T>) {
  return (
    <div className={compact ? 'flex items-center gap-2 w-full' : 'flex items-center gap-2'}>
      {onSortByChange && (
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => onSortByChange && onSortByChange(e.target.value as T)}
            className={
              compact
                ? 'flex-1 appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-xs text-slate-700 shadow-sm transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/70 hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:focus:border-blue-500'
                : 'appearance-none rounded-lg border border-slate-200 bg-white/90 px-4 py-2.5 pr-10 text-sm text-slate-700 shadow-sm transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/70 hover:bg-white hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:bg-neutral-900 dark:focus:border-blue-500'
            }
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className={`absolute right-0 top-0 flex h-full items-center pr-2 pointer-events-none ${compact ? 'pr-2' : 'pr-3'}`}>
            <svg 
              className={`text-slate-400 dark:text-neutral-500 ${compact ? 'w-3 h-3' : 'w-4 h-4'}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      )}

      {onSortOrderChange && (
        <button
          onClick={() => onSortOrderChange(sortOrder === 'desc' ? 'asc' : 'desc')}
          className={
            compact
              ? 'inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/70 hover:bg-slate-50 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:focus:border-blue-500'
              : 'inline-flex items-center rounded-lg border border-slate-200 bg-white/90 px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/70 hover:bg-white hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:bg-neutral-900 dark:focus:border-blue-500'
          }
          title={`Sort ${sortOrder === 'desc' ? 'Ascending' : 'Descending'}`}
        >
          {sortOrder === 'desc' ? (
            <svg className={compact ? 'w-3 h-3' : 'w-4 h-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M6 12h12" />
              <path d="M9 18h6" />
            </svg>
          ) : (
            <svg className={compact ? 'w-3 h-3' : 'w-4 h-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6h6" />
              <path d="M6 12h12" />
              <path d="M3 18h18" />
            </svg>
          )}
          <span className={compact ? 'ml-1 text-[10px] uppercase' : 'ml-1 text-[11px]'}>{sortOrder}</span>
        </button>
      )}
    </div>
  );
}
