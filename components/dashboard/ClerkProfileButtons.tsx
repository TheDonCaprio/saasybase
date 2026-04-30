"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { splitFullName, validateAndFormatPersonName } from '@/lib/name-validation';
import { showToast } from '../ui/Toast';
import { ClerkProfileModal } from './ClerkProfileModal';

interface ClerkProfileButtonsProps {
  defaultName?: string | null;
  defaultEmail?: string | null;
}

function NextAuthModalShell({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-neutral-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 transition hover:text-slate-700 dark:text-neutral-500 dark:hover:text-neutral-200"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function NextAuthProfileEditor({
  defaultName,
  defaultEmail,
}: {
  defaultName?: string | null;
  defaultEmail?: string | null;
}) {
  const router = useRouter();
  const initialNameParts = useMemo(() => splitFullName(defaultName), [defaultName]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [firstName, setFirstName] = useState(initialNameParts.firstName);
  const [lastName, setLastName] = useState(initialNameParts.lastName);
  const [email, setEmail] = useState(defaultEmail ?? '');

  const normalizedInitialFirstName = useMemo(() => initialNameParts.firstName, [initialNameParts.firstName]);
  const normalizedInitialLastName = useMemo(() => initialNameParts.lastName, [initialNameParts.lastName]);
  const normalizedInitialEmail = useMemo(() => defaultEmail ?? '', [defaultEmail]);

  useEffect(() => {
    setFirstName(normalizedInitialFirstName);
    setLastName(normalizedInitialLastName);
  }, [normalizedInitialFirstName, normalizedInitialLastName]);

  useEffect(() => {
    setEmail(normalizedInitialEmail);
  }, [normalizedInitialEmail]);

  const closeProfile = () => {
    setProfileOpen(false);
    setProfileError('');
    setFirstName(normalizedInitialFirstName);
    setLastName(normalizedInitialLastName);
    setEmail(normalizedInitialEmail);
  };

  const closePassword = () => {
    setPasswordOpen(false);
    setPasswordError('');
    setPasswordSuccess('');
  };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 px-5 py-2.5 text-sm font-semibold !text-white shadow-lg shadow-blue-600/20 transition-all hover:from-blue-700 hover:to-emerald-600 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:shadow-blue-500/20 dark:hover:shadow-blue-500/30 dark:focus:ring-offset-neutral-900"
        >
          <svg className="h-4 w-4 !text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span className="!text-white">Edit name & email</span>
        </button>

        <button
          type="button"
          onClick={() => setPasswordOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-700 dark:focus:ring-offset-neutral-900"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Change password
        </button>
      </div>

      <NextAuthModalShell isOpen={profileOpen} onClose={closeProfile} title="Edit profile">
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setProfileError('');
            const validatedName = validateAndFormatPersonName({ firstName, lastName });
            if (!validatedName.ok) {
              setProfileError(validatedName.error || 'Please enter a valid name.');
              return;
            }

            setProfileLoading(true);

            try {
              const response = await fetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName, lastName, email }),
              });

              const data = await response.json().catch(() => ({}));
              if (!response.ok) {
                setProfileError(data.error || 'Failed to update profile.');
                return;
              }

              showToast(
                data.emailChangePending && data.pendingEmail
                  ? `Profile updated. Check ${data.pendingEmail} to confirm your new email address.`
                  : data.verificationRequired
                  ? 'Profile updated. Please verify your new email address.'
                  : 'Profile updated successfully.',
                'success'
              );
              closeProfile();
              router.refresh();
            } catch {
              setProfileError('Failed to update profile. Please try again.');
            } finally {
              setProfileLoading(false);
            }
          }}
        >
          {profileError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
              {profileError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="nextauth-profile-first-name" className="mb-1 block text-sm font-medium text-slate-700 dark:text-neutral-300">
                First name
              </label>
              <input
                id="nextauth-profile-first-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
            <div>
              <label htmlFor="nextauth-profile-last-name" className="mb-1 block text-sm font-medium text-slate-700 dark:text-neutral-300">
                Last name
              </label>
              <input
                id="nextauth-profile-last-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="nextauth-profile-email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-neutral-300">
              Email
            </label>
            <input
              id="nextauth-profile-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">
              If you change your email, we will send a fresh verification link.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={profileLoading}
              className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {profileLoading ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={closeProfile}
              className="text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Cancel
            </button>
          </div>
        </form>
      </NextAuthModalShell>

      <NextAuthModalShell isOpen={passwordOpen} onClose={closePassword} title="Change password">
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setPasswordError('');
            setPasswordSuccess('');

            const form = event.currentTarget;
            const currentPassword = (form.elements.namedItem('currentPassword') as HTMLInputElement).value;
            const newPassword = (form.elements.namedItem('newPassword') as HTMLInputElement).value;
            const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;

            if (newPassword !== confirmPassword) {
              setPasswordError('New passwords do not match.');
              return;
            }

            setPasswordLoading(true);
            try {
              const response = await fetch('/api/user/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword }),
              });

              const data = await response.json().catch(() => ({}));
              if (!response.ok) {
                setPasswordError(data.error || 'Failed to change password.');
                return;
              }

              setPasswordSuccess('Password changed successfully.');
              showToast('Password changed successfully.', 'success');
              form.reset();
              window.setTimeout(() => {
                closePassword();
              }, 1200);
            } catch {
              setPasswordError('Failed to change password. Please try again.');
            } finally {
              setPasswordLoading(false);
            }
          }}
        >
          {passwordError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
              {passwordError}
            </div>
          )}
          {passwordSuccess && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
              {passwordSuccess}
            </div>
          )}

          <div>
            <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium text-slate-700 dark:text-neutral-300">
              Current password
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-slate-700 dark:text-neutral-300">
              New password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              minLength={8}
              required
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-slate-700 dark:text-neutral-300">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              minLength={8}
              required
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={passwordLoading}
              className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {passwordLoading ? 'Saving…' : 'Save password'}
            </button>
            <button
              type="button"
              onClick={closePassword}
              className="text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Cancel
            </button>
          </div>
        </form>
      </NextAuthModalShell>
    </>
  );
}

export default function ClerkProfileButtons({ defaultName, defaultEmail }: ClerkProfileButtonsProps) {
  const editLabelRef = useRef<HTMLSpanElement | null>(null);
  const editIconRef = useRef<SVGSVGElement | null>(null);
  const authProvider = process.env.NEXT_PUBLIC_AUTH_PROVIDER;
  const usesLocalProfileEditor = authProvider === 'nextauth' || authProvider === 'betterauth';

  useEffect(() => {
    // No JS color overrides — rely on .text-actual-white utility to force white text and SVG color
  }, []);

  if (usesLocalProfileEditor) {
    return <NextAuthProfileEditor defaultName={defaultName} defaultEmail={defaultEmail} />;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <ClerkProfileModal
        trigger={
          <button className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 px-5 py-2.5 text-sm font-semibold !text-white text-actual-white shadow-lg shadow-blue-600/20 transition-all hover:from-blue-700 hover:to-emerald-600 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:shadow-blue-500/20 dark:hover:shadow-blue-500/30 dark:focus:ring-offset-neutral-900">
            <svg ref={editIconRef} className="h-4 w-4 !text-white text-actual-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span ref={editLabelRef} className="!text-white text-actual-white">Edit name & email</span>
          </button>
        }
        mode="profile"
      />

      <ClerkProfileModal
        trigger={
          <button className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-700 dark:focus:ring-offset-neutral-900">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Change password
          </button>
        }
        mode="security"
      />
    </div>
  );
}
