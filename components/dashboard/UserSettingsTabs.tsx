'use client';

import { useMemo, useState } from 'react';
import { useAuthUser } from '@/lib/auth-provider/client';
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Link from 'next/link';
import { ReactiveProfileHeader } from './ReactiveProfileHeader';
import { UserSettingsForm } from './UserSettingsForm';
import { showToast } from '../ui/Toast';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faShieldAlt } from '@fortawesome/free-solid-svg-icons';

const cx = (...inputs: ClassValue[]) => twMerge(clsx(...inputs));

interface BaseUser {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  createdAt: string | Date;
  imageUrl?: string | null;
}

interface SubscriptionDetails {
  plan: {
    name: string;
  };
  status: string;
  expiresAt: string | Date;
}

interface UserSettingValue {
  id: string;
  key: string;
  value: string;
}

interface UserSettingsTabsProps {
  user: BaseUser;
  subscription: SubscriptionDetails | null;
  userSettings: UserSettingValue[];
  /** Optional initial active tab when the component is mounted (client-side). */
  initialActiveTab?: 'profile' | 'security';
  preformattedCreatedAt?: string;
}

export function UserSettingsTabs({
  user,
  subscription,
  userSettings
  , initialActiveTab,
  preformattedCreatedAt
}: UserSettingsTabsProps) {
  const [activeTab, setActiveTab] = useState(initialActiveTab ?? 'profile');

  const hydratedUser = useMemo(() => ({
    ...user,
    createdAt: user.createdAt instanceof Date ? user.createdAt : new Date(user.createdAt)
  }), [user]);

  const hydratedSubscription = useMemo(() => {
    if (!subscription) return null;
    return {
      ...subscription,
      expiresAt: subscription.expiresAt instanceof Date ? subscription.expiresAt : new Date(subscription.expiresAt)
    };
  }, [subscription]);

  const tabs = useMemo(
    () => [
      {
        id: 'profile',
        label: 'Profile & Preferences',
        icon: faUser,
        description: 'Update your name, avatar, notifications, and theme.',
            content: (
          <div className="space-y-6">
            <ReactiveProfileHeader fallbackUser={hydratedUser} subscription={hydratedSubscription} preformattedCreatedAt={preformattedCreatedAt} />
            <UserSettingsForm userId={hydratedUser.id} initialSettings={userSettings} />
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Quick actions</p>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">Jump to billing and support utilities.</p>
                </div>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-300">Shortcuts</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Link
                  href="/dashboard/plan"
                  className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/60 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-600"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Manage plan</p>
                    <span className="text-lg">↗</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">Review benefits, switch tiers, or cancel your subscription.</p>
                </Link>
                <Link
                  href="/dashboard/support"
                  className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/60 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-600"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Support center</p>
                    <span className="text-lg">💬</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">Create tickets, browse guides, or check system status.</p>
                </Link>
              </div>
            </div>
          </div>
        )
      },
      {
        id: 'security',
        label: 'Security & Data',
        icon: faShieldAlt,
        description: 'Account verification, exports, and deletion.',
        content: (
          <div className="space-y-6">
            <EmailVerificationCard />

            <PasswordChangeCard />

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Download account data</p>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">Export your settings, invoices, and history in one bundle.</p>
                </div>
                <button
                  disabled
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-medium text-slate-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
                >
                  Coming soon
                </button>
              </div>
            </div>

            <AccountDeletionPanel />
          </div>
        )
      }
    ],
    [hydratedSubscription, hydratedUser, userSettings, preformattedCreatedAt]
  );

  const activeContent = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <div className="space-y-6">
      <div
        className="relative flex overflow-hidden rounded-2xl border border-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.25))] bg-[linear-gradient(135deg,var(--theme-tabs-gradient-from),var(--theme-tabs-gradient-via),var(--theme-tabs-gradient-to))] shadow-[0_12px_45px_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.12))] transition-shadow dark:border-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.35))] dark:shadow-[0_0_40px_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.18))]"
        role="tablist"
        aria-label="User settings sections"
      >
        <div className="pointer-events-none absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_top,_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.18)),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.28)),_transparent_60%)]" />
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${tab.id}-tab`}
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id as 'profile' | 'security')}
            className={cx(
              'relative z-10 flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all',
              activeTab === tab.id
                ? 'bg-white text-[rgb(var(--accent-primary))] shadow-md dark:bg-black dark:text-[rgb(var(--accent-primary))]'
                : 'text-slate-700/85 hover:bg-white/60 hover:text-slate-900 dark:text-neutral-200 dark:hover:bg-white/10 dark:hover:text-neutral-50'
            )}
          >
            <FontAwesomeIcon icon={tab.icon} className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`${activeContent.id}-tab`}
  className="lg:rounded-3xl lg:border lg:border-slate-200 lg:bg-white lg:p-6 lg:shadow-xl dark:lg:border-neutral-800 dark:lg:bg-neutral-950/60"
      >
        {activeContent.content}
      </div>
    </div>
  );
}

function AccountDeletionPanel() {
  const { user, isLoaded } = useAuthUser();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isLoaded) {
    return <div className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900/60" />;
  }

  if (!user) {
    return null;
  }

  const primaryEmail = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? '';

  const resetState = () => {
    setConfirming(false);
    setConfirmText('');
    setIsDeleting(false);
  };

  const handleDelete = async () => {
    if (primaryEmail && confirmText.trim() !== primaryEmail) {
      showToast('Type your email address to confirm deletion.', 'error');
      return;
    }

    try {
      setIsDeleting(true);
      const response = await fetch('/api/user/delete-account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete account.');
      }

      await user.delete();
      showToast('Your account has been scheduled for deletion. You will be signed out shortly.', 'success');
    } catch (error) {
      console.error(error);
      showToast('We could not delete your account. Please try again or contact support.', 'error');
      resetState();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-red-200/80 bg-red-50 p-6 shadow-sm dark:border-red-500/40 dark:bg-red-500/10">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-red-700 dark:text-red-200">Delete account</p>
          <p className="text-xs text-red-600/80 dark:text-red-200/70">
            Permanently remove your workspace contents and associated data. This action cannot be undone.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-red-200/80 bg-white/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:border-red-500/40 dark:bg-transparent dark:text-red-200">
          Danger zone
        </span>
      </div>

      {!confirming ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-red-600/80 dark:text-red-200/70">
            {primaryEmail
              ? 'You must confirm your email address before we can proceed.'
              : 'We’ll delete your account immediately after confirmation—no email on file.'}
          </div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 rounded-full border border-red-400 bg-white px-4 py-2 text-xs font-semibold text-red-600 shadow-sm transition hover:border-red-500 hover:bg-red-50 dark:border-red-500/60 dark:bg-transparent dark:text-red-200 dark:hover:border-red-400/80 dark:hover:bg-red-500/10"
          >
            <span className="text-sm">⚠️</span>
            Delete account
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            {primaryEmail ? (
              <>
                <label className="text-xs font-semibold text-red-700 dark:text-red-200" htmlFor="confirm-delete-input">
                  Type <span className="font-mono">{primaryEmail}</span> to confirm
                </label>
                <input
                  id="confirm-delete-input"
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder={primaryEmail}
                  className="mt-2 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-red-700 shadow-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200 dark:border-red-500/40 dark:bg-transparent dark:text-red-100"
                />
              </>
            ) : (
              <p className="rounded-xl border border-red-200 bg-white/60 px-4 py-3 text-xs text-red-700 shadow-sm dark:border-red-500/40 dark:bg-transparent dark:text-red-200/80">
                We couldn’t detect an email address for your profile. Proceeding will immediately delete your account and sign you out.
              </p>
            )}
            <p className="mt-2 text-[11px] text-red-600/80 dark:text-red-200/70">
              Deleting your account immediately signs you out and removes access to our services. Back up any data you may need first.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={isDeleting || (primaryEmail.length > 0 && confirmText.trim() !== primaryEmail)}
              onClick={handleDelete}
              className={cx(
                'inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition',
                isDeleting || (primaryEmail.length > 0 && confirmText.trim() !== primaryEmail)
                  ? 'cursor-not-allowed opacity-60'
                  : 'hover:bg-red-700'
              )}
            >
              {isDeleting ? 'Deleting…' : 'Confirm deletion'}
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={resetState}
              className="text-xs font-semibold text-red-600 underline-offset-4 hover:underline dark:text-red-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email Verification Card (provider-agnostic)
// ---------------------------------------------------------------------------

const isNextAuth = process.env.NEXT_PUBLIC_AUTH_PROVIDER === 'nextauth';

function EmailVerificationCard() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleResend = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/auth/verify-email', { method: 'POST' });
      if (res.ok) {
        setSent(true);
        showToast('Verification email sent! Check your inbox.', 'success');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to send verification email.', 'error');
      }
    } catch {
      showToast('Failed to send verification email.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Email verification</p>
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            {isNextAuth
              ? 'Your email address is verified and linked to your account.'
              : 'Your email address is verified and synced with your auth provider.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
            <span className="text-base">✓</span>
            Verified
          </span>
          {isNextAuth && (
            <button
              type="button"
              onClick={handleResend}
              disabled={sending || sent}
              className="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 font-medium disabled:opacity-50"
            >
              {sent ? 'Sent' : sending ? 'Sending…' : 'Resend'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Password Change Card (NextAuth only — Clerk manages passwords internally)
// ---------------------------------------------------------------------------

function PasswordChangeCard() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Only show for NextAuth users
  if (!isNextAuth) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const form = e.currentTarget;
    const currentPassword = (form.elements.namedItem('currentPassword') as HTMLInputElement).value;
    const newPassword = (form.elements.namedItem('newPassword') as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSuccess('Password changed successfully.');
        showToast('Password changed successfully.', 'success');
        form.reset();
        setTimeout(() => {
          setOpen(false);
          setSuccess('');
        }, 2000);
      } else {
        setError(data.error || 'Failed to change password.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Password</p>
          <p className="text-xs text-slate-500 dark:text-neutral-400">Change the password you use to sign in.</p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-600"
          >
            Change password
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
              {success}
            </div>
          )}
          <div>
            <label htmlFor="currentPassword" className="block text-xs font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Current password
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-xs font-medium text-slate-700 dark:text-neutral-300 mb-1">
              New password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={8}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
            <p className="mt-0.5 text-[11px] text-slate-400">Minimum 8 characters</p>
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-xs font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className={cx(
                'inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition',
                loading ? 'cursor-not-allowed opacity-60' : 'hover:bg-violet-700'
              )}
            >
              {loading ? 'Saving…' : 'Save password'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(''); setSuccess(''); }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
