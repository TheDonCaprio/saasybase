"use client";

import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSun, faMoon, faCircleHalfStroke } from '@fortawesome/free-solid-svg-icons';
import { useAuthSession } from '@/lib/auth-provider/client';
import { fetchUserSettings, updateCachedUserSetting } from '@/lib/user-settings.client';

type ThemePreference = 'light' | 'dark' | 'auto';
const THEME_PREFERENCE_EVENT = 'theme-preference-changed';

function setThemeResolvedCookie(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  document.cookie = `themeResolved=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function storeThemePreference(theme: ThemePreference) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('themePreference', theme);
  } catch (e) {
    void e;
  }
}

function broadcastThemePreference(theme: ThemePreference) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ThemePreference>(THEME_PREFERENCE_EVENT, { detail: theme }));
}

function readLocalPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'auto';
  try {
    const stored = localStorage.getItem('themePreference');
    if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
  } catch (e) {
    void e;
  }

  // Fall back to the current document class so SSR/hydration stays consistent
  if (document.documentElement.classList.contains('dark')) return 'dark';
  if (document.documentElement.classList.contains('light')) return 'light';

  return 'auto';
}

export function ThemeToggle() {
  const { isLoaded, isSignedIn } = useAuthSession();
  const [preference, setPreference] = useState<ThemePreference>('auto');
  const [saving, setSaving] = useState(false);

  const applyTheme = useCallback((theme: ThemePreference) => {
    const root = document.documentElement;

    if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
      setThemeResolvedCookie('light');
    } else if (theme === 'dark') {
      root.classList.remove('light');
      root.classList.add('dark');
      setThemeResolvedCookie('dark');
    } else {
      root.classList.remove('light', 'dark');
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
        setThemeResolvedCookie('dark');
      } else {
        root.classList.add('light');
        setThemeResolvedCookie('light');
      }
    }

  }, []);

  const syncThemePreference = useCallback((nextPreference: ThemePreference) => {
    setPreference(nextPreference);
    applyTheme(nextPreference);
  }, [applyTheme]);

  // Sync with stored preference and user settings if signed in
  useEffect(() => {
    const initial = readLocalPreference();
    syncThemePreference(initial);

    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    (async () => {
      try {
        const settings = await fetchUserSettings();
        const maybeTheme = settings.find((setting) => setting.key === 'THEME_PREFERENCE');
        const serverTheme = maybeTheme?.value;
        if (!cancelled && (serverTheme === 'light' || serverTheme === 'dark' || serverTheme === 'auto')) {
          syncThemePreference(serverTheme);
        }
      } catch (e) {
        // Likely unauthenticated (401) or network issues; safe to ignore because we still honor local preference.
        void e;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, syncThemePreference]);

  useEffect(() => {
    const handleThemePreferenceSync = (event: Event) => {
      const nextPreference = (event as CustomEvent<ThemePreference>).detail;
      if (nextPreference === 'light' || nextPreference === 'dark' || nextPreference === 'auto') {
        syncThemePreference(nextPreference);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'themePreference') return;
      const nextPreference = event.newValue;
      if (nextPreference === 'light' || nextPreference === 'dark' || nextPreference === 'auto') {
        syncThemePreference(nextPreference);
      }
    };

    window.addEventListener(THEME_PREFERENCE_EVENT, handleThemePreferenceSync as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(THEME_PREFERENCE_EVENT, handleThemePreferenceSync as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, [syncThemePreference]);

  const persistPreference = useCallback(async (nextPreference: ThemePreference) => {
    syncThemePreference(nextPreference);
    storeThemePreference(nextPreference);
    broadcastThemePreference(nextPreference);

    if (!isSignedIn) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'THEME_PREFERENCE', value: nextPreference })
      });
      if (response.ok) {
        const payload = await response.json();
        if (payload?.setting) {
          updateCachedUserSetting(payload.setting);
        }
      }
    } catch (e) {
      // Ignore network/auth errors; local preference and theme are already applied.
      void e;
    } finally {
      setSaving(false);
    }
  }, [isSignedIn, syncThemePreference]);

  const handleToggle = useCallback(() => {
    const next = preference === 'dark' ? 'light' : 'dark';
    void persistPreference(next);
  }, [preference, persistPreference]);

  const icon = preference === 'dark' ? faMoon : preference === 'light' ? faSun : faCircleHalfStroke;
  const label = preference === 'dark' ? 'Dark' : preference === 'light' ? 'Light' : 'Auto';

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 active:scale-[0.99] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
      aria-label={`Toggle theme (current: ${label})`}
      disabled={saving}
    >
      <FontAwesomeIcon icon={icon} className="h-4 w-4" />
    </button>
  );
}
