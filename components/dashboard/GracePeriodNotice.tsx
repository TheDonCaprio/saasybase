'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthUser } from '@/lib/auth-provider/client';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';

type GraceStatus =
  | { inGrace: false }
  | {
      inGrace: true;
      graceHours: number;
      expiresAt: string;
      graceEndsAt: string;
      plan?: { name: string | null; supportsOrganizations: boolean; autoRenew: boolean };
    };

const DISMISS_UNTIL_KEY = 'dashboard:grace-notice:dismiss-until';

export function GracePeriodNotice() {
  const { isLoaded, isSignedIn } = useAuthUser();
  const [status, setStatus] = useState<GraceStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const formatSettings = useFormatSettings();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/user/grace-status', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setStatus({ inGrace: false });
          return;
        }
        const json = (await res.json()) as GraceStatus;
        if (!cancelled) setStatus(json);
      } catch {
        if (!cancelled) setStatus({ inGrace: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  const graceEndsAt = useMemo(() => {
    if (!status || !status.inGrace) return null;
    const d = new Date(status.graceEndsAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [status]);

  const expiresAt = useMemo(() => {
    if (!status || !status.inGrace) return null;
    const d = new Date(status.expiresAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [status]);

  const dismissedUntilIso = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(DISMISS_UNTIL_KEY);
    } catch {
      return null;
    }
  }, []);

  const isDismissedForThisGrace = useMemo(() => {
    if (!status || !status.inGrace || !graceEndsAt) return false;
    if (!dismissedUntilIso) return false;
    const stored = new Date(dismissedUntilIso);
    if (Number.isNaN(stored.getTime())) return false;
    // Only suppress if the stored "until" matches or exceeds the current grace end.
    // The API-backed `status.inGrace` check already ensures the grace window is active.
    return stored.getTime() >= graceEndsAt.getTime();
  }, [status, graceEndsAt, dismissedUntilIso]);

  if (!isLoaded || !isSignedIn) return null;

  if (!status || !status.inGrace) return null;
  if (hidden || isDismissedForThisGrace) return null;

  const handleClose = () => setHidden(true);

  const handleDontShowAgain = () => {
    if (!graceEndsAt) {
      setHidden(true);
      return;
    }
    try {
      localStorage.setItem(DISMISS_UNTIL_KEY, graceEndsAt.toISOString());
    } catch {
      // ignore storage failures
    }
    setHidden(true);
  };

  const planLabel = status.plan?.name ? ` (${status.plan.name})` : '';

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-6 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            <div className="w-2 h-2 bg-amber-500 rounded-full" />
          </div>
          <div className="text-sm">
            <div className="font-semibold">Grace period active{planLabel}</div>
            <div className="mt-1 text-amber-800/90 dark:text-amber-100/90">
              {expiresAt ? (
                <>
                  Your plan expired on {formatDate(expiresAt, { mode: formatSettings.mode, timezone: formatSettings.timezone })}. You’re in a grace period until{' '}
                  {graceEndsAt ? formatDate(graceEndsAt, { mode: formatSettings.mode, timezone: formatSettings.timezone }) : 'soon'}. Subscribe to a Pro plan to retain your remaining allocation and retain organisation settings.
                </>
              ) : (
                <>Your plan recently expired. You’re currently in a grace period. Subscribe to a Pro plan to retain your remaining allocation and retain organisation settings.</>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleDontShowAgain}
            className="text-xs font-semibold uppercase tracking-wide text-amber-800 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100 bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 border border-amber-200 dark:border-amber-500/30 rounded-md px-3 py-1 transition-colors"
          >
            Do not show again
          </button>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-amber-200/70 dark:hover:bg-amber-500/20 rounded transition-colors"
            aria-label="Dismiss grace notice"
          >
            <span className="text-amber-700 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100 text-lg leading-none">×</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default GracePeriodNotice;
