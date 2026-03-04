"use client";

import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell } from '@fortawesome/free-solid-svg-icons';
import { showToast } from '@/components/ui/Toast';
import {
  ADMIN_ACTION_NOTIFICATION_ACTIONS_KEY,
  ADMIN_ACTION_NOTIFICATION_OPTIONS,
  parseActionPatternList
} from '../notificationSettings';

export function AdminActionNotificationPanel() {
  const [loading, setLoading] = useState(false);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);

  const loadValue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/settings?key=${encodeURIComponent(ADMIN_ACTION_NOTIFICATION_ACTIONS_KEY)}`);
      if (res.ok) {
        const payload = await res.json();
        setSelectedPatterns(parseActionPatternList(payload?.value));
      } else {
        setSelectedPatterns([]);
      }
    } catch {
      setSelectedPatterns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadValue();
  }, [loadValue]);

  const togglePattern = useCallback(
    async (pattern: string) => {
      if (loading) return;
      const wasSelected = selectedPatterns.includes(pattern);
      const nextPatterns = wasSelected ? selectedPatterns.filter((entry) => entry !== pattern) : [...selectedPatterns, pattern];

      const prev = selectedPatterns;
      setSelectedPatterns(nextPatterns);
      setLoading(true);
      try {
        const response = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: ADMIN_ACTION_NOTIFICATION_ACTIONS_KEY, value: JSON.stringify(nextPatterns) })
        });
        if (!response.ok) throw new Error('Request failed');
        showToast('Admin action notification preferences updated', 'success');
      } catch {
        setSelectedPatterns(prev);
        showToast('Failed to update admin action notifications', 'error');
      } finally {
        setLoading(false);
      }
    },
    [loading, selectedPatterns]
  );

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
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
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        {ADMIN_ACTION_NOTIFICATION_OPTIONS.map((option) => {
          const enabled = selectedPatterns.includes(option.pattern);
          return (
            <label
              key={option.pattern}
              className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={enabled}
                disabled={loading}
                onChange={() => {
                  void togglePattern(option.pattern);
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
