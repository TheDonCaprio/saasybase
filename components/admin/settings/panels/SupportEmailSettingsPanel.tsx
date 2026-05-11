"use client";

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope } from '@fortawesome/free-solid-svg-icons';
import { showToast } from '@/components/ui/Toast';
import {
  SUPPORT_EMAIL_NOTIFICATION_TYPES_KEY,
  SUPPORT_EMAIL_OPTIONS,
  parseActionPatternList
} from '../notificationSettings';

export function SupportEmailSettingsPanel() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [draftTypes, setDraftTypes] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadValue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/settings?key=${encodeURIComponent(SUPPORT_EMAIL_NOTIFICATION_TYPES_KEY)}`);
      if (!res.ok) {
        setSelectedTypes([]);
        return;
      }
      const payload = await res.json();
      setSelectedTypes(parseActionPatternList(payload?.value));
    } catch {
      setSelectedTypes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadValue();
  }, [loadValue]);

  useEffect(() => {
    if (isModalOpen) {
      setDraftTypes(selectedTypes);
    }
  }, [isModalOpen, selectedTypes]);

  const toggleDraftType = useCallback((value: string) => {
    setDraftTypes((prev) => (prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value]));
  }, []);

  const saveSelection = useCallback(async () => {
    if (saving) return;

    setSaving(true);
    const previous = selectedTypes;
    setSelectedTypes(draftTypes);

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: SUPPORT_EMAIL_NOTIFICATION_TYPES_KEY, value: JSON.stringify(draftTypes) })
      });
      if (!response.ok) throw new Error('Request failed');
      showToast('Support email settings updated', 'success');
      setIsModalOpen(false);
    } catch {
      setSelectedTypes(previous);
      setDraftTypes(previous);
      showToast('Failed to update support email settings', 'error');
    } finally {
      setSaving(false);
    }
  }, [draftTypes, saving, selectedTypes]);

  const modal = isModalOpen && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 z-[70000] flex items-center justify-center bg-black/60 px-4 py-8"
          role="presentation"
          onClick={() => {
            if (!saving) setIsModalOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-email-modal-title"
            className="w-full max-w-3xl rounded-[var(--theme-surface-radius)] border border-slate-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="support-email-modal-title" className="text-lg font-semibold text-slate-900 dark:text-neutral-100">
                  Support emails
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
                  Control which support-related emails are sent automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Close
              </button>
            </div>

            <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
              {SUPPORT_EMAIL_OPTIONS.map((option) => {
                const enabled = draftTypes.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 flex items-start gap-3 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-200"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={enabled}
                      disabled={saving}
                      onChange={() => toggleDraftType(option.value)}
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
            <FontAwesomeIcon icon={faEnvelope} className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium">Support emails</div>
            <div className="text-sm text-slate-600 dark:text-neutral-400">Control which support-related emails are sent automatically.</div>
          </div>
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            disabled={loading || saving}
            className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Configure emails
          </button>
        </div>
      </div>

      {modal}
    </div>
  );
}
