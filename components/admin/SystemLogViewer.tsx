"use client";

import React, { useCallback, useState, useRef } from 'react';
import { ConfirmModal } from '../ui/ConfirmModal';
import clsx from 'clsx';
import { showToast } from '../ui/Toast';
import { dashboardMutedPanelClass, dashboardPanelClass } from '../dashboard/dashboardSurfaces';
import ListFilters from '../ui/ListFilters';
import useListFilterState from '../hooks/useListFilters';
import usePaginatedList from '../hooks/usePaginatedList';
import { Pagination } from '../ui/Pagination';
import { useFormatSettings } from '../FormatSettingsProvider';

export type AdminLogEntry = {
  id: string;
  level: string;
  message: string;
  meta: unknown;
  context: unknown;
  createdAt: string;
  createdAtFormatted?: string | null;
  createdAtRelative?: string | null;
  createdAtDisplay?: string | null;
};

const LEVEL_STYLES: Record<string, string> = {
  error: 'border border-rose-200/70 bg-rose-500/10 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-100',
  warn: 'border border-amber-200/70 bg-amber-500/10 text-amber-600 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100',
  default: 'border border-slate-200 bg-slate-100 text-slate-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
};

const LEVEL_LABELS: Record<string, string> = {
  error: 'Error',
  warn: 'Warning',
};

type Props = {
  initialLogs: AdminLogEntry[];
  initialTotal: number;
  pageSize?: number;
};

export function SystemLogViewer({ initialLogs, initialTotal, pageSize = 50 }: Props) {
  const { search, setSearch, debouncedSearch, status, setStatus, datePreset, setDatePreset, startDate, setStartDate, endDate, setEndDate } = useListFilterState('', 'ALL');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isClearing, setClearing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState<string | null>(null);
  const confirmResolver = useRef<((value: boolean) => void) | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'createdAt' | 'level' | 'message'>('createdAt');
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

  const computePresetRange = (preset: 'ALL'|'TODAY'|'YESTERDAY'|'LAST_7'|'LAST_MONTH'|'THIS_MONTH'|'THIS_QUARTER'|'THIS_YEAR'|'CUSTOM', tz: string) => {
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

  const handleConfirmClose = useCallback(() => {
    setConfirmOpen(false);
    if (confirmResolver.current) {
      confirmResolver.current(false);
      confirmResolver.current = null;
    }
  }, []);

  const handleConfirm = useCallback(() => {
    // Resolve as confirmed; keep modal open while action runs (caller will set loading)
    if (confirmResolver.current) {
      confirmResolver.current(true);
    }
  }, []);

  const {
    items: logs,
    setItems,
    totalCount,
    currentPage,
    isLoading,
    nextCursor,
    fetchPage
  } = usePaginatedList<AdminLogEntry>({
    basePath: '/api/admin/logs',
    initialItems: initialLogs,
    initialTotalCount: initialTotal,
    initialPage: 1,
    itemsPerPage: pageSize,
    filters: {
      search: debouncedSearch || undefined,
      level: status.toLowerCase() === 'all' ? undefined : status.toLowerCase(),
      sortBy,
      sortOrder,
      startDate: startDate || undefined,
      endDate: endDate || undefined
    },
    itemsKey: 'logs'
  });

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize));
  const pageStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = totalCount === 0 ? 0 : Math.min(totalCount, pageStart + logs.length - 1);

  const clearLogs = useCallback(async () => {
    // show confirm modal
    setConfirmText('Clear all stored log entries? This cannot be undone.');
    setConfirmOpen(true);
    const confirmed: boolean = await new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
    });
    if (!confirmed) {
      setConfirmOpen(false);
      confirmResolver.current = null;
      return;
    }

    // keep modal open while clearing
    setConfirmLoading(true);
    setClearing(true);
    try {
      const response = await fetch('/api/admin/logs', { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to clear logs');
      }
      setItems([]);
      showToast('Logs cleared', 'success');
      // Refresh the current page
      await fetchPage(1);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to clear logs', 'error');
    } finally {
      setClearing(false);
      setConfirmLoading(false);
      setConfirmOpen(false);
      confirmResolver.current = null;
    }
  }, [setItems, fetchPage]);

  const formatTimestamp = useCallback((entry: AdminLogEntry) => {
    if (entry.createdAtDisplay) return entry.createdAtDisplay;
    const absolute = entry.createdAtFormatted;
    const relative = entry.createdAtRelative;
    if (absolute && relative) return `${absolute} • ${relative}`;
    if (absolute) return absolute;
    if (relative) return relative;
    try {
      const date = new Date(entry.createdAt);
      if (Number.isNaN(date.getTime())) return entry.createdAt;
      return date.toISOString();
    } catch {
      return entry.createdAt;
    }
  }, []);

  const renderMeta = useCallback((meta: unknown) => {
    if (!meta) {
      return <span className="mt-2 block text-slate-500 dark:text-neutral-400">No additional metadata</span>;
    }

    try {
      const json = JSON.stringify(meta, null, 2);
      return (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-100">
          {json}
        </pre>
      );
    } catch (error) {
      return <span className="text-rose-500 dark:text-rose-300">Unable to render metadata: {String(error)}</span>;
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className={dashboardPanelClass('p-4 sm:p-6')}>
        <div className="space-y-4">
          
          <ListFilters
            search={search}
            onSearchChange={setSearch}
            statusOptions={['ALL', 'ERROR', 'WARN']}
            currentStatus={status}
            onStatusChange={setStatus}
            onRefresh={() => fetchPage(currentPage)}
            placeholder="Search logs by message or level..."
            additionalButton={{
              label: isClearing ? 'Clearing…' : 'Clear logs',
              onClick: clearLogs,
              disabled: isClearing
            }}
            sortOptions={[
              { value: 'createdAt', label: 'Date captured' },
              { value: 'level', label: 'Level' },
              { value: 'message', label: 'Message' },
            ]}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            datePreset={datePreset}
            startDate={startDate}
            endDate={endDate}
            onDatePresetChange={(p: 'ALL'|'TODAY'|'YESTERDAY'|'LAST_7'|'LAST_MONTH'|'THIS_MONTH'|'THIS_QUARTER'|'THIS_YEAR'|'CUSTOM') => {
              setDatePreset(p);
              const { startDate: sd, endDate: ed } = computePresetRange(p, settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
              setStartDate(sd);
              setEndDate(ed);
              fetchPage(1);
            }}
            onStartDateChange={(d) => { setStartDate(d); fetchPage(1); }}
            onEndDateChange={(d) => { setEndDate(d); fetchPage(1); }}
          />
        </div>
      </div>

      <div
        className={dashboardMutedPanelClass(
          'flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-neutral-600 dark:text-neutral-300'
        )}
      >
        <span>
          {isLoading && logs.length === 0
            ? 'Loading logs...'
            : totalCount === 0
              ? 'No logs to display'
              : `Showing ${pageStart}-${pageEnd} of ${totalCount} logs`}
        </span>
      </div>

      <div className={dashboardPanelClass('p-0 overflow-hidden')}>
        {logs.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500 dark:text-neutral-300">
            No log entries to display. Trigger relevant actions or check again later.
          </div>
        ) : (
          <div className="divide-y divide-slate-100/80 dark:divide-neutral-800/80">
            {logs.map((log) => {
              const levelKey = log.level?.toLowerCase?.() ?? 'default';
              const badgeStyle = LEVEL_STYLES[levelKey] || LEVEL_STYLES.default;
              const levelLabel = LEVEL_LABELS[levelKey] || log.level?.toUpperCase?.() || 'Log';
              const isOpen = !!expanded[log.id];
              const metaPayload = log.meta && log.context ? { meta: log.meta, context: log.context } : log.meta ?? log.context;
              return (
                <article key={log.id} className="space-y-3 px-4 py-4 sm:px-6 sm:py-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide', badgeStyle)}>
                          {levelLabel}
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-wide text-slate-400 dark:text-neutral-500">{log.id.slice(0, 8)}…</span>
                        <span className="text-xs text-slate-500 dark:text-neutral-400">{formatTimestamp(log)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpanded((s) => ({ ...s, [log.id]: !s[log.id] }))}
                        className="block text-left text-sm font-semibold text-slate-900 transition hover:text-slate-700 dark:text-neutral-50 dark:hover:text-neutral-100"
                        title={log.message}
                      >
                        {log.message || 'Log event'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(log.id)}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-100 dark:hover:bg-neutral-900"
                        title="Copy ID"
                      >
                        Copy ID
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpanded((s) => ({ ...s, [log.id]: !s[log.id] }))}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-100 dark:hover:bg-neutral-900"
                      >
                        {isOpen ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                  </div>
                  {isOpen ? renderMeta(metaPayload) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <Pagination
        currentPage={currentPage}

        totalPages={totalPages}
        onPageChange={(page) => fetchPage(page)}
        totalItems={totalCount}
        itemsPerPage={pageSize}
        nextCursor={nextCursor}
        onNextWithCursor={(cursor) => fetchPage(currentPage + 1, false, cursor)}
      />
      <ConfirmModal
        isOpen={confirmOpen}
        description={confirmText ?? undefined}
        onClose={handleConfirmClose}
        onConfirm={handleConfirm}
        loading={confirmLoading}
      />
    </div>
  );
}
