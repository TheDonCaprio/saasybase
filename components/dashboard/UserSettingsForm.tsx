"use client";

import { useState, useEffect } from 'react';
import { showToast } from '../../components/ui/Toast';
import TIMEZONES from '../../lib/timezones';

interface UserSetting {
  id: string;
  key: string;
  value: string;
}

interface UserSettingsFormProps {
  userId: string;
  initialSettings: UserSetting[];
}

// Use shared curated timezone list
const TIMEZONE_OPTIONS = TIMEZONES;

export function UserSettingsForm({ userId, initialSettings }: UserSettingsFormProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [loading, setLoading] = useState(false);
  // userId prop is currently unused by the client form; mark as intentionally unused
  void userId;

  const settingDefinitions = [
    { key: 'EMAIL_NOTIFICATIONS', label: 'Email Notifications', description: 'Receive updates about your subscription', type: 'boolean', defaultValue: 'true' },
    { key: 'THEME_PREFERENCE', label: 'Theme Preference', description: 'UI theme preference', type: 'select', options: ['auto', 'dark', 'light'], defaultValue: 'auto' },
    { key: 'TIMEZONE', label: 'Timezone', description: 'Your preferred timezone for dates and times', type: 'timezone', defaultValue: 'UTC' }
  ];

  // Apply theme when preference changes
  useEffect(() => {
    let themePreference = settings.find(s => s.key === 'THEME_PREFERENCE')?.value;

    if (!themePreference) {
      try {
        const storedPreference = localStorage.getItem('themePreference');
        if (storedPreference) {
          themePreference = storedPreference;
        }
      } catch (e) {
        void e;
      }
    }

    if (!themePreference) {
      themePreference = getSettingValue('THEME_PREFERENCE');
    }

    applyTheme(themePreference);
    // settings intentionally included; getSettingValue is stable within this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const applyTheme = (theme: string) => {
    const root = document.documentElement;
    
    if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
      try { localStorage.setItem('themePreference', 'light'); } catch (e) { void e; }
    } else if (theme === 'dark') {
      root.classList.remove('light');
      root.classList.add('dark');
      try { localStorage.setItem('themePreference', 'dark'); } catch (e) { void e; }
    } else {
      // Auto mode - detect system preference
      root.classList.remove('light', 'dark');
      try { localStorage.setItem('themePreference', 'auto'); } catch (e) { void e; }
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
      } else {
        root.classList.add('light');
      }
    }
  };

  const getSettingValue = (key: string) => {
    const setting = settings.find(s => s.key === key);
    return setting?.value || settingDefinitions.find(d => d.key === key)?.defaultValue || '';
  };

  const updateSetting = async (key: string, value: string) => {
    if (loading) return;
    setLoading(true);

    try {
      const response = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });

      if (response.ok) {
        const { setting } = await response.json();
        setSettings(prev => {
          const existing = prev.find(s => s.key === key);
          if (existing) {
            return prev.map(s => s.key === key ? setting : s);
          } else {
            return [...prev, setting];
          }
        });

        // Apply theme immediately if theme preference changed
        if (key === 'THEME_PREFERENCE') {
          applyTheme(value);
        }
      } else {
        const error = await response.json();
        showToast(`Failed to save: ${error.error}`, 'error');
      }
    } catch (error) {
      console.error('Error saving setting:', error);
      showToast('Error saving setting', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
      <h3 className="mb-4 text-lg font-medium text-slate-900 dark:text-neutral-100">Preferences</h3>
      <div className="space-y-4">
        {settingDefinitions.map((def) => {
          const currentValue = getSettingValue(def.key);
          
          return (
            <div key={def.key} className="space-y-2">
              <div>
                <div className="text-sm font-medium text-slate-800 dark:text-neutral-100">{def.label}</div>
                <div className="text-xs text-slate-500 dark:text-neutral-400">{def.description}</div>
              </div>
              
              <div className="flex gap-3">
                {def.type === 'boolean' ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={currentValue === 'true'}
                      onChange={(e) => updateSetting(def.key, e.target.checked ? 'true' : 'false')}
                      disabled={loading}
                      className="rounded border-slate-300 bg-white text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800"
                    />
                    <span className="text-sm text-slate-700 dark:text-neutral-200">Enabled</span>
                  </label>
                ) : def.type === 'select' ? (
                  <select
                    value={currentValue}
                    onChange={(e) => updateSetting(def.key, e.target.value)}
                    disabled={loading}
                    className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                  >
                    {def.options?.map(option => (
                      <option key={option} value={option} className="bg-white text-slate-700 dark:bg-neutral-800 dark:text-neutral-100">
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </option>
                    ))}
                  </select>
                ) : def.type === 'timezone' ? (
                  <select
                    value={currentValue}
                    onChange={(e) => updateSetting(def.key, e.target.value)}
                    disabled={loading}
                    className="w-full max-w-md rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                  >
                    {TIMEZONE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value} className="bg-white text-slate-700 dark:bg-neutral-800 dark:text-neutral-100">
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={currentValue}
                    onChange={(e) => updateSetting(def.key, e.target.value)}
                    onBlur={(e) => updateSetting(def.key, e.target.value)}
                    disabled={loading}
                    className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
                    placeholder={def.defaultValue}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
