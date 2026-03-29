'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { showToast } from './Toast';

type DemoReadOnlyNoticeProps = {
  scope: 'admin' | 'dashboard';
};

const DISMISS_KEY = 'saasybase-demo-readonly-notice-dismissed';
const PATCHED_FETCH_KEY = '__saasybase_demo_readonly_fetch_patched';
const LAST_TOAST_AT_KEY = '__saasybase_demo_readonly_last_toast_at';
const DISMISS_EVENT = 'saasybase-demo-readonly-dismiss-changed';

function subscribeToDismissed(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleChange = () => callback();

  window.addEventListener('storage', handleChange);
  window.addEventListener(DISMISS_EVENT, handleChange);

  return () => {
    window.removeEventListener('storage', handleChange);
    window.removeEventListener(DISMISS_EVENT, handleChange);
  };
}

function getDismissedSnapshot() {
  if (typeof window === 'undefined') {
    return true;
  }

  return window.sessionStorage.getItem(DISMISS_KEY) === '1';
}

function getScopeCopy(scope: 'admin' | 'dashboard') {
  if (scope === 'admin') {
    return {
      title: 'Admin Demo: Read-Only Mode',
      subtitle:
        'You can explore all admin screens safely, but create, update, and delete actions are blocked in this demo environment.',
    };
  }

  return {
    title: 'Product Demo: Read-Only Mode',
    subtitle:
      'You can navigate the full dashboard, but any action that changes data is blocked in this demo environment.',
  };
}

export function DemoReadOnlyNotice({ scope }: DemoReadOnlyNoticeProps) {
  const copy = useMemo(() => getScopeCopy(scope), [scope]);
  const dismissed = useSyncExternalStore(subscribeToDismissed, getDismissedSnapshot, () => true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const win = window as unknown as Record<string, unknown>;
    if (win[PATCHED_FETCH_KEY]) return;

    const originalFetch = window.fetch.bind(window);
    win[PATCHED_FETCH_KEY] = true;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      if (response.status === 403 && response.headers.get('X-Demo-Read-Only') === 'true') {
        const now = Date.now();
        const lastToastAt = typeof win[LAST_TOAST_AT_KEY] === 'number' ? (win[LAST_TOAST_AT_KEY] as number) : 0;

        if (now - lastToastAt > 1200) {
          showToast('Demo mode is read-only. This action is intentionally blocked.', 'info');
          win[LAST_TOAST_AT_KEY] = now;
        }
      }

      return response;
    };
  }, []);

  if (dismissed) return null;

  return (
    <div className="fixed inset-0 z-[100050] flex items-center justify-center bg-black/55 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-neutral-100">{copy.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-neutral-300">{copy.subtitle}</p>

        <div className="mt-4 rounded-xl border border-indigo-200/70 bg-indigo-50/80 p-3 text-sm text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-100">
          Tip: Look around freely. Mutating requests return a safe 403 response with no data changes.
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.sessionStorage.setItem(DISMISS_KEY, '1');
                window.dispatchEvent(new Event(DISMISS_EVENT));
              }
            }}
          >
            Continue Exploring
          </button>
        </div>
      </div>
    </div>
  );
}
