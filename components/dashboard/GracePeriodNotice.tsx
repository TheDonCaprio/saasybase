'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthSession, useAuthUser } from '@/lib/auth-provider/client';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';

type GraceStatus =
  | { inGrace: false }
  | {
      inGrace: true;
      scope: 'PERSONAL' | 'WORKSPACE';
      graceHours: number;
      expiresAt: string;
      graceEndsAt: string;
      workspace?: { id: string; name: string | null; role: 'OWNER' | 'MEMBER' | null } | null;
      plan?: { name: string | null; supportsOrganizations: boolean; autoRenew: boolean };
    };

const DISMISS_UNTIL_KEY_PREFIX = 'dashboard:grace-notice:dismiss-until';

export function GracePeriodNotice() {
  const { isLoaded, isSignedIn } = useAuthUser();
  const { orgId } = useAuthSession();
  const [status, setStatus] = useState<GraceStatus | null>(null);
  const [hiddenScopeKey, setHiddenScopeKey] = useState<string | null>(null);
  const [dismissedUntilIso, setDismissedUntilIso] = useState<string | null>(null);
  const formatSettings = useFormatSettings();
  const scopeStorageKey = `${DISMISS_UNTIL_KEY_PREFIX}:${orgId ?? 'personal'}`;

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
  }, [isLoaded, isSignedIn, orgId]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    try {
      setDismissedUntilIso(localStorage.getItem(scopeStorageKey));
    } catch {
      setDismissedUntilIso(null);
    }
  }, [isLoaded, isSignedIn, scopeStorageKey]);

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

  const isDismissedForThisGrace = useMemo(() => {
    if (!status || !status.inGrace || !graceEndsAt) return false;
    if (!dismissedUntilIso) return false;
    const stored = new Date(dismissedUntilIso);
    if (Number.isNaN(stored.getTime())) return false;
    // Only suppress if the stored "until" matches or exceeds the current grace end.
    // The API-backed `status.inGrace` check already ensures the grace window is active.
    return stored.getTime() >= graceEndsAt.getTime();
  }, [status, graceEndsAt, dismissedUntilIso]);
  const isHiddenForScope = hiddenScopeKey === scopeStorageKey;

  if (!isLoaded || !isSignedIn) return null;

  if (!status || !status.inGrace) return null;
  if (isHiddenForScope || isDismissedForThisGrace) return null;

  const handleClose = () => setHiddenScopeKey(scopeStorageKey);

  const handleDontShowAgain = () => {
    if (!graceEndsAt) {
      setHiddenScopeKey(scopeStorageKey);
      return;
    }
    try {
      localStorage.setItem(scopeStorageKey, graceEndsAt.toISOString());
    } catch {
      // ignore storage failures
    }
    setHiddenScopeKey(scopeStorageKey);
  };

  const contextLabel = status.scope === 'WORKSPACE'
    ? status.workspace?.name ?? 'this workspace'
    : status.plan?.name ?? null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-6 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            <div className="w-2 h-2 bg-amber-500 rounded-full" />
          </div>
          <div className="text-sm">
            <div className="font-semibold">
              {status.scope === 'WORKSPACE'
                ? `Workspace grace period active${contextLabel ? ` (${contextLabel})` : ''}`
                : `Grace period active${contextLabel ? ` (${contextLabel})` : ''}`}
            </div>
            <div className="mt-1 text-amber-800/90 dark:text-amber-100/90">
              {expiresAt ? (
                <>
                  {status.scope === 'WORKSPACE'
                    ? `The active workspace plan expired on ${formatDate(expiresAt, { mode: formatSettings.mode, timezone: formatSettings.timezone })}.`
                    : `Your plan expired on ${formatDate(expiresAt, { mode: formatSettings.mode, timezone: formatSettings.timezone })}.`}{' '}
                  You’re in a grace period until {graceEndsAt ? formatDate(graceEndsAt, { mode: formatSettings.mode, timezone: formatSettings.timezone }) : 'soon'}.{' '}
                  {status.scope === 'WORKSPACE'
                    ? 'Renew the active workspace plan to retain its remaining allocation and workspace settings.'
                    : 'Subscribe to a Pro plan to retain your remaining allocation and organisation settings.'}
                </>
              ) : (
                <>
                  {status.scope === 'WORKSPACE'
                    ? 'The active workspace plan recently expired. You’re currently in a grace period. Renew that workspace plan to retain its remaining allocation and workspace settings.'
                    : 'Your plan recently expired. You’re currently in a grace period. Subscribe to a Pro plan to retain your remaining allocation and organisation settings.'}
                </>
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
