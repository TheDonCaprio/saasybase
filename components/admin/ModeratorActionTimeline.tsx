'use client';

import { useCallback, useMemo, useState } from 'react';
import ListFilters from '../ui/ListFilters';
import useListFilterState from '../hooks/useListFilters';
import usePaginatedList from '../hooks/usePaginatedList';
import { useFormatSettings } from '../FormatSettingsProvider';
import clsx from 'clsx';
import { format } from 'date-fns';
import { formatDate } from '../../lib/formatDate';
import { dashboardPanelClass, dashboardMutedPanelClass } from '../dashboard/dashboardSurfaces';
import { showToast } from '../ui/Toast';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Pagination } from '../ui/Pagination';

type ActionBadgeTone = 'rose' | 'amber' | 'emerald' | 'slate';

const badgeToneClasses: Record<ActionBadgeTone, string> = {
  rose: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-200',
  amber: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-200',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-200',
  slate: 'bg-slate-500/10 text-slate-600 dark:bg-slate-500/15 dark:text-slate-200'
};

export interface ModeratorActionEntry {
  id: string;
  action: string;
  actorRole: string;
  actor: {
    id: string;
    name: string | null;
    email: string | null;
    role: string | null;
  };
  target: {
    id: string;
    name: string | null;
    email: string | null;
    role: string | null;
  } | null;
  targetType: string | null;
  details: unknown;
  createdAt: string;
}

interface PaginationMetadata {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface ModeratorActionTimelineProps {
  initialEntries: ModeratorActionEntry[];
  initialPageInfo: PaginationMetadata;
  availableActionGroups: string[];
}

type ActorRoleFilter = 'ALL' | 'ADMIN' | 'MODERATOR';

interface FilterState {
  actorRole: ActorRoleFilter;
  actionGroup: string;
  targetType: string;
}

const ACTION_GROUP_ALL = 'ALL';
const TARGET_TYPE_ALL = 'ALL';
const TARGET_TYPE_NONE = 'NONE';

/* ACTOR_ROLE_OPTIONS removed — not currently used. */

const baseNumberFormatter = new Intl.NumberFormat('en-US');

function formatGroupLabel(value: string) {
  return value
    .split(/[-_\.]+/)
    .filter(Boolean)
    .map((segment) => {
      const lower = segment.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function deriveTargetTypes(entries: ModeratorActionEntry[]): string[] {
  const observed = new Set<string>();
  let hasNullTarget = false;
  for (const entry of entries) {
    if (entry?.targetType) {
      observed.add(entry.targetType);
    } else {
      hasNullTarget = true;
    }
  }
  const values = Array.from(observed).sort((a, b) => a.localeCompare(b));
  return hasNullTarget ? [TARGET_TYPE_NONE, ...values] : values;
}

function mergeUniqueStrings(existing: string[], incoming: string[]): string[] {
  if (!incoming.length) return existing;
  const seen = new Set(existing);
  const result = [...existing];
  for (const item of incoming) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result.sort((a, b) => a.localeCompare(b));
}

function formatTargetTypeLabel(value: string) {
  if (value === TARGET_TYPE_NONE) return 'No target';
  return formatGroupLabel(value);
}

/* normalizePageInfo removed — not currently referenced. */

export function ModeratorActionTimeline({ initialEntries, initialPageInfo, availableActionGroups }: ModeratorActionTimelineProps) {
  const initialLimit = Number.isFinite(initialPageInfo?.limit) && initialPageInfo.limit > 0
    ? Math.floor(initialPageInfo.limit)
    : 50;

  const [availableGroups, setAvailableGroups] = useState<string[]>(() => [...new Set(availableActionGroups)].sort((a, b) => a.localeCompare(b)));
  const [availableTargetTypes, setAvailableTargetTypes] = useState<string[]>(() => deriveTargetTypes(initialEntries));
  const { search, setSearch, debouncedSearch, status, setStatus, datePreset, setDatePreset, startDate, setStartDate, endDate, setEndDate } = useListFilterState('', 'ALL');
  const [filters, setFilters] = useState<FilterState>({ actorRole: 'ALL', actionGroup: ACTION_GROUP_ALL, targetType: TARGET_TYPE_ALL });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [sortBy, setSortBy] = useState<'createdAt' | 'action' | 'actorRole'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const settings = useFormatSettings();

  const ymdFromDateInTZ = (date: Date, tz: string) => {
    const formatted = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
    const [y, m, d] = formatted.split('-').map((s) => Number(s));
    return { y, m, d };
  };

  const formatYMD = ({ y, m, d }: { y: number; m: number; d: number }) => {
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  };

  const addDaysYMD = ({ y, m, d }: { y: number; m: number; d: number }, delta: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  };

  const addMonthsYMD = ({ y, m, d }: { y: number; m: number; d: number }, delta: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCMonth(dt.getUTCMonth() + delta);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  };

  const computePresetRange = (preset: 'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'LAST_MONTH' | 'THIS_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR' | 'CUSTOM', tz: string) => {
    const now = new Date();
    const today = ymdFromDateInTZ(now, tz);

    let startYMD: { y: number; m: number; d: number } | null = null;
    let endYMD: { y: number; m: number; d: number } | null = null; // exclusive

    switch (preset) {
      case 'TODAY':
        startYMD = today;
        endYMD = addDaysYMD(today, 1);
        break;
      case 'YESTERDAY':
        startYMD = addDaysYMD(today, -1);
        endYMD = addDaysYMD(startYMD, 1);
        break;
      case 'LAST_7':
        endYMD = addDaysYMD(today, 1);
        startYMD = addDaysYMD(endYMD, -7);
        break;
      case 'LAST_MONTH': {
        const firstOfThisMonth = { y: today.y, m: today.m, d: 1 };
        const prev = addMonthsYMD(firstOfThisMonth, -1);
        startYMD = { y: prev.y, m: prev.m, d: 1 };
        endYMD = { y: firstOfThisMonth.y, m: firstOfThisMonth.m, d: 1 };
        break;
      }
      case 'THIS_MONTH':
        startYMD = { y: today.y, m: today.m, d: 1 };
        endYMD = addMonthsYMD(startYMD, 1);
        break;
      case 'THIS_QUARTER': {
        const qStartMonth = Math.floor((today.m - 1) / 3) * 3 + 1;
        startYMD = { y: today.y, m: qStartMonth, d: 1 };
        endYMD = addMonthsYMD(startYMD, 3);
        break;
      }
      case 'THIS_YEAR':
        startYMD = { y: today.y, m: 1, d: 1 };
        endYMD = { y: today.y + 1, m: 1, d: 1 };
        break;
      default:
        startYMD = null;
        endYMD = null;
    }

    return {
      startDate: startYMD ? formatYMD(startYMD) : null,
      endDate: endYMD ? formatYMD(endYMD) : null
    };
  };

  // Build filter object for usePaginatedList
  const paginatedListFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      actorRole: filters.actorRole !== 'ALL' ? filters.actorRole : undefined,
      actionGroup: filters.actionGroup !== ACTION_GROUP_ALL ? filters.actionGroup : undefined,
      targetType: filters.targetType !== TARGET_TYPE_ALL ? filters.targetType : undefined,
      sortBy,
      sortOrder,
      startDate: startDate || undefined,
      endDate: endDate || undefined
    }),
    [debouncedSearch, filters, sortBy, sortOrder, startDate, endDate]
  );

  const { items: entries, totalCount, currentPage, isLoading: isFetching, nextCursor, fetchPage } = usePaginatedList<ModeratorActionEntry>({
    basePath: '/api/admin/moderator-actions',
    initialItems: initialEntries,
    initialTotalCount: initialPageInfo?.totalCount ?? 0,
    initialPage: initialPageInfo?.page ?? 1,
    itemsPerPage: initialLimit,
    filters: paginatedListFilters,
    itemsKey: 'entries'
  });

  const filtersDirty = useMemo(
    () => filters.actorRole !== 'ALL' || filters.actionGroup !== ACTION_GROUP_ALL || filters.targetType !== TARGET_TYPE_ALL,
    [filters]
  );

  // actionGroupOptions / targetTypeOptions removed — use availableGroups / availableTargetTypes directly

  // Combine role, action groups and target types into a single status dropdown for ListFilters
  const listFilterStatusOptions = useMemo(() => {
    const roleOpts = ['ALL', 'ADMIN', 'MODERATOR'];
    const groups = availableGroups ?? [];
    const targets = availableTargetTypes ?? [];
    return Array.from(new Set([...roleOpts, ...groups, ...targets]));
  }, [availableGroups, availableTargetTypes]);

  // handler will be defined after fetchEntries to avoid referencing it before declaration

  const updateFromResponse = useCallback(
    (payload: {
      entries?: ModeratorActionEntry[];
      availableActionGroups?: string[];
      pageInfo?: Partial<PaginationMetadata> | null;
    }) => {
      const incomingEntries = Array.isArray(payload.entries)
        ? payload.entries.filter((entry): entry is ModeratorActionEntry => Boolean(entry && typeof entry.id === 'string'))
        : [];

      setAvailableTargetTypes(deriveTargetTypes(incomingEntries));
      setExpanded({});

      if (Array.isArray(payload.availableActionGroups) && payload.availableActionGroups.length > 0) {
        setAvailableGroups((prev) => mergeUniqueStrings(prev, payload.availableActionGroups ?? []));
      }
    },
    []
  );

  const buildQuery = useCallback((state: FilterState, page: number, limit: number) => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    if (Number.isFinite(limit) && limit > 0) {
      params.set('limit', String(limit));
    }
    if (state.actorRole !== 'ALL') params.set('actorRole', state.actorRole);
    if (state.actionGroup !== ACTION_GROUP_ALL) params.set('actionGroup', state.actionGroup);
    if (state.targetType !== TARGET_TYPE_ALL) params.set('targetType', state.targetType);
    // Use the debounced search value so we don't fire on every keystroke
    if (debouncedSearch && debouncedSearch.trim().length > 0) params.set('search', debouncedSearch.trim());
    if (sortBy) params.set('sortBy', sortBy);
    if (sortOrder) params.set('sortOrder', sortOrder);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return params.toString();
  }, [debouncedSearch, sortBy, sortOrder, startDate, endDate]);

  const fetchEntries = useCallback(async (options: { page?: number; overrideFilters?: FilterState } = {}) => {
    const { page: requestedPage, overrideFilters } = options;
    const activeFilters = overrideFilters ?? filters;
    const targetPage = typeof requestedPage === 'number' && requestedPage > 0 ? requestedPage : overrideFilters ? 1 : currentPage;
    const limit = initialLimit;

    try {
      const queryString = buildQuery(activeFilters, targetPage, limit);
      const response = await fetch(`/api/admin/moderator-actions${queryString ? `?${queryString}` : ''}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        const message = typeof errorPayload?.error === 'string' ? errorPayload.error : `Request failed (${response.status})`;
        throw new Error(message);
      }

      const json = (await response.json()) as {
        entries?: ModeratorActionEntry[];
        availableActionGroups?: string[];
        pageInfo?: Partial<PaginationMetadata> | null;
      };
      updateFromResponse(json);
    } catch (error) {
      console.error('Failed to fetch moderator actions', error);
      showToast(error instanceof Error ? error.message : 'Unable to fetch moderator actions.', 'error');
    }
  }, [buildQuery, filters, currentPage, initialLimit, updateFromResponse]);

  // Now that fetchEntries is defined, create the status -> filter mapper used by ListFilters
  const handleStatusChangeFromListFilters = useCallback((value: string) => {
    setStatus?.(value);

    if (value === 'ALL') {
      const reset: FilterState = { actorRole: 'ALL', actionGroup: ACTION_GROUP_ALL, targetType: TARGET_TYPE_ALL };
      setFilters(reset);
      return;
    }

    if (value === 'ADMIN' || value === 'MODERATOR') {
      const next: FilterState = { actorRole: value as ActorRoleFilter, actionGroup: ACTION_GROUP_ALL, targetType: TARGET_TYPE_ALL };
      setFilters(next);
      return;
    }

    if (availableGroups.includes(value)) {
      const next: FilterState = { actorRole: 'ALL', actionGroup: value, targetType: TARGET_TYPE_ALL };
      setFilters(next);
      return;
    }

    if (availableTargetTypes.includes(value)) {
      const next: FilterState = { actorRole: 'ALL', actionGroup: ACTION_GROUP_ALL, targetType: value };
      setFilters(next);
      return;
    }

    // fallback
    const fallback: FilterState = { actorRole: 'ALL', actionGroup: ACTION_GROUP_ALL, targetType: TARGET_TYPE_ALL };
    setFilters(fallback);
  }, [availableGroups, availableTargetTypes, setStatus]);

  const handleRefresh = useCallback(() => {
    fetchPage(currentPage);
  }, [fetchPage, currentPage]);

  const handleResetFilters = useCallback(() => {
    const reset: FilterState = { actorRole: 'ALL', actionGroup: ACTION_GROUP_ALL, targetType: TARGET_TYPE_ALL };
    setFilters(reset);
  }, []);

  const handleToggleEntry = useCallback((id: string) => {
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  const handleClearLog = useCallback(async () => {
    setClearing(true);
    try {
      const response = await fetch('/api/admin/moderator-actions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        const message = typeof errorPayload?.error === 'string' ? errorPayload.error : `Failed to clear log (${response.status})`;
        throw new Error(message);
      }
      const payload = (await response.json().catch(() => ({}))) as { deletedCount?: unknown } | undefined;
      const deletedCount = payload && typeof payload.deletedCount === 'number' ? payload.deletedCount : undefined;
      setExpanded({});
      showToast(
        deletedCount != null ? `Cleared ${baseNumberFormatter.format(deletedCount)} activity entries.` : 'Moderator activity log cleared.',
        'success'
      );
      // Refresh the data after clearing
      fetchPage(1);
    } catch (error) {
      console.error('Failed to clear moderator actions', error);
      showToast(error instanceof Error ? error.message : 'Unable to clear moderator actions.', 'error');
    } finally {
      setClearing(false);
      setConfirmOpen(false);
    }
  }, [fetchPage]);

  const handlePageChange = useCallback(
    (nextPage: number) => {
      if (nextPage === currentPage || nextPage < 1) return;
      fetchPage(nextPage);
    },
    [fetchPage, currentPage]
  );

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / initialLimit));

  const activeFilterSummary = useMemo(() => {
    const summary: string[] = [];
    if (filters.actorRole !== 'ALL') summary.push(`Actor: ${formatGroupLabel(filters.actorRole)}`);
    if (filters.actionGroup !== ACTION_GROUP_ALL) summary.push(`Group: ${formatGroupLabel(filters.actionGroup)}`);
    if (filters.targetType !== TARGET_TYPE_ALL) summary.push(`Target: ${formatTargetTypeLabel(filters.targetType)}`);
    return summary.length > 0 ? summary.join(' • ') : 'No filters applied';
  }, [filters]);

  const entriesSummary = useMemo(() => {
    if (entries.length === 0) return 'No entries loaded';
    const start = (currentPage - 1) * initialLimit + 1;
    const end = start + entries.length - 1;
    const total = totalCount > 0 ? totalCount : Math.max(end, 0);
    const boundedEnd = Math.min(total, end);
    return `Showing ${baseNumberFormatter.format(start)}-${baseNumberFormatter.format(boundedEnd)} of ${baseNumberFormatter.format(total)} entries`;
  }, [entries.length, initialLimit, currentPage, totalCount]);

  const showPagination = totalPages > 1 || totalCount > initialLimit;

  return (
    <div className="space-y-4">
      <div className={dashboardPanelClass('p-4 sm:p-6 space-y-4')}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-start">
          <div className="flex-1 min-w-0">
            <ListFilters
              search={search}
              onSearchChange={setSearch}
              statusOptions={listFilterStatusOptions}
              currentStatus={status}
              onStatusChange={handleStatusChangeFromListFilters}
              extraOptgroups={[{ label: 'Action group', items: availableGroups }, { label: 'Target type', items: availableTargetTypes }]}
              onRefresh={handleRefresh}
              trailingContent={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    disabled={!filtersDirty || isFetching || clearing}
                    className={clsx(
                      'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                      'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-100 dark:hover:bg-neutral-900',
                      (!filtersDirty || isFetching || clearing) && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    Reset filters
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    disabled={clearing || entries.length === 0}
                    className={clsx(
                      'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                      'border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200',
                      (clearing || entries.length === 0) && 'cursor-not-allowed opacity-60'
                    )}
                  >
                    {clearing ? 'Clearing…' : 'Clear'}
                  </button>
                </div>
              }
              placeholder="Search by action, actor name/email, or target ID/email..."
              sortOptions={[
                { value: 'createdAt', label: 'Created' },
                { value: 'action', label: 'Action' },
                { value: 'actorRole', label: 'Actor role' }
              ]}
              sortBy={sortBy}
              onSortByChange={(v) => {
                setSortBy(v as 'createdAt' | 'action' | 'actorRole');
                void fetchEntries({ overrideFilters: filters });
              }}
              sortOrder={sortOrder}
              onSortOrderChange={(o) => { setSortOrder(o); void fetchEntries({ overrideFilters: filters }); }}
              datePreset={datePreset}
              startDate={startDate}
              endDate={endDate}
              onDatePresetChange={(p: 'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'LAST_MONTH' | 'THIS_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR' | 'CUSTOM') => {
                setDatePreset(p);
                const { startDate: sd, endDate: ed } = computePresetRange(p, settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
                setStartDate(sd);
                setEndDate(ed);
                void fetchEntries({ overrideFilters: filters });
              }}
              onStartDateChange={(d) => { setStartDate(d); void fetchEntries({ overrideFilters: filters }); }}
              onEndDateChange={(d) => { setEndDate(d); void fetchEntries({ overrideFilters: filters }); }}
            />
          </div>
          {/* action group moved into ListFilters.trailingContent — no right-side controls */}
        </div>

        {/* Actor role / Action group / Target type moved into ListFilters (status dropdown) */}
      </div>

      <div className={dashboardMutedPanelClass('flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs sm:text-sm text-slate-600 dark:text-neutral-300')}>
        <span>{entriesSummary}</span>
        <span className="truncate sm:text-right">{activeFilterSummary}</span>
      </div>

      <div className={dashboardPanelClass('p-0 overflow-hidden')}>
        <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-neutral-800 dark:bg-neutral-900/70 dark:text-neutral-400">
          Recent moderator and admin activity
        </div>
        {isFetching && entries.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500 dark:text-neutral-400">Loading activity…</div>
        ) : entries.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500 dark:text-neutral-400">
            No activity recorded yet.
          </div>
        ) : (
          <ul className="divide-y divide-slate-200/70 dark:divide-neutral-800/70">
            {entries.map((entry) => {
              const isExpanded = !!expanded[entry.id];
              const actionBadges = deriveActionBadges(entry);
              return (
                <li key={entry.id} className="px-4 py-4 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-neutral-100">
                        <span>{formatActor(entry.actor)}</span>
                        <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-200">
                          {entry.action}
                        </span>
                        {actionBadges.map((badge) => (
                          <span
                            key={badge.label}
                            className={clsx(
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                              badgeToneClasses[badge.tone]
                            )}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-neutral-400">Role: {entry.actorRole}</div>
                      <div className="text-xs text-slate-500 dark:text-neutral-400">
                        {entry.target ? (
                          <>
                            Target: {formatTarget(entry.target)}
                            {entry.targetType ? ` • ${formatTargetTypeLabel(entry.targetType)}` : ''}
                          </>
                        ) : (
                          <>Target: None</>
                        )}
                      </div>
                    </div>
                    <time
                      className="text-xs text-slate-500 dark:text-neutral-400"
                      title={format(new Date(entry.createdAt), 'PPpp')}
                    >
                      {formatDate(new Date(entry.createdAt), { mode: 'datetime' })}
                      <span className="ml-2 text-[11px] text-slate-400 dark:text-neutral-500">
                        {formatDate(new Date(entry.createdAt), { mode: 'relative' })}
                      </span>
                    </time>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                      Entry ID: {entry.id}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleEntry(entry.id)}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-100 dark:hover:bg-neutral-900"
                    >
                      {isExpanded ? 'Hide details' : 'Show details'}
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="mt-4 space-y-3">
                      {entry.target ? (
                        <div className="rounded-lg bg-slate-100/70 px-3 py-3 text-xs text-slate-600 dark:bg-neutral-900/50 dark:text-neutral-300">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                            Target details
                          </div>
                          <div className="mt-2 whitespace-pre-wrap break-words">
                            {formatTarget(entry.target)}
                            {entry.target.role ? ` • Role: ${entry.target.role}` : ''}
                          </div>
                        </div>
                      ) : null}

                      <div className="rounded-lg bg-white/70 px-3 py-3 text-xs text-slate-600 shadow-sm ring-1 ring-slate-200/70 dark:bg-neutral-900/40 dark:text-neutral-300 dark:ring-neutral-800/60">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                          Details
                        </div>
                        <div className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
                          {entry.details ? renderDetails(entry.details) : '—'}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {showPagination ? (
          <div className="bg-slate-50/70 px-4 py-3 dark:bg-neutral-900/70">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalCount}
              itemsPerPage={initialLimit}
              onPageChange={handlePageChange}
              nextCursor={nextCursor}
              onNextWithCursor={(cursor) => fetchPage(currentPage + 1, false, cursor)}
            />
          </div>
        ) : null}
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        title="Clear moderator actions"
        description="This removes all recorded moderator and admin activity. The audit trail will be lost."
        confirmLabel="Clear log"
        cancelLabel="Cancel"
        loading={clearing}
        onClose={() => {
          if (!clearing) setConfirmOpen(false);
        }}
        onConfirm={handleClearLog}
      />
    </div>
  );
}

function formatActor(actor: ModeratorActionEntry['actor']) {
  if (actor.name) return actor.name;
  if (actor.email) return actor.email;
  return actor.id;
}

function formatTarget(target: NonNullable<ModeratorActionEntry['target']>) {
  if (target.name) return `${target.name} (${target.id})`;
  if (target.email) return `${target.email} (${target.id})`;
  return target.id;
}

function renderDetails(details: unknown) {
  if (details == null) return '—';
  if (typeof details === 'string' || typeof details === 'number' || typeof details === 'boolean') {
    return String(details);
  }
  if (Array.isArray(details)) {
    return JSON.stringify(details, null, 2);
  }
  if (details && typeof details === 'object') {
    const entries = Object.entries(details as Record<string, unknown>);
    if (entries.length === 0) return '—';
    return entries
      .map(([key, value]) => `${key}: ${formatDetailValue(value)}`)
      .join('\n');
  }
  return '—';
}

function formatDetailValue(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value);
  }
  return 'unknown';
}

interface ActionBadge {
  label: string;
  tone: ActionBadgeTone;
}

function deriveActionBadges(entry: ModeratorActionEntry): ActionBadge[] {
  const badges: ActionBadge[] = [];
  const details = toRecord(entry.details);
  if (!details) {
    return badges;
  }

  if (entry.action === 'payments.refund') {
    const cancelSubscription = details['cancelSubscription'] === true;
    const providerModeRaw = typeof details['cancelMode'] === 'string' ? String(details['cancelMode']) : undefined;
    const localModeRaw = typeof details['localCancelMode'] === 'string' ? String(details['localCancelMode']) : undefined;
    const providerAttempted = details['stripeCancellationAttempted'] === true;
    const hasProviderSubscription = details['hasStripeSubscription'] === true;

    if (cancelSubscription && providerAttempted) {
      if (providerModeRaw === 'period_end') {
        badges.push({ label: 'Provider scheduled cancel', tone: 'amber' });
      } else {
        badges.push({ label: 'Provider cancelled', tone: 'rose' });
      }
    } else if (!cancelSubscription && hasProviderSubscription) {
      badges.push({ label: 'Provider active', tone: 'emerald' });
    }

    if (localModeRaw === 'period_end') {
      badges.push({ label: 'Local access scheduled', tone: 'amber' });
    } else if (localModeRaw === 'immediate') {
      badges.push({ label: 'Local access revoked', tone: 'rose' });
    }
  }

  return badges;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export default ModeratorActionTimeline;
