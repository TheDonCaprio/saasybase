import React, { type ReactNode, useState } from 'react';
import { formatDisplayYMD } from '../../utils/formatDisplayDate';
import SortControls, { type SortOption } from './SortControls';

type DatePreset = 'ALL'|'TODAY'|'YESTERDAY'|'LAST_7'|'LAST_MONTH'|'THIS_MONTH'|'THIS_QUARTER'|'THIS_YEAR'|'CUSTOM';

interface ListFiltersProps<T extends string = string> {
  search: string;
  onSearchChange: (v: string) => void;
  statusOptions?: string[];
  currentStatus?: string;
  onStatusChange?: (s: string) => void;
  onRefresh?: () => void;
  placeholder?: string;
  additionalButton?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
  };
  trailingContent?: ReactNode;
  statusTotals?: Record<string, number>;
  // Sort controls
  sortOptions?: SortOption<T>[];
  sortBy?: T;
  onSortByChange?: (sortBy: T) => void;
  sortOrder?: 'asc' | 'desc';
  onSortOrderChange?: (sortOrder: 'asc' | 'desc') => void;
  // Date filters (presets + custom)
  datePreset?: DatePreset;
  startDate?: string | null;
  endDate?: string | null;
  onDatePresetChange?: (preset: DatePreset) => void;
  onStartDateChange?: (d: string | null) => void;
  onEndDateChange?: (d: string | null) => void;
  // Optional extra optgroups to render (label + list of status keys). Useful for domain-specific groups
  extraOptgroups?: Array<{ label: string; items: string[] }>;
  secondaryOptions?: string[];
  currentSecondary?: string;
  onSecondaryChange?: (value: string) => void;
  secondaryLabel?: string;
  secondaryAllLabel?: string;
  secondaryTotals?: Record<string, number>;
  secondaryExtraOptgroups?: Array<{ label: string; items: string[] }>;
  desktopInlineBreakpoint?: '1025' | '1280';
}

export function ListFilters<T extends string = string>({
  search,
  onSearchChange,
  statusOptions = [],
  currentStatus = 'ALL',
  onStatusChange,
  onRefresh,
  placeholder = 'Search...',
  additionalButton,
  trailingContent,
  statusTotals,
  sortOptions = [
    { value: 'publishedAt' as T, label: 'Published Date' },
    { value: 'updatedAt' as T, label: 'Updated Date' },
    { value: 'createdAt' as T, label: 'Created Date' }
  ],
  sortBy,
  onSortByChange,
  sortOrder = 'desc',
  onSortOrderChange,
  datePreset = 'ALL',
  startDate = null,
  endDate = null,
  onDatePresetChange,
  onStartDateChange,
  onEndDateChange
  ,
  extraOptgroups = [],
  secondaryOptions = [],
  currentSecondary = 'ALL',
  onSecondaryChange,
  secondaryLabel = 'Category',
  secondaryAllLabel,
  secondaryTotals,
  secondaryExtraOptgroups = [],
  desktopInlineBreakpoint = '1025'
}: ListFiltersProps<T>) {
  const [showFilters, setShowFilters] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempStart, setTempStart] = useState<string | null>(startDate ?? null);
  const [tempEnd, setTempEnd] = useState<string | null>(endDate ?? null);
  const [prevPreset, setPrevPreset] = useState<DatePreset>(datePreset);

  const desktopRowClass =
    desktopInlineBreakpoint === '1280'
      ? 'xl:flex-row xl:items-center xl:gap-4'
      : 'min-[1025px]:flex-row min-[1025px]:items-center min-[1025px]:gap-4';
  const desktopSearchWidthClass = desktopInlineBreakpoint === '1280' ? 'xl:max-w-md' : 'min-[1025px]:max-w-md';
  const desktopFlexClass = desktopInlineBreakpoint === '1280' ? 'hidden xl:flex' : 'hidden min-[1025px]:flex';
  const compactOnlyClass = desktopInlineBreakpoint === '1280' ? 'xl:hidden' : 'min-[1025px]:hidden';
  const desktopTrailingClass = desktopInlineBreakpoint === '1280' ? 'xl:ml-auto' : 'min-[1025px]:ml-auto';
  const desktopBlockClass = desktopInlineBreakpoint === '1280' ? 'hidden xl:block' : 'hidden min-[1025px]:block';
  const desktopInlineButtonClass = desktopInlineBreakpoint === '1280' ? 'hidden xl:inline-flex' : 'hidden min-[1025px]:inline-flex';

  // Explicit groups and label mapping to ensure consistent ordering and counts
  const STATUS_GROUP = ['SUCCEEDED', 'PENDING', 'FAILED', 'REFUNDED', 'PUBLISHED', 'UNPUBLISHED', 'DRAFT', 'SYSTEM', 'TRASHED'];
  const ACCESS_GROUP = ['ACTIVE', 'EXPIRED', 'CANCELLED', 'SCHEDULED_CANCEL', 'SCHEDULED', 'INACTIVE'];
  const TYPE_GROUP = ['PAID', 'FREE', 'ONE_TIME', 'AUTO_RENEW'];
  const ROLE_GROUP = ['USER', 'MODERATOR', 'ADMIN'];
  const LOG_LEVEL_GROUP = ['ERROR', 'WARN'];

  const displayLabelFor = (code: string) => {
    if (code === 'USER') return 'User';
    if (code === 'MODERATOR') return 'Moderator';
    if (code === 'ADMIN') return 'Admin';
    if (code === 'PAID') return 'Paid';
    if (code === 'FREE') return 'Free';
    if (code === 'ONE_TIME') return 'One-time';
    if (code === 'AUTO_RENEW') return 'Auto renew';
    if (code === 'SUCCEEDED') return 'Succeeded';
    if (code === 'PENDING') return 'Pending';
    if (code === 'FAILED') return 'Failed';
    if (code === 'REFUNDED') return 'Refunded';
    if (code === 'ACTIVE') return 'Active';
    if (code === 'INACTIVE') return 'Inactive';
    if (code === 'EXPIRED') return 'Expired';
    if (code === 'CANCELLED') return 'Cancelled';
    if (code === 'SCHEDULED_CANCEL') return 'Scheduled cancel';
    if (code === 'SCHEDULED') return 'Scheduled';
    if (code === 'PUBLISHED') return 'Published';
    if (code === 'UNPUBLISHED') return 'Unpublished';
    if (code === 'DRAFT') return 'Draft';
    if (code === 'SYSTEM') return 'System';
    if (code === 'TRASHED') return 'Trashed';
    if (code === 'ERROR') return 'Error';
    if (code === 'WARN') return 'Warn';
    // Notification types
    if (code === 'GENERAL') return 'General';
    if (code === 'BILLING') return 'Billing';
    if (code === 'SUPPORT') return 'Support';
    if (code === 'ACCOUNT') return 'Account';
    if (code === 'TECHNICAL_SUPPORT') return 'Technical support';
    if (code === 'PRE_SALE') return 'Pre-sale';
    if (code === 'FEATURE_REQUEST') return 'Feature request';
    // Fallback: prettify
    return code.split('_').map(p => p.charAt(0) + p.slice(1).toLowerCase()).join(' ');
  };

  const countFor = (code: string) => {
    const label = displayLabelFor(code);
    // Some pages use a slightly different key for scheduled cancel ('Scheduled Cancel')
    if (code === 'SCHEDULED_CANCEL') {
      return statusTotals?.['Scheduled Cancel'] ?? statusTotals?.[label];
    }
    return statusTotals?.[label];
  };

  const countForSecondary = (code: string) => {
    const label = displayLabelFor(code);
    return secondaryTotals?.[label];
  };

  const resolvedSecondaryAllLabel = secondaryAllLabel ?? `All ${secondaryLabel.toLowerCase()}s`;

  return (
    <>
    <div className={`flex flex-col gap-3 ${desktopRowClass}`}>
      <div className={`relative w-full ${desktopSearchWidthClass}`}>
        <input
          suppressHydrationWarning
          type="text"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-lg sm:rounded-full border border-slate-200 bg-white/80 px-4 py-3 pr-11 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/70 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-100 dark:placeholder:text-neutral-400"
        />
        {search.trim().length > 0 ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearchChange('')}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              ×
            </button>
          </div>
        ) : null}
      </div>

      {/* Desktop sort controls */}
      {(onSortByChange || onSortOrderChange) && (
        <div className={`${desktopFlexClass} items-center gap-2`}>
          <SortControls
            options={sortOptions}
            sortBy={sortBy}
            onSortByChange={onSortByChange}
            sortOrder={sortOrder}
            onSortOrderChange={onSortOrderChange}
          />
          {/* Date presets inline for desktop */}
              {onDatePresetChange && (
            <div className="ml-2">
            <select
              suppressHydrationWarning
              value={datePreset}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'CUSTOM') {
                  setPrevPreset(datePreset as DatePreset);
                  setTempStart(startDate ?? null);
                  setTempEnd(endDate ?? null);
                  setShowDateModal(true);
                } else {
                  onDatePresetChange?.(v as DatePreset);
                }
              }}
              className="appearance-none rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/70 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200"
            >
              <option value="ALL">All dates</option>
              <option value="TODAY">Today</option>
              <option value="YESTERDAY">Yesterday</option>
              <option value="LAST_7">Last 7 days</option>
              <option value="LAST_MONTH">Last month</option>
              <option value="THIS_MONTH">This month</option>
              <option value="THIS_QUARTER">This quarter</option>
              <option value="THIS_YEAR">This year</option>
              <option value="CUSTOM">Custom...</option>
            </select>
            </div>
          )}
          
        </div>
      )}

      {/** Desktop: show status dropdown inline; Tablet+Mobile: show a compact Filters button that toggles a panel */}
      {statusOptions.length > 0 && onStatusChange && (
        <>
          <div className={`${desktopFlexClass} items-center gap-2`}>
            <div className="relative">
              <select
                suppressHydrationWarning
                value={currentStatus}
                onChange={(e) => onStatusChange?.(e.target.value)}
                className="appearance-none rounded-lg border border-slate-200 bg-white/90 px-4 py-2.5 pr-10 text-sm text-slate-700 shadow-sm transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/70 hover:bg-white hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:bg-neutral-900 dark:focus:border-blue-500"
              >
                {/* All option */}
                {statusOptions.includes('ALL') && (
                  <option key="ALL" value="ALL">
                    All{typeof statusTotals?.['All'] === 'number' ? ` (${statusTotals['All']})` : ''}
                  </option>
                )}

                {/* Build groups and only render non-empty ones to avoid empty headings */}
                  {(() => {
                  const roleItems = ROLE_GROUP.filter((s) => statusOptions.includes(s));
                  const typeItems = TYPE_GROUP.filter((s) => statusOptions.includes(s));
                  const statusItems = STATUS_GROUP.filter((s) => statusOptions.includes(s));
                  const accessItems = ACCESS_GROUP.filter((s) => statusOptions.includes(s));
                  const logLevelItems = LOG_LEVEL_GROUP.filter((s) => statusOptions.includes(s));
                  // Compute any extra optgroups passed in (only include items that are present in statusOptions)
                  const extraGroups = (extraOptgroups || []).map((g) => ({ label: g.label, items: g.items.filter((s) => statusOptions.includes(s)) })).filter((g) => g.items.length > 0);
                  const otherItems = statusOptions.filter(
                    (s) => s !== 'ALL' && !ROLE_GROUP.includes(s) && !TYPE_GROUP.includes(s) && !STATUS_GROUP.includes(s) && !ACCESS_GROUP.includes(s) && !LOG_LEVEL_GROUP.includes(s) && !extraGroups.some(g => g.items.includes(s))
                  );

                  return (
                    <>
                          {roleItems.length > 0 && (
                            <optgroup label="Roles">
                              {roleItems.map((s) => (
                                <option key={s} value={s}>
                                  {displayLabelFor(s)}{typeof countFor(s) === 'number' ? ` (${countFor(s)})` : ''}
                                </option>
                              ))}
                            </optgroup>
                          )}

                          {typeItems.length > 0 && (
                            <optgroup label="Type">
                              {typeItems.map((s) => (
                                <option key={s} value={s}>
                                  {displayLabelFor(s)}{typeof countFor(s) === 'number' ? ` (${countFor(s)})` : ''}
                                </option>
                              ))}
                            </optgroup>
                          )}

                          {statusItems.length > 0 && (
                            <optgroup label="Status">
                              {statusItems.map((s) => (
                                <option key={s} value={s}>
                                  {displayLabelFor(s)}{typeof countFor(s) === 'number' ? ` (${countFor(s)})` : ''}
                                </option>
                              ))}
                            </optgroup>
                          )}

                          {accessItems.length > 0 && (
                            <optgroup label="Access">
                              {accessItems.map((s) => (
                                <option key={s} value={s}>
                                  {displayLabelFor(s)}{typeof countFor(s) === 'number' ? ` (${countFor(s)})` : ''}
                                </option>
                              ))}
                            </optgroup>
                          )}

                          {extraGroups.length > 0 && extraGroups.map((g) => (
                            <optgroup key={`extra-${g.label}`} label={g.label}>
                              {g.items.map((s) => (
                                <option key={s} value={s}>
                                  {displayLabelFor(s)}{typeof countFor(s) === 'number' ? ` (${countFor(s)})` : ''}
                                </option>
                              ))}
                            </optgroup>
                          ))}

                          {logLevelItems.length > 0 && (
                            <optgroup label="Log Level">
                              {logLevelItems.map((s) => (
                                <option key={s} value={s}>
                                  {displayLabelFor(s)}{typeof countFor(s) === 'number' ? ` (${countFor(s)})` : ''}
                                </option>
                              ))}
                            </optgroup>
                          )}

                          {otherItems.length > 0 && (
                        <optgroup label="Other">
                          {otherItems.map((s) => (
                            <option key={s} value={s}>
                              {displayLabelFor(s)}{typeof countFor(s) === 'number' ? ` (${countFor(s)})` : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </>
                  );
                })()}
              </select>
              <div className="absolute right-0 top-0 flex h-full items-center pr-3 pointer-events-none">
                <svg 
                  className="w-4 h-4 text-slate-400 dark:text-neutral-500" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            {secondaryOptions.length > 0 && onSecondaryChange && (
              <div className="relative">
                <select
                  suppressHydrationWarning
                  value={currentSecondary}
                  onChange={(e) => onSecondaryChange(e.target.value)}
                  className="appearance-none rounded-lg border border-slate-200 bg-white/90 px-4 py-2.5 pr-10 text-sm text-slate-700 shadow-sm transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/70 hover:bg-white hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:bg-neutral-900 dark:focus:border-blue-500"
                >
                  {secondaryOptions.includes('ALL') && (
                    <option key="secondary-ALL" value="ALL">
                      {resolvedSecondaryAllLabel}{typeof secondaryTotals?.All === 'number' ? ` (${secondaryTotals.All})` : ''}
                    </option>
                  )}
                  {(() => {
                    const extraGroups = (secondaryExtraOptgroups || [])
                      .map((group) => ({ label: group.label, items: group.items.filter((item) => secondaryOptions.includes(item)) }))
                      .filter((group) => group.items.length > 0);
                    const otherItems = secondaryOptions.filter((item) => item !== 'ALL' && !extraGroups.some((group) => group.items.includes(item)));

                    return (
                      <>
                        {extraGroups.map((group) => (
                          <optgroup key={`secondary-${group.label}`} label={group.label}>
                            {group.items.map((item) => (
                              <option key={`secondary-${item}`} value={item}>
                                {displayLabelFor(item)}{typeof countForSecondary(item) === 'number' ? ` (${countForSecondary(item)})` : ''}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        {otherItems.length > 0 && (
                          <optgroup label={secondaryLabel}>
                            {otherItems.map((item) => (
                              <option key={`secondary-other-${item}`} value={item}>
                                {displayLabelFor(item)}{typeof countForSecondary(item) === 'number' ? ` (${countForSecondary(item)})` : ''}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </>
                    );
                  })()}
                </select>
                <div className="absolute right-0 top-0 flex h-full items-center pr-3 pointer-events-none">
                  <svg 
                    className="w-4 h-4 text-slate-400 dark:text-neutral-500" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* Compact filters toggle + refresh placed on same row for widths < 1025px */}
          <div className={`flex items-center gap-2 ${compactOnlyClass}`}>
            <button
              onClick={() => setShowFilters((s) => !s)}
              aria-expanded={showFilters}
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border border-slate-200 bg-white/70 text-slate-600 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-200 uppercase"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 5h18" />
                <path d="M6 12h12" />
                <path d="M10 19h4" />
              </svg>
              <span className="ml-2">Filters</span>
            </button>
            {additionalButton && (
              <button
                onClick={additionalButton.onClick}
                disabled={additionalButton.disabled}
                className={additionalButton.className ?? `inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-white hover:text-slate-800 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-200 ${additionalButton.disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                title={additionalButton.label}
              >
                <span className="hidden sm:inline">{additionalButton.label}</span>
                <span className="sm:hidden text-[13px]">{additionalButton.label}</span>
              </button>
            )}
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition transform hover:shadow-md hover:bg-slate-100 hover:text-slate-800 active:scale-95 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-200 dark:hover:bg-neutral-900"
                title="Refresh"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0114.13-3.36L23 10" />
                  <path d="M20.49 15a9 9 0 01-14.13 3.36L1 14" />
                </svg>
                <span className="tracking-wide text-xs">Refresh</span>
              </button>
            )}
            {/* render trailing content inline on mobile so extra actions (like MarkAllRead) appear on same row */}
            {trailingContent && (
              <div className="ml-2">
                {/* ensure trailing content maintains its own responsive visibility */}
                {trailingContent}
              </div>
            )}
          </div>

          {showFilters && (
            <div className={`${compactOnlyClass} mt-2 rounded-lg border border-slate-200 bg-white/90 p-3 dark:border-neutral-700 dark:bg-neutral-900/50`}>
              {/* Mobile filter controls - side by side layout */}
              <div className="flex flex-col gap-3">
                {/* Sort and Status filters in same row */}
                <div className="flex gap-2">
                  {/* Sort dropdown */}
                  {onSortByChange && (
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-600 dark:text-neutral-300 mb-1">Sort by:</label>
                      <div className="relative">
                        <select
                          suppressHydrationWarning
                          value={sortBy}
                          onChange={(e) => onSortByChange && onSortByChange(e.target.value as T)}
                          className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-xs text-slate-700 shadow-sm transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/70 hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:focus:border-blue-500"
                        >
                          {sortOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-0 top-0 flex h-full items-center pr-2 pointer-events-none">
                          <svg 
                            className="w-3 h-3 text-slate-400 dark:text-neutral-500" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sort order button */}
                  {onSortOrderChange && (
                    <div className="flex flex-col">
                      <label className="block text-xs font-medium text-slate-600 dark:text-neutral-300 mb-1">Order:</label>
                      <button
                        onClick={() => onSortOrderChange(sortOrder === 'desc' ? 'asc' : 'desc')}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/70 hover:bg-slate-50 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:focus:border-blue-500"
                        title={`Sort ${sortOrder === 'desc' ? 'Ascending' : 'Descending'}`}
                      >
                        {sortOrder === 'desc' ? (
                          <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" />
                            <path d="M6 12h12" />
                            <path d="M9 18h6" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 6h6" />
                            <path d="M6 12h12" />
                            <path d="M3 18h18" />
                          </svg>
                        )}
                        <span className="text-[10px] uppercase">{sortOrder}</span>
                      </button>
                    </div>
                  )}

                  {/* Status filter dropdown */}
                  {statusOptions.length > 0 && onStatusChange && (
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-600 dark:text-neutral-300 mb-1">Status:</label>
                      <div className="relative">
                        <select
                          suppressHydrationWarning
                          value={currentStatus}
                          onChange={(e) => { onStatusChange?.(e.target.value); setShowFilters(false); }}
                          className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-xs text-slate-700 shadow-sm transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/70 hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:focus:border-blue-500"
                        >
                          {/* All option */}
                          {statusOptions.includes('ALL') && (
                            <option key="ALL-mobile" value="ALL">
                              All{typeof statusTotals?.['All'] === 'number' ? ` (${statusTotals['All']})` : ''}
                            </option>
                          )}

                          {/* Build groups for mobile - only render non-empty ones */}
                          {(() => {
                            const roleItems = ROLE_GROUP.filter((s) => statusOptions.includes(s));
                            const typeItems = TYPE_GROUP.filter((s) => statusOptions.includes(s));
                            const statusItems = STATUS_GROUP.filter((s) => statusOptions.includes(s));
                            const accessItems = ACCESS_GROUP.filter((s) => statusOptions.includes(s));
                            const otherItems = statusOptions.filter(
                              (s) => s !== 'ALL' && !ROLE_GROUP.includes(s) && !TYPE_GROUP.includes(s) && !STATUS_GROUP.includes(s) && !ACCESS_GROUP.includes(s)
                            );

                            return (
                              <>
                                    {roleItems.length > 0 && (
                                      <optgroup label="Roles">
                                        {roleItems.map((s) => (
                                          <option key={s + '-mobile'} value={s}>
                                            {displayLabelFor(s)}{typeof countFor(s) === 'number' ? ` (${countFor(s)})` : ''}
                                          </option>
                                        ))}
                                      </optgroup>
                                    )}

                                    {typeItems.length > 0 && (
                                      <optgroup label="Type">
                                        {typeItems.map((s) => (
                                          <option key={s + '-mobile'} value={s}>
                                            {displayLabelFor(s)}{typeof countFor(s) === 'number' ? ` (${countFor(s)})` : ''}
                                          </option>
                                        ))}
                                      </optgroup>
                                    )}

                                    {statusItems.length > 0 && (
                                      <optgroup label="Status">
                                        {statusItems.map((s) => (
                                          <option key={s + '-mobile'} value={s}>
                                            {displayLabelFor(s)}{typeof countFor(s) === 'number' ? ` (${countFor(s)})` : ''}
                                          </option>
                                        ))}
                                      </optgroup>
                                    )}

                                    {accessItems.length > 0 && (
                                      <optgroup label="Access">
                                        {accessItems.map((s) => (
                                          <option key={s + '-mobile'} value={s}>
                                            {displayLabelFor(s)}{typeof countFor(s) === 'number' ? ` (${countFor(s)})` : ''}
                                          </option>
                                        ))}
                                      </optgroup>
                                    )}

                                    {/* render extra optgroups (mobile) */}
                                    {(() => {
                                      const extraGroupsMobile = (extraOptgroups || []).map((g) => ({ label: g.label, items: g.items.filter((s) => statusOptions.includes(s)) })).filter((g) => g.items.length > 0);
                                      return extraGroupsMobile.length > 0 ? (
                                        extraGroupsMobile.map((g) => (
                                          <optgroup key={`extra-${g.label}-mobile`} label={g.label}>
                                            {g.items.map((s) => (
                                              <option key={s + '-mobile-extra'} value={s}>
                                                {displayLabelFor(s)}{typeof countFor(s) === 'number' ? ` (${countFor(s)})` : ''}
                                              </option>
                                            ))}
                                          </optgroup>
                                        ))
                                      ) : null;
                                    })()}

                                    {otherItems.length > 0 && (
                                      <optgroup label="Other">
                                        {otherItems.map((s) => (
                                          <option key={s + '-mobile'} value={s}>
                                            {displayLabelFor(s)}{typeof countFor(s) === 'number' ? ` (${countFor(s)})` : ''}
                                          </option>
                                        ))}
                                      </optgroup>
                                    )}
                              </>
                            );
                          })()}
                        </select>
                        <div className="absolute right-0 top-0 flex h-full items-center pr-2 pointer-events-none">
                          <svg 
                            className="w-3 h-3 text-slate-400 dark:text-neutral-500" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}
                  {secondaryOptions.length > 0 && onSecondaryChange && (
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-600 dark:text-neutral-300 mb-1">{secondaryLabel}:</label>
                      <div className="relative">
                        <select
                          suppressHydrationWarning
                          value={currentSecondary}
                          onChange={(e) => { onSecondaryChange(e.target.value); setShowFilters(false); }}
                          className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-xs text-slate-700 shadow-sm transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/70 hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:focus:border-blue-500"
                        >
                          {secondaryOptions.includes('ALL') && (
                            <option key="secondary-ALL-mobile" value="ALL">
                              {resolvedSecondaryAllLabel}{typeof secondaryTotals?.All === 'number' ? ` (${secondaryTotals.All})` : ''}
                            </option>
                          )}
                          {(() => {
                            const extraGroupsMobile = (secondaryExtraOptgroups || [])
                              .map((group) => ({ label: group.label, items: group.items.filter((item) => secondaryOptions.includes(item)) }))
                              .filter((group) => group.items.length > 0);
                            const otherItems = secondaryOptions.filter((item) => item !== 'ALL' && !extraGroupsMobile.some((group) => group.items.includes(item)));

                            return (
                              <>
                                {extraGroupsMobile.map((group) => (
                                  <optgroup key={`secondary-${group.label}-mobile`} label={group.label}>
                                    {group.items.map((item) => (
                                      <option key={`secondary-${item}-mobile`} value={item}>
                                        {displayLabelFor(item)}{typeof countForSecondary(item) === 'number' ? ` (${countForSecondary(item)})` : ''}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                                {otherItems.length > 0 && (
                                  <optgroup label={secondaryLabel}>
                                    {otherItems.map((item) => (
                                      <option key={`secondary-other-${item}-mobile`} value={item}>
                                        {displayLabelFor(item)}{typeof countForSecondary(item) === 'number' ? ` (${countForSecondary(item)})` : ''}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </>
                            );
                          })()}
                        </select>
                        <div className="absolute right-0 top-0 flex h-full items-center pr-2 pointer-events-none">
                          <svg 
                            className="w-3 h-3 text-slate-400 dark:text-neutral-500" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Date presets (mobile panel) */}
                  {onDatePresetChange && (
                    <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-600 dark:text-neutral-300 mb-1">Date:</label>
                    <div className="relative">
                      <select
                        suppressHydrationWarning
                        value={datePreset}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === 'CUSTOM') {
                            setPrevPreset(datePreset as DatePreset);
                            setTempStart(startDate ?? null);
                            setTempEnd(endDate ?? null);
                            setShowDateModal(true);
                          } else {
                            onDatePresetChange?.(v as DatePreset);
                          }
                        }}
                        className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-xs text-slate-700 shadow-sm transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/70 hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:focus:border-blue-500"
                      >
                        <option value="ALL">All dates</option>
                        <option value="TODAY">Today</option>
                        <option value="YESTERDAY">Yesterday</option>
                        <option value="LAST_7">Last 7 days</option>
                        <option value="LAST_MONTH">Last month</option>
                        <option value="THIS_MONTH">This month</option>
                        <option value="THIS_QUARTER">This quarter</option>
                        <option value="THIS_YEAR">This year</option>
                        <option value="CUSTOM">Custom...</option>
                      </select>
                      <div className="absolute right-0 top-0 flex h-full items-center pr-2 pointer-events-none">
                        <svg className="w-3 h-3 text-slate-400 dark:text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* If custom selected, show start/end inputs */}
                    {/* Custom range handled by modal — show brief hint when custom is active */}
                    {datePreset === 'CUSTOM' && (
                      <div className="mt-2 text-xs text-slate-500 dark:text-neutral-400">
                        Custom range selected{startDate ? `: ${formatDisplayYMD(startDate)}` : ''}{endDate ? ` → ${formatDisplayYMD(endDate)}` : ''}
                      </div>
                    )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className={`flex items-center gap-2 ${desktopTrailingClass}`}>
        <div className={desktopBlockClass}>{trailingContent}</div>
        {additionalButton && (
          <button
            onClick={additionalButton.onClick}
            disabled={additionalButton.disabled}
            className={`${desktopInlineButtonClass} ${additionalButton.className ?? 'items-center rounded-md sm:rounded-full px-2 sm:px-3 py-1 text-xs font-semibold transition border border-slate-200 bg-white/70 text-slate-600 hover:bg-white dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-200' } ${additionalButton.disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <span className="hidden sm:inline">{additionalButton.label}</span>
            <span className="sm:hidden text-[13px]">{additionalButton.label}</span>
          </button>
        )}
            {onRefresh && (
              <button
                onClick={onRefresh}
                className={`${desktopInlineButtonClass} items-center rounded-full border border-slate-200 bg-white/80 px-2 py-1 text-xs font-semibold text-slate-600 shadow-sm transition transform hover:shadow-md hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-200 active:scale-95 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-200 dark:hover:bg-neutral-900`}
                title="Refresh"
              >
                <svg className="w-4 h-4 mr-2 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0114.13-3.36L23 10" />
                  <path d="M20.49 15a9 9 0 01-14.13 3.36L1 14" />
                </svg>
                <span>Refresh</span>
              </button>
            )}
      </div>
    </div>
    {showDateModal ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <style>{`.listfilters-date-modal input[type="date"]::-webkit-calendar-picker-indicator{transition:filter .12s ease;} .dark .listfilters-date-modal input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(1) brightness(2) !important;}`}</style>
        <div className="absolute inset-0 bg-black/40" onClick={() => { setShowDateModal(false); onDatePresetChange?.(prevPreset); }} />
        <div className="relative bg-white rounded-lg p-6 w-full max-w-md z-50 dark:bg-neutral-900 listfilters-date-modal">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-neutral-100">Select date range</h3>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <label className="text-xs text-slate-600 dark:text-neutral-300">Start</label>
            <input
              suppressHydrationWarning
              type="date"
              value={tempStart || ''}
              onChange={(e) => setTempStart(e.target.value || null)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 dark:border-neutral-700 bg-white dark:bg-neutral-800 dark:text-neutral-200 listfilters-date-modal"
            />
            <label className="text-xs text-slate-600 dark:text-neutral-300">End (exclusive)</label>
            <input
              suppressHydrationWarning
              type="date"
              value={tempEnd || ''}
              onChange={(e) => setTempEnd(e.target.value || null)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 dark:border-neutral-700 bg-white dark:bg-neutral-800 dark:text-neutral-200 listfilters-date-modal"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => { setShowDateModal(false); onDatePresetChange?.(prevPreset); }}
              className="rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-600 bg-white hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onDatePresetChange?.('CUSTOM');
                onStartDateChange?.(tempStart ?? null);
                onEndDateChange?.(tempEnd ?? null);
                setShowDateModal(false);
              }}
              className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

export default ListFilters;
