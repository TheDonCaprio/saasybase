"use client";

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell } from '@fortawesome/free-solid-svg-icons';
import { showToast } from '@/components/ui/Toast';
import {
  ADMIN_ACTION_NOTIFICATION_ACTIONS_KEY,
  ADMIN_ACTION_NOTIFICATION_OPTIONS,
  parseActionPatternList,
} from '../notificationSettings';

export function AdminActionNotificationPanel() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [draftPatterns, setDraftPatterns] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadValue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/settings?key=${encodeURIComponent(ADMIN_ACTION_NOTIFICATION_ACTIONS_KEY)}`);
      if (!res.ok) {
        setSelectedPatterns([]);
        return;
      }

      const payload = await res.json();
      setSelectedPatterns(parseActionPatternList(payload?.value));
    } catch {
      setSelectedPatterns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadValue();
  }, [loadValue]);

  useEffect(() => {
    if (isModalOpen) {
      setDraftPatterns(selectedPatterns);
    }
  }, [isModalOpen, selectedPatterns]);

  const toggleDraftPattern = useCallback((pattern: string) => {
    setDraftPatterns((prev) => (prev.includes(pattern) ? prev.filter((entry) => entry !== pattern) : [...prev, pattern]));
  }, []);

  const saveSelection = useCallback(async () => {
    if (saving) return;

    setSaving(true);
    const previousPatterns = selectedPatterns;
    setSelectedPatterns(draftPatterns);

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: ADMIN_ACTION_NOTIFICATION_ACTIONS_KEY, value: JSON.stringify(draftPatterns) }),
      });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      showToast('Admin action notification preferences updated', 'success');
      setIsModalOpen(false);
    } catch {
      setSelectedPatterns(previousPatterns);
      setDraftPatterns(previousPatterns);
      showToast('Failed to update admin action notifications', 'error');
    } finally {
      setSaving(false);
    }
  }, [draftPatterns, saving, selectedPatterns]);

  const modal = isModalOpen && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 z-[70000] flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm"
          role="presentation"
          onClick={() => {
            if (!saving) setIsModalOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-action-alerts-modal-title"
            className="w-full max-w-3xl rounded-[var(--theme-surface-radius)] border border-slate-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="admin-action-alerts-modal-title" className="text-lg font-semibold text-slate-900 dark:text-neutral-100">
                  Admin action alerts
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
                  Choose which admin action groups should trigger in-app notifications for other admins.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                aria-label="Close admin action alerts modal"
              >
                Close
              </button>
            </div>

            <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
              {ADMIN_ACTION_NOTIFICATION_OPTIONS.map((option) => {
                const enabled = draftPatterns.includes(option.pattern);

                return (
                  <label
                    key={option.pattern}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 flex items-start gap-3 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-200"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={enabled}
                      disabled={saving}
                      onChange={() => toggleDraftPattern(option.pattern)}
                    />
                    <div>
                      <div className="text-sm font-medium">{option.label}</div>
                      <div className="text-sm text-slate-600 dark:text-neutral-400">{option.description}</div>
                    </div>
                  </label>
                );
              })}
            </fieldset>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveSelection()}
                disabled={saving || loading}
                className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400"
              >
                {saving ? 'Saving…' : 'Save alerts'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md bg-slate-100 p-2 text-slate-700 dark:bg-neutral-800 dark:text-neutral-200">
              <FontAwesomeIcon icon={faBell} className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium">Admin action alerts</div>
              <div className="text-sm text-slate-600 dark:text-neutral-400">
                Choose which admin action groups should trigger in-app notifications for other admins.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            disabled={loading || saving}
            className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Configure alerts
          </button>
        </div>
      </div>

      {modal}
    </div>
  );
}