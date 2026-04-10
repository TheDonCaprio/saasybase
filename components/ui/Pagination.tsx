'use client';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
  // Optional progressive enhancement: if server provides a keyset `nextCursor`,
  // the parent can supply it here along with a handler to fetch via cursor.
  nextCursor?: string | null;
  onNextWithCursor?: (cursor: string) => void;
}

export function Pagination({ 
  currentPage, 
  totalPages, 
  onPageChange, 
  totalItems, 
  itemsPerPage,
  nextCursor,
  onNextWithCursor
}: PaginationProps) {
  // If there is only one page and no server-provided cursor for progressive
  // enhancement, hide the pagination. If the server provided a `nextCursor`,
  // still render controls to allow progressive "Load next" behavior.
  const totalPagesFinite = Number.isFinite(totalPages) ? totalPages : NaN;
  if ((Number.isFinite(totalPagesFinite) && totalPagesFinite <= 1) && !nextCursor) return null;

  // Compute a safe total pages fallback when server omitted totalItems (cursor flows).
  const safeTotalPages = Number.isFinite(totalPagesFinite) ? totalPagesFinite : (currentPage + (nextCursor ? 1 : 0));

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, Number.isFinite(totalItems) ? totalItems : currentPage * itemsPerPage);

  const getVisiblePages = () => {
    const delta = 2;
    const range: Array<number | string> = [];
    const rangeWithDots: Array<number | string> = [];

    const last = safeTotalPages;

    for (
      let i = Math.max(2, currentPage - delta);
      i <= Math.min(last - 1, currentPage + delta);
      i++
    ) {
      range.push(i);
    }

    if (currentPage - delta > 2) {
      rangeWithDots.push(1, '...');
    } else {
      rangeWithDots.push(1);
    }

    rangeWithDots.push(...range);

    if (currentPage + delta < last - 1) {
      rangeWithDots.push('...', last);
    } else {
      rangeWithDots.push(last);
    }

    return rangeWithDots;
  };

  return (
    <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
      {/* Items info */}
      <div className="w-full text-center text-xs text-slate-500 sm:w-auto sm:text-left sm:text-sm dark:text-neutral-400">
        Showing {startItem}-{endItem} of {totalItems} items
      </div>

      {/* Pagination controls */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-end">
        {/* Previous button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="rounded-full border border-slate-200 px-2.5 py-1 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Previous
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {getVisiblePages().map((page, index) => (
            <span key={index}>
              {page === '...' ? (
                <span className="px-1.5 py-1 text-[13px] text-slate-400 dark:text-neutral-500">...</span>
              ) : (
                <button
                  onClick={() => onPageChange(page as number)}
                  className={`rounded-full px-2.5 py-1 text-[13px] font-medium transition-colors ${
                    currentPage === page
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800'
                  }`}
                >
                  {page}
                </button>
              )}
            </span>
          ))}
        </div>

        {/* Next button — will call onNextWithCursor(cursor) if provided and cursor exists, otherwise falls back to page-based change */}
        <button
          onClick={() => {
            if (nextCursor && onNextWithCursor) {
              onNextWithCursor(nextCursor);
            } else {
              onPageChange(currentPage + 1);
            }
          }}
          // allow next when either there is a nextCursor (progressive) or currentPage < safeTotalPages
          disabled={!(nextCursor || currentPage < safeTotalPages)}
          title={nextCursor ? 'Uses server cursor for progressive fetch' : undefined}
          className="rounded-full border border-slate-200 px-2.5 py-1 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Next
        </button>
      </div>
    </div>
  );
}
