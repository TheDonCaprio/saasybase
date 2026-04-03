'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthSession, useAuthUser } from '@/lib/auth-provider/client';
import { formatDate } from '../../lib/formatDate';
import { ActiveSessionsList } from './ActiveSessionsList';
import { ActiveSessionsSummary } from './ActiveSessionsSummary';
import { dashboardPanelClass, dashboardPillClass } from './dashboardSurfaces';

interface SessionActivity {
  browserName?: string | null;
  browserVersion?: string | null;
  deviceType?: string | null;
  ipAddress?: string | null;
  city?: string | null;
  country?: string | null;
  isMobile?: boolean;
}

interface SessionWithActivity {
  id: string;
  status: string;
  lastActiveAt: Date | string | null;
  isCurrent?: boolean;
  latestActivity?: SessionActivity | null;
}

function formatSessionDevice(session: SessionWithActivity | undefined): string {
  const activity = session?.latestActivity;
  if (!activity) return 'Session details not available';

  const browser = activity.browserName ? `${activity.browserName}${activity.browserVersion ? ` ${activity.browserVersion}` : ''}` : 'Browser info not available';
  const device = activity.deviceType || (activity.isMobile ? 'Mobile device' : 'Desktop device');
  const location = [activity.city, activity.country].filter(Boolean).join(', ') || 'Location not available';

  return `${device} · ${browser} · ${location}`;
}

export function SecurityDataSessionsPanel() {
  const { user, isLoaded } = useAuthUser();
  const { sessionId } = useAuthSession();
  const [sessions, setSessions] = useState<SessionWithActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded || !user) {
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      try {
        const sessionData = await user.getSessions();
        if (!active) return;
        setSessions((Array.isArray(sessionData) ? sessionData : []) as SessionWithActivity[]);
      } catch {
        if (active) setSessions([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isLoaded, user]);

  const activeSessions = useMemo(
    () => sessions.filter((session) => session.status === 'active' || session.status === 'pending'),
    [sessions]
  );

  const currentSession = useMemo(() => {
    if (!activeSessions.length) return null;

    if (sessionId) {
      const explicit = activeSessions.find((session) => session.id === sessionId);
      if (explicit) return explicit;
    }

    return activeSessions.find((session) => session.isCurrent) ?? activeSessions[0] ?? null;
  }, [activeSessions, sessionId]);

  const currentSessionLastActive = currentSession?.lastActiveAt ? formatDate(new Date(currentSession.lastActiveAt), { mode: 'datetime' }) : 'Not available';

  return (
    <div className="space-y-6">
      <div className={dashboardPanelClass('space-y-4')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Current session</h3>
            <p className="text-sm text-slate-500 dark:text-neutral-400">
              Review the device that is currently signed in to your account.
            </p>
          </div>
          <span className={dashboardPillClass('text-blue-600 dark:text-blue-200')}>
            Active now
          </span>
        </div>

        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Last active</dt>
            <dd className="mt-1 text-slate-900 dark:text-neutral-100">{currentSessionLastActive}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Device</dt>
            <dd className="mt-1 text-slate-900 dark:text-neutral-100">{currentSession ? formatSessionDevice(currentSession) : 'No active session detected'}</dd>
          </div>
        </dl>
      </div>

      <div className={dashboardPanelClass('space-y-4 p-4 sm:p-6')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Active sessions</h3>
          <span className={dashboardPillClass('text-blue-600 dark:text-blue-200')}>
            <span className="inline-flex items-center gap-1">
              <span className="font-semibold"><ActiveSessionsSummary /></span>
              <span>active</span>
            </span>
          </span>
        </div>
        <p className="text-sm text-slate-500 dark:text-neutral-400">
          Manage your signed-in devices. Revoke access if something looks unfamiliar.
        </p>
        {loading ? (
          <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-5 text-sm text-slate-500 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70 dark:text-neutral-400">
            Loading session data...
          </div>
        ) : (
          <div className="-mx-4 -mb-4 sm:-mx-6 sm:-mb-6">
            <ActiveSessionsList />
          </div>
        )}
      </div>
    </div>
  );
}