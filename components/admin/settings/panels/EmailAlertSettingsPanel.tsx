"use client";

import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope } from '@fortawesome/free-solid-svg-icons';
import { showToast } from '@/components/ui/Toast';
import {
  ADMIN_ALERT_EMAIL_OPTIONS,
  ADMIN_ALERT_EMAIL_TYPES_KEY,
  parseActionPatternList
} from '../notificationSettings';

export function EmailAlertSettingsPanel() {
  const [loading, setLoading] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const loadValue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/settings?key=${encodeURIComponent(ADMIN_ALERT_EMAIL_TYPES_KEY)}`);
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

  const toggleType = useCallback(
    async (value: string) => {
      if (loading) return;
      const wasSelected = selectedTypes.includes(value);
      const next = wasSelected ? selectedTypes.filter((entry) => entry !== value) : [...selectedTypes, value];

      setSelectedTypes(next);
      setLoading(true);
      try {
        const response = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: ADMIN_ALERT_EMAIL_TYPES_KEY, value: JSON.stringify(next) })
        });
        if (!response.ok) throw new Error('Request failed');
        showToast('Admin alert email settings updated', 'success');
      } catch {
        setSelectedTypes(selectedTypes);
        showToast('Failed to update admin alert email settings', 'error');
      } finally {
        setLoading(false);
      }
    },
    [loading, selectedTypes]
  );

  const allSelected = ADMIN_ALERT_EMAIL_OPTIONS.every((opt) => selectedTypes.includes(opt.value));

  const toggleAll = useCallback(async () => {
    if (loading) return;
    const next = allSelected ? [] : ADMIN_ALERT_EMAIL_OPTIONS.map((opt) => opt.value);
    setSelectedTypes(next);
    setLoading(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: ADMIN_ALERT_EMAIL_TYPES_KEY, value: JSON.stringify(next) })
      });
      if (!response.ok) throw new Error('Request failed');
      showToast('Admin alert email settings updated', 'success');
    } catch {
      void loadValue();
      showToast('Failed to update admin alert email settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [allSelected, loading, loadValue]);

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-slate-100 p-2 text-slate-700 dark:bg-neutral-800 dark:text-neutral-200">
            <FontAwesomeIcon icon={faEnvelope} className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium">Admin alert emails</div>
            <div className="text-sm text-slate-600 dark:text-neutral-400">
              Choose which billing and admin events trigger emails to the support inbox. Requires the{' '}
              <code className="text-xs bg-slate-100 dark:bg-neutral-800 px-1 rounded">SEND_ADMIN_BILLING_EMAILS=true</code> environment
              variable.
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
          disabled={loading}
          onClick={() => {
            void toggleAll();
          }}
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        {ADMIN_ALERT_EMAIL_OPTIONS.map((option) => {
          const enabled = selectedTypes.includes(option.value);
          return (
            <label
              key={option.value}
              className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={enabled}
                disabled={loading}
                onChange={() => {
                  void toggleType(option.value);
                }}
              />
              <div>
                <div className="text-sm font-medium">{option.label}</div>
                <div className="text-sm text-slate-600 dark:text-neutral-400">{option.description}</div>
              </div>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
