"use client";

import { useUser } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { asRecord } from '../../lib/runtime-guards';

export function ActiveSessionsSummary() {
  const { user, isLoaded } = useUser();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoaded || !user) {
      setCount(null);
      return;
    }

    let mounted = true;

    (async () => {
      try {
        const sessions = await user.getSessions();
        const list = Array.isArray(sessions) ? sessions : [];
        const active = list.filter((s) => {
          const r = asRecord(s);
          const status = typeof r?.status === 'string' ? r.status : undefined;
          return status === 'active' || status === 'pending';
        });
        if (mounted) setCount(active.length);
      } catch (e) {
        console.warn('Failed to fetch sessions for summary:', e);
        if (mounted) setCount(null);
      }
    })();

    return () => { mounted = false; };
  }, [user, isLoaded]);

  if (!isLoaded) return <>—</>;

  return <>{typeof count === 'number' ? count : '—'}</>;
}
