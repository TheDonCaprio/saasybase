"use client";

import React, { useEffect } from 'react';
import ChunkLoadRecovery from '../components/ui/ChunkLoadRecovery';
import { isChunkLoadError } from '../lib/chunk-error';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  if (isChunkLoadError(error)) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-2xl items-center justify-center p-6">
        <ChunkLoadRecovery error={error} embedded onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-2xl items-center justify-center p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/60">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Something went wrong</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-neutral-300">
          An unexpected error occurred while loading this page.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 dark:border-neutral-700 dark:text-neutral-200"
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
}
