'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { showToast } from '../../ui/Toast';
import { dashboardMutedPanelClass, dashboardPanelClass } from '../../dashboard/dashboardSurfaces';
import { Pagination } from '../../ui/Pagination';
import ListFilters from '../../ui/ListFilters';
import useListFilterState from '../../hooks/useListFilters';
import usePaginatedList from '../../hooks/usePaginatedList';
import { asRecord } from '../../../lib/runtime-guards';
import { formatDate } from '../../../lib/formatDate';
import { useFormatSettings } from '../../FormatSettingsProvider';
import { ConfirmModal } from '../../ui/ConfirmModal';
import type { BlogCategoryDTO } from '@/lib/blog';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faEye,
  faEdit,
  faTrash,
  faUndo,
  faTrashCan,
  faSpinner,
  faGlobe,
  faLock
} from '@fortawesome/free-solid-svg-icons';

export interface SitePageDTO {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  content: string;
  published: boolean;
  system: boolean;
  publishedAt: string | null;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  noIndex: boolean;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  categories?: BlogCategoryDTO[];
}

interface SitePagesListProps {
  initialPages: SitePageDTO[];
  initialTotalCount: number;
  initialPublishedCount: number;
  initialDraftCount: number;
  initialTrashedCount: number;
  initialSystemCount: number;
  pageSize: number;
  apiBasePath?: string;
  editBasePath?: string;
  newItemHref?: string;
  storageNamespace?: string;
  entityLabel?: string;
  entityLabelPlural?: string;
  previewPathPrefix?: string;
}

type BulkAction = 'trash' | 'restore' | 'delete';

export default function SitePagesList({
  initialPages,
  initialTotalCount,
  initialPublishedCount,
  initialDraftCount,
  initialTrashedCount,
  initialSystemCount,
  pageSize,
  apiBasePath = '/api/admin/pages',
  editBasePath = '/admin/pages',
  newItemHref,
  storageNamespace = 'page-editor',
  entityLabel = 'Page',
  entityLabelPlural,
  previewPathPrefix = ''
}: SitePagesListProps) {
  const normalizedApiBasePath = apiBasePath.replace(/\/$/, '');
  const normalizedEditBasePath = editBasePath.replace(/\/$/, '');
  const normalizedStorageNamespace = storageNamespace.replace(/\s+/g, '-');
  const normalizedPreviewPrefix = previewPathPrefix.replace(/\/+$/, '');
  const getPreviewPath = (slug: string) => `${normalizedPreviewPrefix}/${slug}`;
  const computedNewItemHref = newItemHref ?? `${normalizedEditBasePath}/new`;
  const pluralLabel = entityLabelPlural ?? (entityLabel.endsWith('s') ? entityLabel : `${entityLabel}s`);
  const entityLabelLower = entityLabel.toLowerCase();
  const pluralLabelLower = pluralLabel.toLowerCase();
  const { search, setSearch, debouncedSearch, status, setStatus } = useListFilterState('', 'ALL');
  const [sortBy, setSortBy] = useState<'publishedAt' | 'updatedAt' | 'createdAt'>('publishedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [publishedCount, setPublishedCount] = useState(initialPublishedCount);
  const [draftCount, setDraftCount] = useState(initialDraftCount);
  const [trashedCount, setTrashedCount] = useState(initialTrashedCount);
  const [systemCount, setSystemCount] = useState(initialSystemCount);
  const [updatingPageId, setUpdatingPageId] = useState<string | null>(null);
  const [pendingRowAction, setPendingRowAction] = useState<{ id: string; action: 'trash' | 'restore' | 'delete' } | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState<string | null>(null);
  const confirmResolver = useRef<((value: boolean) => void) | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const formatSettings = useFormatSettings();

  const {
    items: pages,
    setItems,
    totalCount,
    currentPage,
    isLoading,
    nextCursor,
    fetchPage,
    lastResponse
  } = usePaginatedList<SitePageDTO>({
    basePath: normalizedApiBasePath,
    initialItems: initialPages,
    initialTotalCount,
    initialPage: 1,
    itemsPerPage: pageSize,
    filters: {
      search: debouncedSearch || undefined,
      status: status.toLowerCase() === 'all' ? undefined : status.toLowerCase(),
      sortBy,
      sortOrder
    },
    itemsKey: 'pages'
  });

  // Auto-refresh when returning from editor
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchPage(currentPage);
      }
    };

    const handleFocus = () => {
      fetchPage(currentPage);
    };

    const handlePageShow = () => {
      fetchPage(currentPage);
    };

    const handleStorage = (e: StorageEvent) => {
      // Refresh if a page was updated in the editor
      if (e.key && (e.key.startsWith(`${normalizedStorageNamespace}-`) || e.key.startsWith(`${normalizedStorageNamespace}-action-`))) {
        fetchPage(currentPage);
      }
    };

    // Listen for multiple events that indicate returning to this page
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('storage', handleStorage);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('storage', handleStorage);
    };
  }, [fetchPage, currentPage, normalizedStorageNamespace]);

  useEffect(() => {
    const payload = asRecord(lastResponse);
    if (!payload) return;
    if (typeof payload.publishedCount === 'number') {
      setPublishedCount(payload.publishedCount);
    }
    if (typeof payload.draftCount === 'number') {
      setDraftCount(payload.draftCount);
    }
    if (typeof payload.trashedCount === 'number') {
      setTrashedCount(payload.trashedCount);
    }
    if (typeof payload.systemCount === 'number') {
      setSystemCount(payload.systemCount);
    }
  }, [lastResponse]);

  const statusTotals = useMemo(
    () => ({
      All: publishedCount + draftCount,
      Published: publishedCount,
      Draft: draftCount,
      System: systemCount,
      Trashed: trashedCount
    }),
    [publishedCount, draftCount, systemCount, trashedCount]
  );

  const pageStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = totalCount === 0 ? 0 : Math.min(totalCount, pageStart + pages.length - 1);
  const hasSearch = search.trim().length > 0;
  const normalizedStatus = status.toLowerCase();
  const isTrashedView = normalizedStatus === 'trashed';
  const statusLabel = useMemo(() => (status === 'ALL' ? 'All' : `${status.slice(0, 1)}${status.slice(1).toLowerCase()}`), [status]);
  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize));
  const selectablePages = useMemo(() => pages.filter((page) => !page.system), [pages]);
  const selectedCount = selectedIds.length;
  const hasSelection = selectedCount > 0;
  const allSelectableSelected = selectablePages.length > 0 && selectablePages.every((page) => selectedIds.includes(page.id));

  const handlePageChange = (page: number) => {
    if (page < 1 || page === currentPage) return;
    fetchPage(page);
  };

  useEffect(() => {
    setSelectedIds([]);
    setPendingRowAction(null);
  }, [normalizedStatus, debouncedSearch]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => pages.some((page) => !page.system && page.id === id)));
  }, [pages]);

  const toggleSelection = (id: string) => {
    const page = pages.find((item) => item.id === id);
    if (!page || page.system) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
  };

  const toggleSelectAllOnPage = () => {
    if (allSelectableSelected) {
      setSelectedIds((prev) => prev.filter((id) => !selectablePages.some((page) => page.id === id)));
      return;
    }
    const idsToAdd = selectablePages.map((page) => page.id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...idsToAdd])));
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const askConfirm = (message: string) => {
    setConfirmText(message);
    setConfirmOpen(true);
    return new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
    });
  };

  const closeConfirm = () => {
    setConfirmOpen(false);
    setConfirmText(null);
    confirmResolver.current = null;
    setConfirmLoading(false);
  };

  const applyAction = async (
    action: BulkAction,
    ids: string[],
    {
      success,
      error,
      confirmMessage,
      isBulk = false
    }: { success: string; error: string; confirmMessage?: string; isBulk?: boolean }
  ) => {
    if (!ids.length) return;
    if (confirmMessage) {
      const confirmed = await askConfirm(confirmMessage);
      if (!confirmed) {
        closeConfirm();
        return;
      }
      // keep modal open and show loading while action runs
      setConfirmLoading(true);
    }

    try {
      if (isBulk) {
        setIsBulkProcessing(true);
      } else {
        setPendingRowAction({ id: ids[0], action });
      }

      const response = await fetch(`${normalizedApiBasePath}/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, ids })
      });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      clearSelection();
      showToast(success, 'success');
      const refreshed = await fetchPage(currentPage);
      if (!refreshed) {
        await fetchPage(1);
      }
      if (confirmMessage) {
        // finished successfully
        closeConfirm();
      }
    } catch (err) {
      console.error(`Bulk ${pluralLabelLower} action error`, err);
      showToast(error, 'error');
      if (confirmMessage) {
        closeConfirm();
      }
    } finally {
      if (isBulk) {
        setIsBulkProcessing(false);
      }
      setPendingRowAction(null);
    }
  };

  const handleTrash = async (pageId: string, title: string) => {
    await applyAction('trash', [pageId], {
      success: `Moved "${title}" to trash`,
      error: `Failed to move ${entityLabelLower} to trash`,
      confirmMessage: `Move "${title}" to trash?`
    });
  };

  const handleRestore = async (pageId: string, title: string) => {
    await applyAction('restore', [pageId], {
      success: `Restored "${title}"`,
      error: `Failed to restore ${entityLabelLower}`
    });
  };

  const handlePermanentDelete = async (pageId: string, title: string) => {
    await applyAction('delete', [pageId], {
      success: `Permanently deleted "${title}"`,
      error: `Failed to delete ${entityLabelLower} permanently`,
      confirmMessage: `Delete "${title}" permanently? This cannot be undone.`
    });
  };

  const handleBulkAction = async (action: BulkAction) => {
    if (!selectedIds.length) return;
    const plural = selectedIds.length === 1 ? entityLabelLower : pluralLabelLower;
    const messages: Record<BulkAction, { success: string; error: string; confirmMessage?: string }> = {
      trash: {
        success: `Moved ${selectedIds.length} ${plural} to trash`,
        error: `Failed to move selected ${plural} to trash`,
        confirmMessage: `Move ${selectedIds.length} ${plural} to trash?`
      },
      restore: {
        success: `Restored ${selectedIds.length} ${plural}`,
        error: `Failed to restore selected ${plural}`
      },
      delete: {
        success: `Permanently deleted ${selectedIds.length} ${plural}`,
        error: `Failed to delete selected ${plural} permanently`,
        confirmMessage: `Delete ${selectedIds.length} ${plural} permanently? This cannot be undone.`
      }
    };

    await applyAction(action, selectedIds, { ...messages[action], isBulk: true });
  };

  const togglePublished = async (pageId: string, publish: boolean) => {
    setUpdatingPageId(pageId);
    try {
      const response = await fetch(`${normalizedApiBasePath}/${pageId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ published: publish })
      });

      if (!response.ok) {
        throw new Error(`Failed to update ${entityLabelLower}`);
      }

      const parsed = await response.json();
      const updatedPage: SitePageDTO = 'page' in parsed && parsed.page ? parsed.page : parsed;
      setItems((prev) => prev.map((page) => (page.id === pageId ? updatedPage : page)));
      showToast(`${entityLabel} ${publish ? 'published' : 'unpublished'}`, 'success');
      await fetchPage(currentPage);
    } catch (error) {
      console.error(`Error updating ${entityLabelLower}:`, error);
      showToast(`Failed to update ${entityLabelLower}`, 'error');
    } finally {
      setUpdatingPageId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className={dashboardPanelClass('p-4 sm:p-6')}>
        <ListFilters
          search={search}
          onSearchChange={setSearch}
          statusOptions={['ALL', 'PUBLISHED', 'DRAFT', 'SYSTEM', 'TRASHED']}
          currentStatus={status}
          onStatusChange={setStatus}
          onRefresh={() => fetchPage(currentPage)}
          placeholder="Search by title, slug, or description..."
          statusTotals={statusTotals}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          additionalButton={{
            label: 'Add',
            onClick: () => {
              // navigate to new page editor
              try {
                window.location.href = computedNewItemHref;
              } catch {
                // ignore on server
              }
            },
            className: 'inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2'
          }}
        />
      </div>

      <div
        className={dashboardMutedPanelClass(
          'flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-neutral-600 dark:text-neutral-300'
        )}
      >
        <span>
          {isLoading && pages.length === 0
            ? `Loading ${pluralLabelLower}...`
            : totalCount === 0
              ? `No ${pluralLabelLower} to display`
              : `Showing ${pageStart}-${pageEnd} of ${totalCount} ${pluralLabelLower}`}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-600 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-200">
            Total {statusTotals.All}
          </span>
          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-emerald-300">
            Published {statusTotals.Published}
          </span>
          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-amber-300">
            Draft {statusTotals.Draft}
          </span>
          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-600 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-rose-300">
            Trashed {statusTotals.Trashed}
          </span>
          {hasSelection ? (
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-600 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-indigo-300">
              Selected {selectedCount}
            </span>
          ) : null}
          {selectablePages.length > 0 ? (
            <button
              type="button"
              onClick={toggleSelectAllOnPage}
              className="inline-flex items-center rounded-full border border-neutral-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-600 shadow-sm transition hover:bg-white dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-200"
            >
              {allSelectableSelected ? 'Clear page selection' : 'Select all on page'}
            </button>
          ) : null}
          {normalizedStatus !== 'all' ? (
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-violet-600 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-violet-300">
              Status: {statusLabel}
            </span>
          ) : null}
          {hasSearch ? (
            <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-600 shadow-sm backdrop-blur-sm dark:bg-neutral-900/60 dark:text-blue-300">
              Search: &ldquo;{search.trim()}&rdquo;
            </span>
          ) : null}
        </div>
      </div>

        {/** Confirm modal used for replacing window.confirm */}
        <ConfirmModal
          isOpen={confirmOpen}
          title="Confirm action"
          description={confirmText ?? ''}
          confirmLabel="Yes"
          cancelLabel="Cancel"
          loading={confirmLoading}
          onClose={() => {
            if (confirmResolver.current) confirmResolver.current(false);
            closeConfirm();
          }}
          onConfirm={() => {
            if (confirmResolver.current) confirmResolver.current(true);
            // keep modal open while action runs; applyAction will set confirmLoading
          }}
        />

      {hasSelection ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white/80 px-4 py-3 text-xs font-medium text-neutral-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-200">
          <span>{selectedCount} selected</span>
          <div className="flex flex-wrap items-center gap-2">
            {isTrashedView ? (
              <>
                <button
                  type="button"
                  onClick={() => handleBulkAction('restore')}
                  disabled={isBulkProcessing}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold !text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
                >
                  Restore selected
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkAction('delete')}
                  disabled={isBulkProcessing}
                  className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold !text-white transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-70"
                >
                  Delete permanently
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleBulkAction('trash')}
                disabled={isBulkProcessing}
                className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold !text-white transition hover:bg-amber-700 disabled:cursor-wait disabled:opacity-70"
              >
                Move to trash
              </button>
            )}
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {pages.length > 0 ? (
        <>
          {/* Mobile Cards View - Below 1025px */}
          <div className="block min-[1025px]:hidden overflow-hidden rounded-xl border border-neutral-200 bg-white/80 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/40">
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {pages.map((page) => {
                const isSelected = selectedIds.includes(page.id);
                const isTrashed = Boolean(page.trashedAt);
                const isPendingTrash = pendingRowAction?.id === page.id && pendingRowAction.action === 'trash';
                const isPendingRestore = pendingRowAction?.id === page.id && pendingRowAction.action === 'restore';
                const isPendingDelete = pendingRowAction?.id === page.id && pendingRowAction.action === 'delete';

                return (
                  <div key={page.id} className="flex flex-col gap-3 px-4 py-3 sm:gap-4">
                    <div className="flex items-start gap-3 sm:items-center">
                      {!page.system ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(page.id)}
                          className="mt-1 h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900"
                          aria-label={`Select ${page.title}`}
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="max-w-full truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {page.title}
                          </h3>
                          <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">/{page.slug}</span>
                          {page.system ? (
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                              System
                            </span>
                          ) : null}
                          {isTrashed ? (
                            <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                              Trashed
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                page.published
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                              }`}
                            >
                              {page.published ? 'Published' : 'Draft'}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                          <span>
                            Updated{' '}
                            {formatDate(page.updatedAt, {
                              mode: formatSettings.mode,
                              timezone: formatSettings.timezone
                            }) || '—'}
                          </span>
                          <span>
                            Created{' '}
                            {formatDate(page.createdAt, {
                              mode: formatSettings.mode,
                              timezone: formatSettings.timezone
                            }) || '—'}
                          </span>
                          {!isTrashed && page.publishedAt ? (
                            <span>
                              Published{' '}
                              {formatDate(page.publishedAt, {
                                mode: formatSettings.mode,
                                timezone: formatSettings.timezone
                              }) || '—'}
                            </span>
                          ) : null}
                          {isTrashed && page.trashedAt ? (
                            <span>
                              Trashed{' '}
                              {formatDate(page.trashedAt, {
                                mode: formatSettings.mode,
                                timezone: formatSettings.timezone
                              }) || '—'}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {!isTrashed ? (
                        <button
                          onClick={() => togglePublished(page.id, !page.published)}
                          disabled={updatingPageId === page.id}
                          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            page.published
                              ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:hover:bg-yellow-900/50'
                              : 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                          } ${updatingPageId === page.id ? 'cursor-wait opacity-70' : ''}`}
                        >
                          {updatingPageId === page.id ? (
                            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth={3}
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V2C5.373 2 0 7.373 0 14h4z"
                              />
                            </svg>
                          ) : page.published ? (
                            <>
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L12 12l4.242-4.242M9.878 9.878L7.5 7.5m4.242 4.242L9.878 14.12"
                                />
                              </svg>
                              Unpublish
                            </>
                          ) : (
                            <>
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                              </svg>
                              Publish
                            </>
                          )}
                        </button>
                      ) : null}

                      {!isTrashed ? (
                        <>
                          {page.published && (
                            <a
                              href={getPreviewPath(page.slug)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-800 transition-colors hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                              title="Preview page"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                              </svg>
                              Preview
                            </a>
                          )}
                          <Link
                            href={`${normalizedEditBasePath}/${page.id}/edit`}
                            className="inline-flex items-center gap-1 rounded-lg bg-violet-100 px-3 py-1.5 text-xs font-medium text-violet-800 transition-colors hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:hover:bg-violet-900/50"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                            Edit
                          </Link>
                        </>
                      ) : null}

                      {!page.system && !isTrashed ? (
                        <button
                          onClick={() => handleTrash(page.id, page.title)}
                          disabled={isPendingTrash}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200 disabled:cursor-wait disabled:opacity-70 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
                        >
                          {isPendingTrash ? (
                            <>
                              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                              Moving...
                            </>
                          ) : (
                            <>
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                              Move to trash
                            </>
                          )}
                        </button>
                      ) : null}

                      {!page.system && isTrashed ? (
                        <>
                          <button
                            onClick={() => handleRestore(page.id, page.title)}
                            disabled={isPendingRestore}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-70 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                          >
                            {isPendingRestore ? (
                              <>
                                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
                                </svg>
                                Restoring...
                              </>
                            ) : (
                              <>
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 11H5m7-7l-7 7 7 7"
                                  />
                                </svg>
                                Restore
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(page.id, page.title)}
                            disabled={isPendingDelete}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-800 transition-colors hover:bg-red-200 disabled:cursor-wait disabled:opacity-70 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
                          >
                            {isPendingDelete ? (
                              <>
                                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
                                </svg>
                                Deleting...
                              </>
                            ) : (
                              <>
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                                Delete permanently
                              </>
                            )}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Desktop Table View - 1025px and above */}
          <div className="hidden min-[1025px]:block overflow-hidden rounded-xl border border-neutral-200 bg-white/80 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/40">
            {/* Table Header */}
            <div className="border-b border-neutral-200 bg-neutral-50/90 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300">
              <div className="grid grid-cols-[2rem_minmax(0,1fr)_7rem_14rem_10rem_10rem] gap-4 items-center">
                <div></div> {/* Checkbox column */}
                <div>Page</div>
                <div>Status</div>
                <div>Dates</div>
                <div>Slug</div>
                <div>Actions</div>
              </div>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-neutral-100/80 dark:divide-neutral-800/80">
              {pages.map((page) => {
                const isSelected = selectedIds.includes(page.id);
                const isTrashed = Boolean(page.trashedAt);
                const isPendingTrash = pendingRowAction?.id === page.id && pendingRowAction.action === 'trash';
                const isPendingRestore = pendingRowAction?.id === page.id && pendingRowAction.action === 'restore';
                const isPendingDelete = pendingRowAction?.id === page.id && pendingRowAction.action === 'delete';

                return (
                  <div
                    key={page.id}
                    className="grid grid-cols-[2rem_minmax(0,1fr)_7rem_14rem_10rem_10rem] gap-4 items-center px-6 py-4 text-sm text-neutral-600 transition-colors hover:bg-neutral-50/70 dark:text-neutral-300 dark:hover:bg-neutral-900/60"
                  >
                    {/* Checkbox */}
                    <div className="col-span-1 flex items-center">
                      {!page.system ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(page.id)}
                          className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900"
                          aria-label={`Select ${page.title}`}
                        />
                      ) : null}
                    </div>

                    {/* Page Title */}
                    <div className="space-y-1">
                      <div className="font-medium text-neutral-800 dark:text-neutral-100 truncate">{page.title}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                        {page.description || 'No description'}
                      </div>
                    </div>

                    {/* Status */}
                    <div className="space-y-1">
                      <div className="flex flex-wrap gap-1">
                        {page.system ? (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                            System
                          </span>
                        ) : null}
                        {isTrashed ? (
                          <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                            Trashed
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              page.published
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                            }`}
                          >
                            {page.published ? 'Published' : 'Draft'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                      <div>
                        Updated{' '}
                        {formatDate(page.updatedAt, {
                          mode: formatSettings.mode,
                          timezone: formatSettings.timezone
                        }) || '—'}
                      </div>
                      <div>
                        Created{' '}
                        {formatDate(page.createdAt, {
                          mode: formatSettings.mode,
                          timezone: formatSettings.timezone
                        }) || '—'}
                      </div>
                      {!isTrashed && page.publishedAt ? (
                        <div>
                          Published{' '}
                          {formatDate(page.publishedAt, {
                            mode: formatSettings.mode,
                            timezone: formatSettings.timezone
                          }) || '—'}
                        </div>
                      ) : null}
                      {isTrashed && page.trashedAt ? (
                        <div>
                          Trashed{' '}
                          {formatDate(page.trashedAt, {
                            mode: formatSettings.mode,
                            timezone: formatSettings.timezone
                          }) || '—'}
                        </div>
                      ) : null}
                    </div>

                    {/* Slug */}
                    <div className="font-mono text-xs text-neutral-500 dark:text-neutral-400 truncate">
                      /{page.slug}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2">
                      {!isTrashed ? (
                        <>
                          {/* Publish/Unpublish */}
                          <button
                            onClick={() => togglePublished(page.id, !page.published)}
                            disabled={updatingPageId === page.id}
                            aria-label={page.published ? 'Unpublish' : 'Publish'}
                            title={page.published ? 'Unpublish' : 'Publish'}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 disabled:cursor-wait disabled:opacity-70 ${
                              updatingPageId === page.id
                                ? 'border border-neutral-200 bg-neutral-100 text-neutral-400 hover:bg-neutral-100 focus:ring-neutral-200 dark:border-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:focus:ring-neutral-700/60'
                                : page.published
                                ? 'border border-yellow-500 bg-yellow-500 text-white hover:bg-yellow-600 focus:ring-yellow-500 dark:border-yellow-500/70 dark:bg-yellow-500/80 dark:hover:bg-yellow-500 dark:focus:ring-yellow-400'
                                : 'border border-green-500 bg-green-500 text-white hover:bg-green-600 focus:ring-green-500 dark:border-green-500/70 dark:bg-green-500/80 dark:hover:bg-green-500 dark:focus:ring-green-400'
                            }`}
                          >
                            {updatingPageId === page.id ? (
                              <FontAwesomeIcon icon={faSpinner} className="h-4 w-4 animate-spin" style={{ color: 'white' }} />
                            ) : page.published ? (
                              <FontAwesomeIcon icon={faLock} className="h-4 w-4" style={{ color: 'white' }} />
                            ) : (
                              <FontAwesomeIcon icon={faGlobe} className="h-4 w-4" style={{ color: 'white' }} />
                            )}
                          </button>

                          {/* Preview (always visible, but grayed out for drafts) */}
                          <button
                            onClick={page.published ? () => window.open(getPreviewPath(page.slug), '_blank') : undefined}
                            disabled={!page.published}
                            aria-label="Preview page"
                            title={page.published ? 'Preview page' : 'Preview unavailable for drafts'}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 ${
                              page.published
                                ? 'border border-blue-500 bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500 dark:border-blue-500/70 dark:bg-blue-500/80 dark:hover:bg-blue-500 dark:focus:ring-blue-400'
                                : 'border border-neutral-300 bg-neutral-100 text-neutral-400 cursor-not-allowed dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-500'
                            }`}
                          >
                            <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
                          </button>

                          {/* Edit */}
                          <Link
                            href={`${normalizedEditBasePath}/${page.id}/edit`}
                            aria-label="Edit page"
                            title="Edit page"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-500 bg-violet-500 text-white transition hover:bg-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-white dark:border-violet-500/70 dark:bg-violet-500/80 dark:hover:bg-violet-500 dark:focus:ring-violet-400 dark:focus:ring-offset-neutral-900"
                          >
                            <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                          </Link>

                          {/* Trash (always visible, but grayed out for system pages) */}
                          <button
                            onClick={!page.system ? () => handleTrash(page.id, page.title) : undefined}
                            disabled={page.system || isPendingTrash}
                            aria-label={page.system ? 'Cannot delete system page' : 'Move to trash'}
                            title={page.system ? 'Cannot delete system page' : 'Move to trash'}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 ${
                              page.system
                                ? 'border border-neutral-300 bg-neutral-100 text-neutral-400 cursor-not-allowed dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-500'
                                : isPendingTrash
                                ? 'border border-neutral-200 bg-neutral-100 text-neutral-400 hover:bg-neutral-100 focus:ring-neutral-200 dark:border-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:focus:ring-neutral-700/60 cursor-wait'
                                : 'border border-red-500 bg-red-500 text-white hover:bg-red-600 focus:ring-red-500 dark:border-red-500/70 dark:bg-red-500/80 dark:hover:bg-red-500 dark:focus:ring-red-400'
                            }`}
                          >
                            {isPendingTrash ? (
                              <FontAwesomeIcon icon={faSpinner} className="h-4 w-4 animate-spin" />
                            ) : (
                              <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                            )}
                          </button>
                        </>
                      ) : (
                        /* Trashed actions */
                        !page.system && (
                          <>
                            {/* Restore */}
                            <button
                              onClick={() => handleRestore(page.id, page.title)}
                              disabled={isPendingRestore}
                              aria-label="Restore"
                              title="Restore"
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 disabled:cursor-wait disabled:opacity-70 ${
                                isPendingRestore
                                  ? 'border border-neutral-200 bg-neutral-100 text-neutral-400 hover:bg-neutral-100 focus:ring-neutral-200 dark:border-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:focus:ring-neutral-700/60'
                                  : 'border border-blue-500 bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500 dark:border-blue-500/70 dark:bg-blue-500/80 dark:hover:bg-blue-500 dark:focus:ring-blue-400'
                              }`}
                            >
                              {isPendingRestore ? (
                                <FontAwesomeIcon icon={faSpinner} className="h-4 w-4 animate-spin" />
                              ) : (
                                <FontAwesomeIcon icon={faUndo} className="h-4 w-4" />
                              )}
                            </button>

                            {/* Delete Permanently */}
                            <button
                              onClick={() => handlePermanentDelete(page.id, page.title)}
                              disabled={isPendingDelete}
                              aria-label="Delete permanently"
                              title="Delete permanently"
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 disabled:cursor-wait disabled:opacity-70 ${
                                isPendingDelete
                                  ? 'border border-neutral-200 bg-neutral-100 text-neutral-400 hover:bg-neutral-100 focus:ring-neutral-200 dark:border-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:focus:ring-neutral-700/60'
                                  : 'border border-red-500 bg-red-500 text-white hover:bg-red-600 focus:ring-red-500 dark:border-red-500/70 dark:bg-red-500/80 dark:hover:bg-red-500 dark:focus:ring-red-400'
                              }`}
                            >
                              {isPendingDelete ? (
                                <FontAwesomeIcon icon={faSpinner} className="h-4 w-4 animate-spin" />
                              ) : (
                                <FontAwesomeIcon icon={faTrashCan} className="h-4 w-4" />
                              )}
                            </button>
                          </>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : isLoading ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          Loading pages...
        </div>
      ) : (
        <div className="py-12 text-center">
          <svg className="mx-auto h-12 w-12 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <h3 className="mt-4 text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {hasSearch
              ? `No pages match "${search.trim()}"`
              : normalizedStatus === 'published'
                ? 'No published pages yet'
                : normalizedStatus === 'draft'
                  ? 'No drafts in progress'
                  : 'No pages'}
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {hasSearch
              ? 'Try adjusting your search or clearing filters to see more results.'
              : normalizedStatus === 'all'
                ? 'Get started by creating your first page.'
                : 'Try switching filters or add a new page to populate this list.'}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            {hasSearch ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Clear search
              </button>
            ) : null}
            {normalizedStatus !== 'all' ? (
              <button
                type="button"
                onClick={() => setStatus('ALL')}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Reset filter
              </button>
            ) : null}
              <Link
                href={computedNewItemHref}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add
            </Link>
          </div>
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        totalItems={totalCount}
        itemsPerPage={pageSize}
        nextCursor={nextCursor}
        onNextWithCursor={(cursor) => fetchPage(currentPage + 1, false, cursor)}
      />
    </div>
  );
}

