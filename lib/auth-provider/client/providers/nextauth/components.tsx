'use client';

/**
 * NextAuth – Client-Side UI Components
 * =======================================
 * Provides the same component exports as the Clerk adapter but implemented
 * with standard HTML / next-auth/react primitives.
 *
 * Clerk has rich built-in UI (SignIn, SignUp, OrganizationSwitcher, etc.).
 * NextAuth does not, so we provide simple redirect-based or form-based
 * equivalents that match the same API surface consumers expect.
 */

import React, { useState, useEffect } from 'react';
import { SessionProvider, signIn, signOut } from 'next-auth/react';

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------

function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
      {message}
    </div>
  );
}

function SuccessAlert({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
      {message}
    </div>
  );
}

const inputCx =
  'w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-violet-500 focus:border-transparent';

const primaryBtnCx =
  'w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

// ---------------------------------------------------------------------------
// AuthProvider — wraps SessionProvider
// ---------------------------------------------------------------------------

export function AuthProvider({
  children,
  ...rest
}: {
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  return <SessionProvider {...(rest as Record<string, never>)}>{children}</SessionProvider>;
}

// ---------------------------------------------------------------------------
// AuthSignIn — with forgot-password & reset-password modes
// ---------------------------------------------------------------------------

type SignInMode = 'sign-in' | 'forgot-password' | 'reset-password';

export function AuthSignIn(props: {
  routing?: string;
  path?: string;
  appearance?: Record<string, unknown>;
  fallbackRedirectUrl?: string;
  forceRedirectUrl?: string;
  signUpUrl?: string;
  [key: string]: unknown;
}) {
  const redirectUrl = props.forceRedirectUrl || props.fallbackRedirectUrl || '/dashboard';

  // Detect reset-password deep-link from URL params (e.g. from email)
  const [mode, setMode] = useState<SignInMode>('sign-in');
  const [resetToken, setResetToken] = useState('');
  const [resetEmail, setResetEmail] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'reset-password') {
      setMode('reset-password');
      setResetToken(params.get('token') || '');
      setResetEmail(params.get('email') || '');
    }
  }, []);

  if (mode === 'forgot-password') {
    return <ForgotPasswordForm onBack={() => setMode('sign-in')} />;
  }

  if (mode === 'reset-password') {
    return (
      <ResetPasswordForm
        initialToken={resetToken}
        initialEmail={resetEmail}
        onBack={() => setMode('sign-in')}
        onSuccess={() => setMode('sign-in')}
      />
    );
  }

  return <SignInForm redirectUrl={redirectUrl} signUpUrl={props.signUpUrl} onForgotPassword={() => setMode('forgot-password')} />;
}

// ---------------------------------------------------------------------------
// Sign In Form (internal)
// ---------------------------------------------------------------------------

function SignInForm({
  redirectUrl,
  signUpUrl,
  onForgotPassword,
}: {
  redirectUrl: string;
  signUpUrl?: string;
  onForgotPassword: () => void;
}) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <div className="w-full max-w-sm mx-auto space-y-4">
      {error && <ErrorAlert message={error} />}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setLoading(true);
          const form = e.currentTarget;
          const email = (form.elements.namedItem('email') as HTMLInputElement).value;
          const password = (form.elements.namedItem('password') as HTMLInputElement).value;

          try {
            const result = await signIn('credentials', {
              email,
              password,
              redirect: false,
            });

            if (result?.error) {
              setError('Invalid email or password. Please try again.');
              setLoading(false);
            } else if (result?.ok) {
              window.location.href = redirectUrl;
            } else {
              setError('Something went wrong. Please try again.');
              setLoading(false);
            }
          } catch {
            setError('Something went wrong. Please try again.');
            setLoading(false);
          }
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="signin-email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Email
          </label>
          <input id="signin-email" name="email" type="email" required className={inputCx} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="signin-password" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Password
            </label>
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 font-medium"
            >
              Forgot password?
            </button>
          </div>
          <input id="signin-password" name="password" type="password" required className={inputCx} />
        </div>
        <button type="submit" disabled={loading} className={primaryBtnCx}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <div className="space-y-2">
        <OAuthButton provider="github" label="Continue with GitHub" />
        <OAuthButton provider="google" label="Continue with Google" />
      </div>

      {signUpUrl && (
        <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
          Don&apos;t have an account?{' '}
          <a href={signUpUrl} className="text-violet-600 hover:text-violet-700 dark:text-violet-400 font-medium">
            Sign up
          </a>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forgot Password Form (internal)
// ---------------------------------------------------------------------------

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <div className="w-full max-w-sm mx-auto space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Reset your password</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Enter the email address associated with your account and we&apos;ll send you a reset link.
        </p>
      </div>

      {error && <ErrorAlert message={error} />}
      {success && <SuccessAlert message={success} />}

      {!success && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setLoading(true);
            const email = (e.currentTarget.elements.namedItem('email') as HTMLInputElement).value;

            try {
              const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
              });
              if (res.ok) {
                setSuccess('If an account with that email exists, a reset link has been sent. Check your inbox.');
              } else {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'Something went wrong. Please try again.');
              }
            } catch {
              setError('Something went wrong. Please try again.');
            } finally {
              setLoading(false);
            }
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="forgot-email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Email
            </label>
            <input id="forgot-email" name="email" type="email" required className={inputCx} />
          </div>
          <button type="submit" disabled={loading} className={primaryBtnCx}>
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400 font-medium"
      >
        &larr; Back to sign in
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reset Password Form (internal)
// ---------------------------------------------------------------------------

function ResetPasswordForm({
  initialToken,
  initialEmail,
  onBack,
  onSuccess,
}: {
  initialToken: string;
  initialEmail: string;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  if (!initialToken || !initialEmail) {
    return (
      <div className="w-full max-w-sm mx-auto space-y-4">
        <ErrorAlert message="Invalid reset link. Please request a new password reset." />
        <button type="button" onClick={onBack} className="w-full text-center text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400 font-medium">
          &larr; Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Set new password</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Choose a new password for <strong>{initialEmail}</strong>.
        </p>
      </div>

      {error && <ErrorAlert message={error} />}
      {success && <SuccessAlert message={success} />}

      {!success ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            const form = e.currentTarget;
            const password = (form.elements.namedItem('password') as HTMLInputElement).value;
            const confirm = (form.elements.namedItem('confirm') as HTMLInputElement).value;

            if (password.length < 8) {
              setError('Password must be at least 8 characters.');
              return;
            }
            if (password !== confirm) {
              setError('Passwords do not match.');
              return;
            }

            setLoading(true);
            try {
              const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: initialToken, email: initialEmail, password }),
              });
              const data = await res.json().catch(() => ({}));

              if (res.ok) {
                setSuccess('Password reset successfully! You can now sign in with your new password.');
                setTimeout(onSuccess, 2500);
              } else {
                setError(data.error || 'Failed to reset password. Please try again.');
              }
            } catch {
              setError('Something went wrong. Please try again.');
            } finally {
              setLoading(false);
            }
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="reset-password" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              New Password
            </label>
            <input id="reset-password" name="password" type="password" required minLength={8} className={inputCx} />
          </div>
          <div>
            <label htmlFor="reset-confirm" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Confirm Password
            </label>
            <input id="reset-confirm" name="confirm" type="password" required minLength={8} className={inputCx} />
          </div>
          <button type="submit" disabled={loading} className={primaryBtnCx}>
            {loading ? 'Resetting…' : 'Reset Password'}
          </button>
        </form>
      ) : (
        <button type="button" onClick={onSuccess} className={primaryBtnCx}>
          Sign In
        </button>
      )}

      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400 font-medium"
      >
        &larr; Back to sign in
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuthSignUp — registration form with error handling
// ---------------------------------------------------------------------------

export function AuthSignUp(props: {
  routing?: string;
  path?: string;
  appearance?: Record<string, unknown>;
  fallbackRedirectUrl?: string;
  forceRedirectUrl?: string;
  signInUrl?: string;
  [key: string]: unknown;
}) {
  const redirectUrl = props.forceRedirectUrl || props.fallbackRedirectUrl || '/dashboard/onboarding';
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <div className="w-full max-w-sm mx-auto space-y-4">
      {error && <ErrorAlert message={error} />}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setLoading(true);
          const form = e.currentTarget;
          const name = (form.elements.namedItem('name') as HTMLInputElement).value;
          const email = (form.elements.namedItem('email') as HTMLInputElement).value;
          const password = (form.elements.namedItem('password') as HTMLInputElement).value;

          try {
            const res = await fetch('/api/auth/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, email, password }),
            });

            if (res.ok) {
              const result = await signIn('credentials', { email, password, redirect: false });
              if (result?.ok) {
                window.location.href = redirectUrl;
              } else {
                // Registration succeeded but auto-login failed — redirect to sign-in
                window.location.href = '/sign-in';
              }
            } else {
              const data = await res.json().catch(() => ({}));
              setError(data.error || 'Registration failed. Please try again.');
              setLoading(false);
            }
          } catch {
            setError('Something went wrong. Please try again.');
            setLoading(false);
          }
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="signup-name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Full Name
          </label>
          <input id="signup-name" name="name" type="text" required className={inputCx} />
        </div>
        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Email
          </label>
          <input id="signup-email" name="email" type="email" required className={inputCx} />
        </div>
        <div>
          <label htmlFor="signup-password" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Password
          </label>
          <input id="signup-password" name="password" type="password" required minLength={8} className={inputCx} />
          <p className="mt-1 text-xs text-neutral-400">Minimum 8 characters</p>
        </div>
        <button type="submit" disabled={loading} className={primaryBtnCx}>
          {loading ? 'Creating account…' : 'Create Account'}
        </button>
      </form>

      <div className="space-y-2">
        <OAuthButton provider="github" label="Continue with GitHub" />
        <OAuthButton provider="google" label="Continue with Google" />
      </div>

      {props.signInUrl && (
        <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
          Already have an account?{' '}
          <a href={props.signInUrl} className="text-violet-600 hover:text-violet-700 dark:text-violet-400 font-medium">
            Sign in
          </a>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Button Components
// ---------------------------------------------------------------------------

export function AuthSignInButton({
  children,
  mode,
  ...rest
}: {
  children?: React.ReactNode;
  mode?: string;
  [key: string]: unknown;
}) {
  const handleClick = () => {
    // For 'modal' mode in Clerk, we redirect to sign-in page since NextAuth has no modal
    signIn(undefined, { callbackUrl: '/dashboard' });
  };

  if (children) {
    return (
      <span onClick={handleClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleClick()} {...rest}>
        {children}
      </span>
    );
  }

  return (
    <button onClick={handleClick} className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors" {...rest}>
      Sign In
    </button>
  );
}

export function AuthSignUpButton({
  children,
  mode,
  ...rest
}: {
  children?: React.ReactNode;
  mode?: string;
  [key: string]: unknown;
}) {
  const handleClick = () => {
    window.location.href = '/sign-up';
  };

  if (children) {
    return (
      <span onClick={handleClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleClick()} {...rest}>
        {children}
      </span>
    );
  }

  return (
    <button onClick={handleClick} className="px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors" {...rest}>
      Sign Up
    </button>
  );
}

export function AuthSignOutButton({
  children,
  ...rest
}: {
  children?: React.ReactNode;
  [key: string]: unknown;
}) {
  const handleClick = () => {
    signOut({ callbackUrl: '/' });
  };

  if (children) {
    return (
      <span onClick={handleClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleClick()} {...rest}>
        {children}
      </span>
    );
  }

  return (
    <button onClick={handleClick} className="px-4 py-2 text-red-600 hover:text-red-700 transition-colors" {...rest}>
      Sign Out
    </button>
  );
}

// ---------------------------------------------------------------------------
// Org Switcher — proper workspace switcher dropdown for NextAuth
// ---------------------------------------------------------------------------

interface OrgItem {
  id: string;
  name: string;
  slug: string;
  role: string;
  isOwner: boolean;
  planName: string | null;
}

interface ActiveOrgResponse {
  activeOrgId: string | null;
  organizations: OrgItem[];
}

export function AuthOrganizationSwitcher(_props: Record<string, unknown>) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Fetch orgs on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/user/active-org');
        if (!res.ok) throw new Error('Failed to fetch');
        const data: ActiveOrgResponse = await res.json();
        if (!cancelled) {
          setOrgs(data.organizations);
          setActiveOrgId(data.activeOrgId);
        }
      } catch {
        // Silently fail — user may not be on NextAuth provider
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? null;
  const displayName = activeOrg ? activeOrg.name : 'Personal workspace';

  async function switchOrg(orgId: string | null) {
    setSwitching(true);
    setOpen(false);
    try {
      const res = await fetch('/api/user/active-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      if (res.ok) {
        setActiveOrgId(orgId);
        // Notify the hooks store and reload to pick up changes everywhere
        try {
          const { notifyActiveOrgChanged } = await import('./hooks');
          notifyActiveOrgChanged();
        } catch { /* ignore */ }
        window.location.reload();
      }
    } catch {
      // Silently fail
    } finally {
      setSwitching(false);
    }
  }

  // If still loading, show a placeholder trigger
  if (loading) {
    return (
      <div className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-500">
        <span className="flex items-center justify-between">
          <span>Loading workspaces…</span>
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        </span>
      </div>
    );
  }

  // If no organizations exist at all, show a simple link to team page
  if (orgs.length === 0) {
    return (
      <a
        href="/dashboard/team"
        className="block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        <span className="flex items-center justify-between">
          <span>Personal workspace</span>
          <span className="text-neutral-400">&rarr;</span>
        </span>
      </a>
    );
  }

  return (
    <div ref={dropdownRef} className="relative w-full">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        <span className="flex items-center gap-2 truncate">
          <span
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
            style={{ background: activeOrg ? stringToColor(activeOrg.name) : '#8b5cf6' }}
          >
            {activeOrg ? activeOrg.name.charAt(0).toUpperCase() : 'P'}
          </span>
          <span className="truncate">{switching ? 'Switching…' : displayName}</span>
        </span>
        <svg
          className={`h-4 w-4 flex-shrink-0 text-neutral-400 transition-transform dark:text-neutral-500 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown popover */}
      {open && (
        <div className="absolute left-0 z-50 mt-1.5 w-full min-w-[16rem] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl shadow-black/5 ring-1 ring-black/5 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-black/30 dark:ring-white/10">
          {/* Personal workspace option */}
          <button
            type="button"
            onClick={() => switchOrg(null)}
            className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/80 ${
              !activeOrgId ? 'bg-violet-50/60 dark:bg-violet-500/10' : ''
            }`}
          >
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-violet-500 text-xs font-semibold text-white">
              P
            </span>
            <span className="flex flex-col items-start">
              <span className="font-medium text-neutral-900 dark:text-neutral-100">Personal workspace</span>
            </span>
            {!activeOrgId && (
              <svg className="ml-auto h-4 w-4 flex-shrink-0 text-violet-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          {/* Divider */}
          <div className="border-t border-neutral-200/80 dark:border-neutral-700/80" />

          {/* Organization list */}
          {orgs.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => switchOrg(org.id)}
              className={`flex w-full items-center gap-2.5 border-b border-neutral-200/80 px-3 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-neutral-50 dark:border-neutral-700/80 dark:hover:bg-neutral-800/80 ${
                activeOrgId === org.id ? 'bg-violet-50/60 dark:bg-violet-500/10' : ''
              }`}
            >
              <span
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
                style={{ background: stringToColor(org.name) }}
              >
                {org.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex flex-col items-start truncate">
                <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate">{org.name}</span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {org.isOwner ? 'Owner' : org.role === 'ADMIN' ? 'Admin' : 'Member'}
                </span>
              </span>
              {activeOrgId === org.id && (
                <svg className="ml-auto h-4 w-4 flex-shrink-0 text-violet-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}

          {/* Footer — manage workspace link */}
          <div className="border-t border-neutral-200 bg-neutral-50/70 dark:border-neutral-700 dark:bg-neutral-950/40">
            <a
              href="/dashboard/team"
              className="flex min-h-[2.75rem] w-full items-center px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Manage workspace →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/** Deterministic color from a string (for org avatars) */
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
    '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
    '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
  ];
  return colors[Math.abs(hash) % colors.length];
}

// ---------------------------------------------------------------------------
// UserProfile — redirect-based
// ---------------------------------------------------------------------------

export function AuthUserProfile(_props: Record<string, unknown>) {
  return (
    <div className="text-center py-8">
      <p className="text-neutral-600 dark:text-neutral-400 mb-4">
        Profile management is available in your dashboard settings.
      </p>
      <a
        href="/dashboard/profile"
        className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
      >
        Go to Settings
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Theme — no-op for NextAuth
// ---------------------------------------------------------------------------

export const authDarkTheme = undefined;

// ---------------------------------------------------------------------------
// Internal: OAuth Button
// ---------------------------------------------------------------------------

function OAuthButton({ provider, label }: { provider: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => signIn(provider)}
      className="w-full py-2.5 border border-neutral-300 dark:border-neutral-600 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-sm font-medium"
    >
      {label}
    </button>
  );
}
