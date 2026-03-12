'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { activateWorkspaceAndNavigate } from '../../lib/active-workspace.client';

interface InviteAcceptanceClientProps {
  token: string;
  organizationName: string;
  inviteEmail: string;
  viewerEmail: string | null;
  alreadyMember: boolean;
}

type InviteStatus = 'idle' | 'accepting' | 'accepted' | 'declining' | 'declined';

export function InviteAcceptanceClient({ token, organizationName, inviteEmail, viewerEmail, alreadyMember }: InviteAcceptanceClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState<InviteStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  if (alreadyMember) {
    return (
      <div className="space-y-3 text-sm text-slate-700 dark:text-neutral-300">
        <p>You already have access to {organizationName}. Head to the workspace dashboard to get started.</p>
        <Link
          href="/dashboard/team"
          className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2 font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          Go to dashboard
        </Link>
      </div>
    );
  }

  const accepting = status === 'accepting';
  const declining = status === 'declining';
  const succeeded = status === 'accepted';
  const declined = status === 'declined';

  const handleAccept = async () => {
    try {
      setStatus('accepting');
      setError(null);
      const response = await fetch('/api/team/invite/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Unable to accept invite.');
      }

      if (typeof payload.activeOrganizationId === 'string' && payload.activeOrganizationId.length > 0) {
        const switched = await activateWorkspaceAndNavigate(payload.activeOrganizationId, '/dashboard/team');
        if (switched) {
          return;
        }
      }

      setStatus('accepted');
    } catch (err) {
      setStatus('idle');
      setError(err instanceof Error ? err.message : 'Unable to accept invite.');
    }
  };

  const handleDecline = async () => {
    try {
      setStatus('declining');
      setError(null);
      const response = await fetch('/api/team/invite/decline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Unable to decline invite.');
      }
      router.replace('/dashboard/team?inviteDeclined=1');
      router.refresh();
      setStatus('declined');
    } catch (err) {
      setStatus('idle');
      setError(err instanceof Error ? err.message : 'Unable to decline invite.');
    }
  };

  if (succeeded) {
    return (
      <div className="space-y-3 text-sm text-slate-700 dark:text-neutral-300">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
          You now have access to {organizationName}. It may take a few seconds for the workspace to appear.
        </div>
        <Link
          href="/dashboard/team"
          className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2 font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          Go to workspace
        </Link>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="space-y-3 text-sm text-slate-700 dark:text-neutral-300">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
          The invitation has been declined. The workspace owner will see this invite as expired.
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-2 font-semibold text-slate-700 transition hover:border-indigo-500 hover:text-indigo-600 dark:border-neutral-700 dark:text-neutral-100"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm text-slate-700 dark:text-neutral-300">
      <p>You are signed in as {viewerEmail ?? 'your account'}. This invite was sent to {inviteEmail}. Continue to confirm and join the workspace.</p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleAccept}
          disabled={accepting || declining}
          className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {accepting ? 'Joining…' : 'Accept invite'}
        </button>
        <button
          onClick={handleDecline}
          disabled={accepting || declining}
          className="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-2 font-semibold text-slate-700 transition hover:border-rose-500 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-100"
        >
          {declining ? 'Declining…' : 'Decline invite'}
        </button>
      </div>
    </div>
  );
}
