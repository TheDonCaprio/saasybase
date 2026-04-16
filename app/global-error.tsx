"use client";

import React from 'react';
import ChunkLoadRecovery from '../components/ui/ChunkLoadRecovery';
import { isChunkLoadError } from '../lib/chunk-error';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isChunkError = isChunkLoadError(error);

  return (
    <html>
      <body className="min-h-screen bg-white text-slate-900 dark:bg-neutral-950 dark:text-neutral-100">
        <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center p-6">
          {isChunkError ? (
            <ChunkLoadRecovery error={error} embedded onRetry={() => window.location.reload()} />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/60">
              <h1 className="text-lg font-semibold">Something went wrong</h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-neutral-300">
                An unexpected error occurred while loading the application.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => reset()}
                  className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-always-white transition-colors hover:bg-blue-700"
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
          )}
        </main>
      </body>
    </html>
  );
}
