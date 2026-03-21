"use client";
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import type { AppFormatMode } from '../lib/settings';
import { useAuthSession } from '@/lib/auth-provider/client';
import { fetchUserSettings } from '@/lib/user-settings.client';

type ContextValue = {
  mode: AppFormatMode;
  timezone?: string;
  refresh: () => Promise<void>;
};

const Default: ContextValue = { mode: 'short', timezone: undefined, refresh: async () => {} };

const FormatSettingsContext = createContext<ContextValue>(Default);

interface FormatSettingsProviderProps {
  children: React.ReactNode;
  initialMode?: ContextValue['mode'];
  initialTimezone?: string;
}

export function FormatSettingsProvider({
  children,
  initialMode = Default.mode,
  initialTimezone
}: FormatSettingsProviderProps) {
  const { isLoaded, isSignedIn } = useAuthSession();
  const [mode, setMode] = useState<ContextValue['mode']>(initialMode);
  const [timezone, setTimezone] = useState<string | undefined>(initialTimezone);
  // Prevent double-fetch in React StrictMode
  const fetchedRef = useRef(false);

  async function load() {
    try {
      const res = await fetch('/api/settings/format');
      if (res.ok) {
        const j = await res.json();
        if (j.ok) {
          const nextMode = (j.mode as ContextValue['mode']) || 'short';
          setMode(nextMode);
          const tz = j.timezone || undefined;

          // NOTE: user-specific settings (like per-user timezone) are fetched
          // conditionally by a client-side-only helper component when Clerk
          // authentication is enabled. This keeps anonymous page loads quiet
          // (avoids 401 console noise) while still allowing signed-in users to
          // override timezone when available.

          // Validate timezone using Intl where available
          if (tz) {
            try {
                Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
                setTimezone(tz);
              } catch {
                setTimezone(j.timezone || undefined);
              }
          } else {
            setTimezone(undefined);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    // Guard against double-invocation in StrictMode
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    load();
  }, []);

  // Client-only subcomponent: only rendered when the client auth state reports
  // a signed-in user, preventing 401 noise for anonymous visitors.
  function UserSettingsFetcher({ onApply }: { onApply: (tz?: string) => void }) {
    const { useEffect: useEff } = React;
    useEff(() => {
      let cancelled = false;
      (async () => {
        try {
          const settings = await fetchUserSettings();
          const timezoneSetting = settings.find((setting) => setting.key === 'TIMEZONE');
          const userTz = timezoneSetting?.value ?? null;
          if (userTz && !cancelled) onApply(userTz);
        } catch {
          // Quietly ignore any errors (network/401 or Clerk missing) to avoid
          // noisy console output for anonymous visitors.
        }
      })();
      return () => { cancelled = true; };
    }, []);
    return null;
  }

  return (
    <FormatSettingsContext.Provider value={{ mode, timezone, refresh: load }}>
      {children}
      {isLoaded && isSignedIn && (
        <UserSettingsFetcher onApply={(tz?: string) => {
          if (!tz) return;
          try {
            Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
            setTimezone(tz);
          } catch {
            // ignore invalid tz
          }
        }} />
      )}
    </FormatSettingsContext.Provider>
  );
}

export function useFormatSettings() {
  return useContext(FormatSettingsContext);
}
