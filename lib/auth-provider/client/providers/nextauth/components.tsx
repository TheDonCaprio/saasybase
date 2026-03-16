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

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { SessionProvider, signIn, signOut, useSession } from 'next-auth/react';
import { validateAndFormatPersonName } from '@/lib/name-validation';

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------

function ErrorAlert({ message }: { message: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
      {message}
    </div>
  );
}

function SuccessAlert({ message }: { message: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
      {message}
    </div>
  );
}

function InfoAlert({ message }: { message: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200">
      {message}
    </div>
  );
}

function ButtonIconWrap({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center">{children}</span>;
}

function MagicLinkIcon() {
  return (
    <svg className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3.333 6.667 10 11.667l6.667-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3.333" y="5" width="13.334" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.25-.96 2.3-2.04 3.01l3.3 2.56c1.92-1.77 3.04-4.37 3.04-7.46 0-.71-.06-1.39-.19-2.06H12Z" />
      <path fill="#34A853" d="M12 22c2.75 0 5.05-.91 6.73-2.47l-3.3-2.56c-.91.61-2.08.98-3.43.98-2.64 0-4.88-1.78-5.68-4.18l-3.41 2.63A10 10 0 0 0 12 22Z" />
      <path fill="#4A90E2" d="M6.32 13.77A6 6 0 0 1 6 12c0-.61.11-1.2.32-1.77L2.91 7.6A10 10 0 0 0 2 12c0 1.61.39 3.13 1.09 4.4l3.23-2.63Z" />
      <path fill="#FBBC05" d="M12 6.05c1.5 0 2.85.52 3.91 1.54l2.93-2.93C17.04 2.98 14.75 2 12 2a10 10 0 0 0-8.91 5.6l3.41 2.63C7.12 7.83 9.36 6.05 12 6.05Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.41-4.04-1.41-.55-1.38-1.33-1.75-1.33-1.75-1.09-.75.08-.73.08-.73 1.2.09 1.83 1.22 1.83 1.22 1.07 1.83 2.81 1.3 3.49.99.11-.77.42-1.3.76-1.6-2.67-.3-5.47-1.32-5.47-5.87 0-1.3.47-2.37 1.22-3.2-.12-.3-.53-1.52.12-3.16 0 0 1-.32 3.3 1.22a11.5 11.5 0 0 1 6 0c2.3-1.54 3.3-1.22 3.3-1.22.65 1.64.24 2.86.12 3.16.76.83 1.22 1.9 1.22 3.2 0 4.56-2.81 5.56-5.49 5.86.43.37.82 1.1.82 2.23v3.3c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

const inputCx =
  'w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-violet-500 focus:border-transparent';

const primaryBtnCx =
  'w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

type AuthModalMode = 'signin' | 'signup';

function getResetPasswordParams() {
  if (typeof window === 'undefined') {
    return {
      mode: 'sign-in' as SignInMode,
      token: '',
      email: '',
    };
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'reset-password') {
    return {
      mode: 'reset-password' as SignInMode,
      token: params.get('token') || '',
      email: params.get('email') || '',
    };
  }

  return {
    mode: 'sign-in' as SignInMode,
    token: '',
    email: '',
  };
}

function AuthModalShell({
  open,
  mode,
  onClose,
  onSwitch,
}: {
  open: boolean;
  mode: AuthModalMode;
  onClose: () => void;
  onSwitch: (mode: AuthModalMode) => void;
}) {
  const [footerNotice, setFooterNotice] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setFooterNotice(null);
    onClose();
  }, [onClose]);

  const handleSwitch = useCallback((nextMode: AuthModalMode) => {
    setFooterNotice(null);
    onSwitch(nextMode);
  }, [onSwitch]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, handleClose]);

  if (!open || typeof document === 'undefined') return null;

  const isSignIn = mode === 'signin';

  return createPortal(
    <div data-auth-modal-root="true" className="fixed inset-0 z-[100] flex items-start justify-center bg-black/55 px-4 pb-4 pt-[7vh] backdrop-blur-sm sm:pt-[9vh]" onClick={handleClose}>
      <div
        data-auth-modal-root="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        onClick={(event) => event.stopPropagation()}
        className="relative max-h-[86vh] w-full max-w-md overflow-y-auto rounded-2xl border border-neutral-200 bg-white shadow-2xl shadow-black/20 dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-black/50"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-neutral-200 bg-white/95 px-6 pb-4 pt-5 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
          <div className="space-y-1">
            <h2 id="auth-modal-title" className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {isSignIn ? 'Sign in to your account' : 'Create your account'}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {isSignIn ? 'Access your workspace, billing, and account settings.' : 'Create an account without leaving this page.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close auth dialog"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {isSignIn ? (
            <AuthSignIn fallbackRedirectUrl="/dashboard" forceRedirectUrl="/dashboard" onMagicLinkSentChange={setFooterNotice} />
          ) : (
            <AuthSignUp fallbackRedirectUrl="/dashboard/onboarding" forceRedirectUrl="/dashboard/onboarding" />
          )}
        </div>

        <div className="border-t border-neutral-200 bg-neutral-50 px-6 py-4 text-center text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400">
          {footerNotice && (
            <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              {footerNotice}
            </div>
          )}
          {isSignIn ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => handleSwitch('signup')}
                className="font-semibold text-violet-600 transition-colors hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => handleSwitch('signin')}
                className="font-semibold text-violet-600 transition-colors hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

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

type SignInMode = 'sign-in' | 'forgot-password' | 'reset-password' | 'magic-link';

export function AuthSignIn(props: {
  routing?: string;
  path?: string;
  appearance?: Record<string, unknown>;
  fallbackRedirectUrl?: string;
  forceRedirectUrl?: string;
  signUpUrl?: string;
  onMagicLinkSentChange?: (message: string | null) => void;
  [key: string]: unknown;
}) {
  const redirectUrl = props.forceRedirectUrl || props.fallbackRedirectUrl || '/dashboard';
  const initialResetParams = getResetPasswordParams();

  // Detect reset-password deep-link from URL params (e.g. from email)
  const [mode, setMode] = useState<SignInMode>(initialResetParams.mode);
  const [resetToken] = useState(initialResetParams.token);
  const [resetEmail] = useState(initialResetParams.email);

  if (mode === 'forgot-password') {
    return <ForgotPasswordForm onBack={() => setMode('sign-in')} />;
  }

  if (mode === 'magic-link') {
    return <MagicLinkForm redirectUrl={redirectUrl} onBack={() => setMode('sign-in')} onSentChange={props.onMagicLinkSentChange} />;
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

  return (
    <SignInForm
      redirectUrl={redirectUrl}
      signUpUrl={props.signUpUrl}
      onForgotPassword={() => setMode('forgot-password')}
      onUseMagicLink={() => setMode('magic-link')}
      onMagicLinkSentChange={props.onMagicLinkSentChange}
    />
  );
}

// ---------------------------------------------------------------------------
// Sign In Form (internal)
// ---------------------------------------------------------------------------

function SignInForm({
  redirectUrl,
  signUpUrl,
  onForgotPassword,
  onUseMagicLink,
  onMagicLinkSentChange,
}: {
  redirectUrl: string;
  signUpUrl?: string;
  onForgotPassword: () => void;
  onUseMagicLink: () => void;
  onMagicLinkSentChange?: (message: string | null) => void;
}) {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'info' | 'success'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    onMagicLinkSentChange?.(null);

    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const verification = params.get('verification');
    const errorParam = params.get('error');

    if (verification === 'success') {
      setNotice({ tone: 'success', message: 'Your email has been verified. Please sign in to continue.' });
      return;
    }

    if (verification === 'check-email') {
      setNotice({
        tone: 'info',
        message: 'Check your inbox for a verification link, then come back here to sign in.',
      });
      return;
    }

    if (errorParam === 'expired-verification-link') {
      setNotice({
        tone: 'info',
        message: 'That verification link has expired. Sign in to resend a fresh verification email.',
      });
      return;
    }

    if (errorParam === 'invalid-verification-link') {
      setError('That verification link is invalid. Please request a new verification email.');
      return;
    }

    if (errorParam === 'verification-failed') {
      setError('We could not verify your email. Please try again or request a new verification email.');
    }
  }, [onMagicLinkSentChange]);

  return (
    <div className="w-full max-w-sm mx-auto space-y-4">
      {notice && (notice.tone === 'success' ? <SuccessAlert message={notice.message} /> : <InfoAlert message={notice.message} />)}
      {error && (
        <ErrorAlert
          message={
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              {pendingVerificationEmail && error === 'Your email is not verified.' && (
                <button
                  type="button"
                  disabled={resendLoading}
                  onClick={async () => {
                    setResendLoading(true);
                    setError('');
                    try {
                      const response = await fetch('/api/auth/resend-verification', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: pendingVerificationEmail }),
                      });
                      const data = await response.json().catch(() => ({}));

                      if (!response.ok) {
                        setError(data.error || 'Could not resend the verification email.');
                        return;
                      }

                      setNotice({
                        tone: 'success',
                        message: data.message || 'A new verification email has been sent.',
                      });
                    } catch {
                      setError('Could not resend the verification email.');
                    } finally {
                      setResendLoading(false);
                    }
                  }}
                  className="text-left font-semibold text-red-700 underline underline-offset-4 transition hover:text-red-800 disabled:opacity-50 dark:text-red-200 dark:hover:text-red-100"
                >
                  {resendLoading ? 'Sending…' : 'Resend verification email'}
                </button>
              )}
            </div>
          }
        />
      )}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setPendingVerificationEmail('');
          setLoading(true);
          const form = e.currentTarget;
          const email = (form.elements.namedItem('email') as HTMLInputElement).value;
          const password = (form.elements.namedItem('password') as HTMLInputElement).value;

          try {
            const preflight = await fetch('/api/auth/login-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password }),
            });

            const preflightData = await preflight.json().catch(() => null);

            if (!preflight.ok) {
              if (preflightData?.code === 'EMAIL_NOT_VERIFIED') {
                setPendingVerificationEmail(email);
              }
              setError(preflightData?.error || 'Invalid email or password. Please try again.');
              setLoading(false);
              return;
            }

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
        <button
          type="button"
          onClick={onUseMagicLink}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <ButtonIconWrap>
            <MagicLinkIcon />
          </ButtonIconWrap>
          Email me a magic link
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

function MagicLinkForm({
  redirectUrl,
  onBack,
  onSentChange,
}: {
  redirectUrl: string;
  onBack: () => void;
  onSentChange?: (message: string | null) => void;
}) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    onSentChange?.(null);
  }, [onSentChange]);

  return (
    <div className="w-full max-w-sm mx-auto space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Sign in with a magic link</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Enter your email and we&apos;ll send you a secure sign-in link.
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
              const result = await signIn('nodemailer', {
                email,
                redirect: false,
                callbackUrl: redirectUrl,
              });

              if (result?.error) {
                setError('We could not send a sign-in link right now. Please try again.');
                return;
              }

              const message = 'Check your inbox for a secure sign-in link. It usually arrives within a minute.';
              setSuccess('If that email is eligible, we just sent a secure sign-in link.');
              onSentChange?.(message);
            } catch {
              setError('We could not send a sign-in link right now. Please try again.');
            } finally {
              setLoading(false);
            }
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="magic-link-email" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Email
            </label>
            <input id="magic-link-email" name="email" type="email" required className={inputCx} />
          </div>
          <button type="submit" disabled={loading} className={primaryBtnCx}>
            <span className="inline-flex items-center justify-center gap-2">
              <ButtonIconWrap>
                <MagicLinkIcon />
              </ButtonIconWrap>
              {loading ? 'Sending…' : 'Send Magic Link'}
            </span>
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={() => {
          onSentChange?.(null);
          onBack();
        }}
        className="w-full text-center text-sm font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400"
      >
        &larr; Back to sign in with password
      </button>
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
          const firstName = (form.elements.namedItem('firstName') as HTMLInputElement).value;
          const lastName = (form.elements.namedItem('lastName') as HTMLInputElement).value;
          const email = (form.elements.namedItem('email') as HTMLInputElement).value;
          const password = (form.elements.namedItem('password') as HTMLInputElement).value;

          const validatedName = validateAndFormatPersonName({ firstName, lastName });
          if (!validatedName.ok) {
            setError(validatedName.error || 'Please enter a valid name.');
            setLoading(false);
            return;
          }

          try {
            const res = await fetch('/api/auth/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ firstName, lastName, email, password }),
            });

            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              if (data?.requiresVerification) {
                window.location.href = `/sign-in?verification=check-email`;
              } else {
                const result = await signIn('credentials', { email, password, redirect: false });
                if (result?.ok) {
                  window.location.href = redirectUrl;
                } else {
                  // Registration succeeded but auto-login failed — redirect to sign-in
                  window.location.href = '/sign-in';
                }
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="signup-first-name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              First name
            </label>
            <input id="signup-first-name" name="firstName" type="text" required className={inputCx} />
          </div>
          <div>
            <label htmlFor="signup-last-name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Last name
            </label>
            <input id="signup-last-name" name="lastName" type="text" className={inputCx} />
          </div>
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
          <p className="mt-1 text-xs text-neutral-400">Minimum 8 characters. Password must contain at least an uppercase letter, a lowercase letter, and a number.</p>
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
  const [open, setOpen] = useState(false);
  const [currentMode, setCurrentMode] = useState<AuthModalMode>('signin');

  const handleClick = () => {
    if (mode === 'modal') {
      setCurrentMode('signin');
      setOpen(true);
      return;
    }

    signIn(undefined, { callbackUrl: '/dashboard' });
  };

  if (children) {
    return (
      <>
        <span onClick={handleClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleClick()} {...rest}>
          {children}
        </span>
        <AuthModalShell open={open} mode={currentMode} onClose={() => setOpen(false)} onSwitch={setCurrentMode} />
      </>
    );
  }

  return (
    <>
      <button onClick={handleClick} className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors" {...rest}>
        Sign In
      </button>
      <AuthModalShell open={open} mode={currentMode} onClose={() => setOpen(false)} onSwitch={setCurrentMode} />
    </>
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
  const [open, setOpen] = useState(false);
  const [currentMode, setCurrentMode] = useState<AuthModalMode>('signup');

  const handleClick = () => {
    if (mode === 'modal') {
      setCurrentMode('signup');
      setOpen(true);
      return;
    }

    window.location.href = '/sign-up';
  };

  if (children) {
    return (
      <>
        <span onClick={handleClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleClick()} {...rest}>
          {children}
        </span>
        <AuthModalShell open={open} mode={currentMode} onClose={() => setOpen(false)} onSwitch={setCurrentMode} />
      </>
    );
  }

  return (
    <>
      <button onClick={handleClick} className="px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors" {...rest}>
        Sign Up
      </button>
      <AuthModalShell open={open} mode={currentMode} onClose={() => setOpen(false)} onSwitch={setCurrentMode} />
    </>
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  };

  if (children) {
    if (React.isValidElement(children)) {
      const child = children as React.ReactElement<{
        onClick?: (event: React.MouseEvent<HTMLElement>) => void;
        onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
        type?: string;
      }>;

      const mergedProps: {
        onClick: (event: React.MouseEvent<HTMLElement>) => void;
        onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
        type?: string;
        [key: string]: unknown;
      } = {
        ...rest,
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          child.props.onClick?.(event);
          if (!event.defaultPrevented) {
            handleClick();
          }
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
          child.props.onKeyDown?.(event);
          if (!event.defaultPrevented) {
            handleKeyDown(event);
          }
        },
      };

      if (typeof child.type === 'string' && child.type === 'button' && !child.props.type) {
        mergedProps.type = 'button';
      }

      return React.cloneElement(child, mergedProps);
    }

    return (
      <span onClick={handleClick} role="button" tabIndex={0} onKeyDown={handleKeyDown} {...rest}>
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

export function AuthOrganizationSwitcher() {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Fetch orgs on mount
  useEffect(() => {
    if (status === 'loading') {
      return;
    }

    if (status !== 'authenticated') {
      setOrgs([]);
      setActiveOrgId(null);
      setLoading(false);
      return;
    }

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
  }, [status]);

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
        const data = await res.json() as { activeOrgId?: string | null };
        const nextActiveOrgId = typeof data.activeOrgId === 'string' ? data.activeOrgId : null;
        setActiveOrgId(nextActiveOrgId);
        // Notify the hooks store and reload to pick up changes everywhere
        try {
          const { notifyActiveOrgChanged } = await import('./hooks');
          notifyActiveOrgChanged(nextActiveOrgId);
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
      <div className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 cursor-default">
        <span className="flex items-center gap-2 truncate">
          <span
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
            style={{ background: '#8b5cf6' }}
          >
            P
          </span>
          <span className="truncate">Personal workspace</span>
        </span>
      </div>
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
            className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/80 ${!activeOrgId ? 'bg-violet-50/60 dark:bg-violet-500/10' : ''
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
              className={`flex w-full items-center gap-2.5 border-b border-neutral-200/80 px-3 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-neutral-50 dark:border-neutral-700/80 dark:hover:bg-neutral-800/80 ${activeOrgId === org.id ? 'bg-violet-50/60 dark:bg-violet-500/10' : ''
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
            <Link
              href="/dashboard/team"
              className="flex min-h-[2.75rem] w-full items-center px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Manage workspace →
            </Link>
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

export function AuthUserProfile() {
  return (
    <div className="text-center py-8">
      <p className="text-neutral-600 dark:text-neutral-400 mb-4">
        Profile management is available in your dashboard settings.
      </p>
      <Link
        href="/dashboard/profile"
        className="inline-flex px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
      >
        Go to Settings
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Theme — no-op for NextAuth
// ---------------------------------------------------------------------------

export const authDarkTheme = undefined;

// ---------------------------------------------------------------------------
// Loading State Boundaries (NextAuth NO-OP)
// ---------------------------------------------------------------------------

export function AuthLoading() {
  // NextAuth manages its session inherently without throwing async suspense boundaries globally like Clerk
  return null;
}

export function AuthLoaded({ children }: { children: React.ReactNode }) {
  // Always render children for NextAuth
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Internal: OAuth Button
// ---------------------------------------------------------------------------

function OAuthButton({ provider, label }: { provider: string; label: string }) {
  const icon = provider === 'google' ? <GoogleIcon /> : provider === 'github' ? <GitHubIcon /> : null;

  return (
    <button
      type="button"
      onClick={() => signIn(provider)}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
    >
      {icon && <ButtonIconWrap>{icon}</ButtonIconWrap>}
      {label}
    </button>
  );
}
