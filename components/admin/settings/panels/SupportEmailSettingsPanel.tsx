"use client";

import { useCallback, useEffect, useState } from 'react';
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
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

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
          body: JSON.stringify({ key: SUPPORT_EMAIL_NOTIFICATION_TYPES_KEY, value: JSON.stringify(next) })
        });
        if (!response.ok) throw new Error('Request failed');
        showToast('Support email settings updated', 'success');
      } catch {
        setSelectedTypes(selectedTypes);
        showToast('Failed to update support email settings', 'error');
      } finally {
        setLoading(false);
      }
    },
    [loading, selectedTypes]
  );

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-slate-100 p-2 text-slate-700 dark:bg-neutral-800 dark:text-neutral-200">
            <FontAwesomeIcon icon={faEnvelope} className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium">Support emails</div>
            <div className="text-sm text-slate-600 dark:text-neutral-400">Control which support-related emails are sent automatically.</div>
          </div>
        </div>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        {SUPPORT_EMAIL_OPTIONS.map((option) => {
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
