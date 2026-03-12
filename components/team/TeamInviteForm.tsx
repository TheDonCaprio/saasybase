'use client';

import { useState, type FormEvent } from 'react';

interface TeamInviteFormProps {
  onInvite: (email: string, role: string) => Promise<boolean> | boolean;
  isSubmitting: boolean;
  seatsRemaining: number | null;
}

export function TeamInviteForm({ onInvite, isSubmitting, seatsRemaining }: TeamInviteFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('org:member');
  const [error, setError] = useState<string | null>(null);

  const atCapacity = seatsRemaining === 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) {
      setError('Enter an email address.');
      return;
    }
    setError(null);
    const ok = await onInvite(email.trim(), role);
    if (ok) {
      setEmail('');
      setRole('org:member');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400" htmlFor="team-invite-email">
          Email address
        </label>
        <input
          id="team-invite-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isSubmitting || atCapacity}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          placeholder="teammate@example.com"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400" htmlFor="team-invite-role">
          Role
        </label>
        <select
          id="team-invite-role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          disabled={isSubmitting || atCapacity}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        >
          <option value="org:member">Member</option>
          <option value="org:admin">Admin</option>
        </select>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {atCapacity && <p className="text-xs text-amber-600">Seat limit reached. Remove a member to invite someone new.</p>}

      <button
        type="submit"
        disabled={isSubmitting || atCapacity}
        className="inline-flex w-full items-center justify-center rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Sending…' : 'Send invite'}
      </button>
    </form>
  );
}
