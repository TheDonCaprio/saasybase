import { useEffect, useState, useRef, useCallback } from 'react';
import type { SetStateAction } from 'react';
import { showToast } from '../ui/Toast';
import { asRecord } from '../../lib/runtime-guards';

type Filters = Record<string, string | number | boolean | undefined>;

interface UsePaginatedListOptions<T> {
  basePath: string; // e.g. '/api/admin/payments'
  initialItems?: T[];
  initialTotalCount?: number;
  initialPage?: number;
  itemsPerPage?: number;
  // optional reactive filter bag; when the `filters` object identity or values change, hook will refetch page 1
  filters?: Filters;
  // whether server expects items to be under a named key like 'payments' or 'items'
  itemsKey?: string; // default: undefined -> assume returned payload is { items: [] } or array
}

export function usePaginatedList<T = unknown>({
  basePath,
  initialItems = [],
  initialTotalCount = 0,
  initialPage = 1,
  itemsPerPage = 50,
  filters = {},
  itemsKey
}: UsePaginatedListOptions<T>) {
  const [items, _setItems] = useState<T[]>(initialItems);
  const [totalCount, setTotalCount] = useState<number>(initialTotalCount);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<unknown>(null);

  // Keep a stable ref to filters to compare
  const lastFiltersRef = useRef<string>(JSON.stringify(filters || {}));
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const buildUrl = useCallback((opts: { page?: number; cursor?: string | null; append?: boolean } = {}) => {
    const { page = 1, cursor = null, append = false } = opts;
    const params = new URLSearchParams();

    if (cursor) {
      params.append('cursor', cursor);
      params.append('limit', String(itemsPerPage));
      // cursor-based fetches should avoid COUNT
      params.append('count', 'false');
    } else {
      params.append('page', String(page));
      params.append('limit', String(itemsPerPage));
      if (page > 1 || append) params.append('count', 'false');
    }

    // append filters
    Object.entries(filters || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      params.append(k, String(v));
    });

    return `${basePath}?${params.toString()}`;
  }, [basePath, filters, itemsPerPage]);

  const parsePayload = useCallback(async (res: Response) => {
    // try JSON
    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      void err;
      return { items: [], totalCount: 0, nextCursor: null, raw: null };
    }

    // support payloads where items live under 'items' or named key or at root array
    let parsedItems: T[] = [];
    let parsedTotal: number | undefined = undefined;
    let parsedNext: string | null = null;

    if (Array.isArray(json)) {
      parsedItems = json as T[];
    } else {
      const obj = asRecord(json) || {};
      const maybeItems = itemsKey && Array.isArray(obj[itemsKey]) ? obj[itemsKey]
        : Array.isArray(obj.items) ? obj.items
        : Array.isArray(obj.tickets) ? obj.tickets
        : Array.isArray(obj.payments) ? obj.payments
        : Array.isArray(obj.subscriptions) ? obj.subscriptions
        : Array.isArray(obj.notifications) ? obj.notifications
        : undefined;

      parsedItems = Array.isArray(maybeItems) ? (maybeItems as T[]) : [];

      parsedTotal = typeof obj.totalCount === 'number' ? obj.totalCount : (typeof obj.total === 'number' ? obj.total : undefined);
      parsedNext = typeof obj.nextCursor === 'string' ? obj.nextCursor : (typeof obj.next === 'string' ? obj.next : null);
    }

    return { items: parsedItems, totalCount: parsedTotal, nextCursor: parsedNext, raw: json };
  }, [itemsKey]);

  const fetchPage = useCallback(async (page: number, append = false, cursor?: string | null) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    try {
      const url = buildUrl({ page, cursor, append });
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        showToast('Failed to fetch list', 'error');
        return null;
      }

      const { items: fetchedItems, totalCount: fetchedTotal, nextCursor: fetchedNext, raw } = await parsePayload(res);

      if (append) {
        _setItems((prev) => [...prev, ...fetchedItems]);
      } else {
        _setItems(fetchedItems);
      }

      // SAFETY/FALLBACK: sometimes keyset cursor-based fetches can return an
      // empty page due to subtle ordering differences (nullable sort fields,
      // provider quirks, etc). If we requested using a cursor and got zero
      // items, try a single offset-based retry (same page without cursor) to
      // avoid showing a blank page to the user.
      if (cursor && Array.isArray(fetchedItems) && fetchedItems.length === 0) {
        try {
          const fallbackUrl = buildUrl({ page, cursor: null, append });
          const fallbackRes = await fetch(fallbackUrl, { signal: controller.signal });
          if (fallbackRes.ok) {
            const { items: fbItems, totalCount: fbTotal, nextCursor: fbNext, raw: fbRaw } = await parsePayload(fallbackRes);
            // Replace items with fallback results
            if (append) {
              _setItems((prev) => [...prev, ...fbItems]);
            } else {
              _setItems(fbItems);
            }
            if (typeof fbTotal === 'number') setTotalCount(fbTotal);
            setNextCursor(fbNext ?? null);
            setCurrentPage(page);
            setLastResponse(fbRaw);
            return { items: fbItems, totalCount: fbTotal, nextCursor: fbNext, raw: fbRaw };
          }
        } catch (err) {
          // swallow fallback errors; original branch will proceed to return
          // the (empty) fetchedItems below so UI shows a consistent state.
          void err;
        }
      }

      if (typeof fetchedTotal === 'number') setTotalCount(fetchedTotal);
      setNextCursor(fetchedNext ?? null);
      setCurrentPage(page);
      setLastResponse(raw);

      return { items: fetchedItems, totalCount: fetchedTotal, nextCursor: fetchedNext, raw };
    } catch (err) {
      const errorName = typeof err === 'object' && err !== null && 'name' in err ? String((err as { name?: unknown }).name) : '';
      const isAbortError = (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') || errorName === 'AbortError';
      if (isAbortError) {
        return null;
      }
      console.error('usePaginatedList fetch error', err);
      showToast('Error fetching list', 'error');
      return null;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsLoading(false);
      }
    }
  }, [buildUrl, parsePayload]);

  const fetchNext = useCallback(async () => {
    if (!nextCursor) return null;
    return fetchPage(currentPage + 1, true, nextCursor);
  }, [nextCursor, currentPage, fetchPage]);

  const refresh = useCallback(() => fetchPage(currentPage, false), [currentPage, fetchPage]);

  // React to filters change: if filters change, reset to page 1 and fetch
  useEffect(() => {
    const cur = JSON.stringify(filters || {});
    if (cur !== lastFiltersRef.current) {
      lastFiltersRef.current = cur;
      // clear current view immediately to avoid showing stale placeholders
      setIsLoading(true);
      _setItems([]);
      setTotalCount(0);
      setCurrentPage(1);
      setNextCursor(null);
      setLastResponse(null);
      // fetch first page
      fetchPage(1, false, null).finally(() => {
        // fetchPage will toggle isLoading when it runs, but ensure it's cleared if fetchPage
        // resolves without touching isLoading due to errors. This is defensive.
        // Note: fetchPage sets isLoading internally, so this is just an extra guard.
        // No-op if isLoading already false.
      });
    }
  // intentionally watch stringified filters to trigger when values change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters || {})]);

  // Expose a stable setItems wrapper so consumers can safely include it in effect deps.
  const setItems = useCallback((v: SetStateAction<T[]>) => {
    _setItems(v);
  }, [_setItems]);

  return {
    items,
    setItems,
    totalCount,
    currentPage,
    isLoading,
    nextCursor,
    fetchPage,
    fetchNext,
    refresh,
    buildUrl,
    lastResponse
  } as const;
}

export default usePaginatedList;
