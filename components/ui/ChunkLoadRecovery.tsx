"use client";

import React, { useEffect, useState } from 'react';
import { getErrorMessage, isChunkLoadError } from '../../lib/chunk-error';

type ChunkLoadRecoveryProps = {
  error?: unknown;
  embedded?: boolean;
  onRetry?: () => void;
};

function reloadPage() {
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

export default function ChunkLoadRecovery({ error, embedded = false, onRetry }: ChunkLoadRecoveryProps) {
  const [detectedError, setDetectedError] = useState<unknown>(undefined);

  useEffect(() => {
    if (error) return;

    const onWindowError = (event: ErrorEvent) => {
      const nextError = event.error ?? event.message;
      if (isChunkLoadError(nextError)) {
        setDetectedError(nextError);
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) {
        setDetectedError(event.reason);
      }
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [error]);

  const effectiveError = error ?? detectedError;

  if (!effectiveError || !isChunkLoadError(effectiveError)) {
    return null;
  }

  const detail = getErrorMessage(effectiveError);
  const containerClass = embedded
    ? 'rounded-2xl border border-amber-300 bg-amber-50 p-6 text-slate-900 shadow-sm dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-neutral-100'
    : 'fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-lg rounded-2xl border border-amber-300 bg-white/95 p-5 text-slate-900 shadow-2xl backdrop-blur dark:border-amber-400/30 dark:bg-neutral-950/95 dark:text-neutral-100';

  return (
    <div className={containerClass} role="alert" aria-live="assertive">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold">Update available</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-neutral-300">
              Part of the app failed to load. Reload the page to fetch the latest files and continue.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetry ?? reloadPage}
              className="inline-flex items-center rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={() => setDetectedError(undefined)}
              className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
            >
              Dismiss
            </button>
          </div>
          {detail ? (
            <p className="text-xs text-slate-500 dark:text-neutral-400 break-words">
              {detail}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
