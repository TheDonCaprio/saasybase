"use client";

import { useEffect, useState } from 'react';
import { showToast } from '../../../ui/Toast';
import {
  captureSentryException,
  flushSentry,
  isSentryDevelopmentCaptureEnabled,
  isSentryRuntimeEnabled,
} from '../../../../lib/sentry';

export function SentrySmokeTestPanel() {
  const [sendingServer, setSendingServer] = useState(false);
  const [sendingClient, setSendingClient] = useState(false);
  const [devCaptureEnabled, setDevCaptureEnabled] = useState(false);

  const clientSentryEnabled = isSentryRuntimeEnabled('client');

  useEffect(() => {
    setDevCaptureEnabled(isSentryDevelopmentCaptureEnabled());
  }, []);

  const triggerServerTest = async (level: 'warning' | 'error') => {
    if (sendingServer) return;
    setSendingServer(true);
    try {
      const response = await fetch('/api/admin/sentry-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string; eventId?: string; flushed?: boolean };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to queue server smoke test');
      }

      showToast(payload.message || `Server smoke test queued${payload.eventId ? ` (${payload.eventId})` : ''}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to queue server smoke test', 'error');
    } finally {
      setSendingServer(false);
    }
  };

  const triggerClientTest = async () => {
    if (sendingClient) return;
    if (!clientSentryEnabled) {
      showToast('Client-side Sentry is not enabled. Set NEXT_PUBLIC_SENTRY_DSN to use the browser smoke test.', 'error');
      return;
    }

    setSendingClient(true);
    try {
      const eventId = await captureSentryException(new Error(`Sentry smoke test client exception at ${new Date().toISOString()}`), {
        tags: {
          source: 'admin-settings',
          surface: 'browser-smoke-test',
        },
        extras: {
          href: typeof window !== 'undefined' ? window.location.href : 'unknown',
        },
      });

      const flushed = await flushSentry(3000);

      showToast(
        eventId
          ? `Browser smoke test sent to Sentry${flushed ? '' : ' (flush pending)'}. Event ID: ${eventId}`
          : 'Browser smoke test queued in Sentry',
        'success'
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to queue browser smoke test', 'error');
    } finally {
      setSendingClient(false);
    }
  };

  return (
    <div className="space-y-4 rounded-[var(--theme-surface-radius)] border border-slate-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900/60">
      <div className="space-y-2">
        <h3 className="text-lg font-medium text-slate-900 dark:text-neutral-100">Sentry smoke tests</h3>
        <p className="text-sm text-slate-600 dark:text-neutral-400">
          Use these controls to verify Sentry capture without shell scripts. The server test exercises logger fan-out; the browser test sends a client exception directly.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-slate-50/70 p-4 dark:border-neutral-700 dark:bg-neutral-900/40">
          <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Server logger path</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-neutral-400">
            Sends a warning or error through the server logger so you can verify logger fan-out and SystemLog persistence together.
          </p>
          <p className="mt-3 text-xs text-slate-500 dark:text-neutral-400">
            Development fan-out: {devCaptureEnabled ? 'enabled' : 'disabled'}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void triggerServerTest('warning')}
              disabled={sendingServer}
              className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              {sendingServer ? 'Sending…' : 'Send server warning'}
            </button>
            <button
              type="button"
              onClick={() => void triggerServerTest('error')}
              disabled={sendingServer}
              className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-red-500 dark:text-white dark:hover:bg-red-400"
            >
              {sendingServer ? 'Sending…' : 'Send server error'}
            </button>
          </div>
        </div>

        <div className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-slate-50/70 p-4 dark:border-neutral-700 dark:bg-neutral-900/40">
          <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Browser capture path</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-neutral-400">
            Sends a client-side exception directly from this browser session. Requires <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] dark:bg-neutral-800">NEXT_PUBLIC_SENTRY_DSN</code>.
          </p>
          <p className="mt-3 text-xs text-slate-500 dark:text-neutral-400">
            Client capture: {clientSentryEnabled ? 'enabled' : 'disabled'}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void triggerClientTest()}
              disabled={sendingClient}
              className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingClient ? 'Sending…' : 'Send browser exception'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}