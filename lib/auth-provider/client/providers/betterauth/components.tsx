'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { betterAuthClient } from '@/lib/better-auth-client';
import { useAuthInstance, useAuthSession, useAuthUser } from './hooks';

type AuthModalMode = 'signin' | 'signup' | 'forgot-password' | 'reset-password' | 'magic-link';

type OAuthProviderId = 'github' | 'google';

type AuthActionResult = {
  data?: {
    redirect?: boolean;
    url?: string | null;
  } | null;
  error?: {
    message?: string;
    code?: string;
    status?: number;
  } | null;
};

function getRedirectTarget(explicit?: string, fallback?: string) {
  return explicit || fallback || '/dashboard';
}

function getBasePath(path: string | undefined, fallback: string) {
  return path && path.startsWith('/') ? path : fallback;
}

function withQueryParams(pathOrUrl: string, params: Record<string, string | undefined>) {
  if (typeof window === 'undefined') {
    return pathOrUrl;
  }

  const url = pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')
    ? new URL(pathOrUrl)
    : new URL(pathOrUrl, window.location.origin);

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
  }

  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return url.toString();
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function toAbsoluteUrl(pathOrUrl: string) {
  if (typeof window === 'undefined') {
    return pathOrUrl;
  }

  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }

  return new URL(pathOrUrl, window.location.origin).toString();
}

function getSignInEntryUrl(signInUrl?: string, path?: string) {
  return signInUrl || getBasePath(path, '/sign-in');
}

function buildVerificationSuccessUrl(options: {
  signInUrl?: string;
  path?: string;
  redirectUrl: string;
}) {
  return withQueryParams(getSignInEntryUrl(options.signInUrl, options.path), {
    verification: 'success',
    redirect_url: options.redirectUrl,
  });
}

function buildVerificationCheckEmailUrl(options: {
  signInUrl?: string;
  path?: string;
  redirectUrl: string;
  email?: string;
}) {
  return withQueryParams(getSignInEntryUrl(options.signInUrl, options.path), {
    verification: 'check-email',
    redirect_url: options.redirectUrl,
    email: options.email,
  });
}

function getVerificationErrorMessage(errorParam: string) {
  switch (errorParam) {
    case 'invalid-verification-link':
    case 'invalid_token':
    case 'invalid-token':
      return 'That verification link is invalid. Please request a new verification email.';
    case 'expired-verification-link':
    case 'token_expired':
    case 'expired_token':
    case 'expired-token':
      return 'That verification link has expired. Sign in to resend a fresh verification email.';
    case 'verification-failed':
    case 'user_not_found':
      return 'We could not verify your email. Please try again or request a new verification email.';
    case 'attempts_exceeded':
    case 'attempts-exceeded':
      return 'That sign-in link has already been used. Request a new magic link.';
    case 'new_user_signup_disabled':
    case 'new-user-signup-disabled':
      return 'No account exists for this email. Sign up first or try another address.';
    case 'user-suspended-temporary':
      return 'Your account is temporarily suspended. Contact support to restore access.';
    case 'user-suspended-permanent':
      return 'Your account has been permanently suspended. Contact support if you believe this is a mistake.';
    default:
      return null;
  }
}

function readSignInQueryState() {
  if (typeof window === 'undefined') {
    return {
      email: '',
      error: null as string | null,
      success: null as string | null,
      verificationEmail: null as string | null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const email = params.get('email') || '';
  const verification = params.get('verification');
  const errorParam = params.get('error')?.toLowerCase() || '';
  const verificationError = getVerificationErrorMessage(errorParam);

  if (verificationError) {
    return {
      email,
      error: verificationError,
      success: null,
      verificationEmail: email || null,
    };
  }

  if (verification === 'success') {
    return {
      email,
      error: null,
      success: 'Your email has been verified. Sign in to continue.',
      verificationEmail: null,
    };
  }

  if (verification === 'check-email') {
    return {
      email,
      error: null,
      success: 'Verification link sent. Check your inbox, then sign in after you confirm your email.',
      verificationEmail: email || null,
    };
  }

  if (params.get('reset') === 'success') {
    return {
      email,
      error: null,
      success: 'Password updated. Sign in with your new password.',
      verificationEmail: null,
    };
  }

  return {
    email,
    error: null,
    success: null,
    verificationEmail: null,
  };
}

function getResetRedirectTarget(path?: string) {
  if (typeof window === 'undefined') {
    return '/sign-in?mode=reset-password';
  }

  const resolvedPath = getBasePath(path, '/sign-in');
  return `${window.location.origin}${resolvedPath}?mode=reset-password`;
}

function readUrlMode(pathnameFallback: AuthModalMode): AuthModalMode {
  if (typeof window === 'undefined') {
    return pathnameFallback;
  }

  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  if (mode === 'forgot-password' || mode === 'reset-password' || mode === 'signup' || mode === 'signin' || mode === 'magic-link') {
    return mode;
  }

  return pathnameFallback;
}

function readResetState() {
  if (typeof window === 'undefined') {
    return {
      token: null as string | null,
      error: null as string | null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const errorParam = params.get('error')?.toLowerCase() || '';

  return {
    token: params.get('token'),
    error: errorParam === 'invalid_token' || errorParam === 'invalid-token'
      ? 'This password reset link is invalid or has expired. Request a new one.'
      : null,
  };
}

function buildMagicLinkErrorUrl(options: {
  signInUrl?: string;
  path?: string;
  redirectUrl: string;
  email?: string;
}) {
  return withQueryParams(getSignInEntryUrl(options.signInUrl, options.path), {
    redirect_url: options.redirectUrl,
    email: options.email,
  });
}

function maybeRedirect(result: AuthActionResult, fallbackUrl: string) {
  const targetUrl = result.data?.url || fallbackUrl;
  if (targetUrl) {
    window.location.href = targetUrl;
  }
}

function getErrorMessage(error: AuthActionResult['error'], fallback: string) {
  return error?.message || fallback;
}

async function runCredentialPreflight(email: string, password: string) {
  const response = await fetch('/api/auth/login-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json().catch(() => null);
  return { response, data };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm text-slate-700 dark:text-neutral-200">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-slate-400 focus:border-transparent focus:ring-2 focus:ring-violet-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 ${className ?? ''}`.trim()}
    />
  );
}

function PasswordInput({
  visible,
  onToggle,
  toggleLabel,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  visible: boolean;
  onToggle: () => void;
  toggleLabel: { show: string; hide: string };
}) {
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-10" />
      <button
        type="button"
        aria-label={visible ? toggleLabel.hide : toggleLabel.show}
        onClick={onToggle}
        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-neutral-500 transition hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function Message({
  tone,
  children,
}: {
  tone: 'error' | 'success';
  children: React.ReactNode;
}) {
  const className = tone === 'error'
    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100';

  return <div className={`rounded-xl border px-3 py-2.5 text-sm ${className}`}>{children}</div>;
}

const authCardClass = 'w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl shadow-black/10 dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-black/40';
const authContentClass = 'w-full max-w-sm mx-auto space-y-4';
const authHeadingClass = 'text-xl font-semibold text-neutral-900 dark:text-neutral-100';
const authSubtitleClass = 'text-sm text-slate-500 dark:text-neutral-400';
const authPrimaryButtonClass = 'w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60';
const authSecondaryButtonClass = 'w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700';
const authAccentLinkClass = 'text-violet-600 transition hover:text-violet-500 dark:text-violet-300 dark:hover:text-violet-200';
const authMutedLinkClass = 'text-slate-600 transition hover:text-slate-900 dark:text-neutral-300 dark:hover:text-white';
const authPanelClass = 'rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.8-4.1 2.8-6.9 0-.7-.1-1.5-.2-2.2H12z" />
      <path fill="#34A853" d="M12 21c2.6 0 4.8-.9 6.4-2.5l-3.1-2.4c-.9.6-2 .9-3.3.9-2.5 0-4.6-1.7-5.4-3.9l-3.2 2.5C5 18.7 8.2 21 12 21z" />
      <path fill="#4A90E2" d="M6.6 13.1c-.2-.6-.4-1.2-.4-1.9s.1-1.3.4-1.9L3.4 6.8C2.8 8 2.5 9.3 2.5 11.2s.3 3.2.9 4.4l3.2-2.5z" />
      <path fill="#FBBC05" d="M12 5.4c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.8 2.4 14.6 1.5 12 1.5 8.2 1.5 5 3.8 3.4 6.8l3.2 2.5C7.4 7.1 9.5 5.4 12 5.4z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M12 .5C5.6.5.5 5.7.5 12.1c0 5.1 3.3 9.4 7.8 11 .6.1.8-.3.8-.6v-2.1c-3.2.7-3.9-1.4-3.9-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.8 1.4 3.5 1.1.1-.8.4-1.4.8-1.7-2.5-.3-5.2-1.3-5.2-5.8 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11 11 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.3 2.9.1 3.2.8.9 1.2 1.9 1.2 3.2 0 4.5-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6 4.6-1.5 7.8-5.9 7.8-11C23.5 5.7 18.4.5 12 .5Z" />
    </svg>
  );
}
 
function EyeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.46 21.46 0 0 1 5.06-5.94" />
      <path d="M1 1l22 22" />
      <path d="M9.53 9.53A3.5 3.5 0 0 0 14.47 14.47" />
    </svg>
  );
}

function useAvailableOAuthProviders() {
  const [providers, setProviders] = useState<{ github: boolean; google: boolean }>({
    github: false,
    google: false,
  });

  useEffect(() => {
    let active = true;

    fetch('/api/auth/oauth-providers', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          return { github: false, google: false };
        }

        return response.json() as Promise<{ github?: boolean; google?: boolean }>;
      })
      .then((resolvedProviders) => {
        if (!active) {
          return;
        }

        setProviders({
          github: resolvedProviders.github ?? false,
          google: resolvedProviders.google ?? false,
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setProviders({ github: false, google: false });
      });

    return () => {
      active = false;
    };
  }, []);

  return providers;
}

function OAuthButton({
  provider,
  label,
  callbackURL,
  onError,
  onPendingChange,
  requestSignUp = false,
}: {
  provider: OAuthProviderId;
  label: string;
  callbackURL: string;
  onError: (message: string | null) => void;
  onPendingChange: (pending: boolean) => void;
  requestSignUp?: boolean;
}) {
  const icon = provider === 'google' ? <GoogleIcon /> : <GitHubIcon />;

  async function handleClick() {
    onPendingChange(true);
    onError(null);

    const result = await betterAuthClient.signIn.social({
      provider,
      callbackURL,
      errorCallbackURL: callbackURL,
      ...(requestSignUp ? { requestSignUp: true } : {}),
    }) as AuthActionResult;

    onPendingChange(false);

    if (result.error) {
      onError(getErrorMessage(result.error, `Unable to continue with ${provider}.`));
      return;
    }

    maybeRedirect(result, callbackURL);
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function OAuthButtons({
  callbackURL,
  requestSignUp = false,
  onError,
  onPendingChange,
}: {
  callbackURL: string;
  requestSignUp?: boolean;
  onError: (message: string | null) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const { github, google } = useAvailableOAuthProviders();

  if (!github && !google) {
    return null;
  }

  return (
    <div className="space-y-2">
      {github ? (
        <OAuthButton
          provider="github"
          label="Continue with GitHub"
          callbackURL={callbackURL}
          requestSignUp={requestSignUp}
          onError={onError}
          onPendingChange={onPendingChange}
        />
      ) : null}
      {google ? (
        <OAuthButton
          provider="google"
          label="Continue with Google"
          callbackURL={callbackURL}
          requestSignUp={requestSignUp}
          onError={onError}
          onPendingChange={onPendingChange}
        />
      ) : null}
    </div>
  );
}

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className={authCardClass}>
      {children}
    </div>
  );
}

function SignInForm({
  forceRedirectUrl,
  fallbackRedirectUrl,
  signUpUrl,
  path,
  embedded = false,
  onSwitch,
}: {
  forceRedirectUrl?: string;
  fallbackRedirectUrl?: string;
  signUpUrl?: string;
  path?: string;
  embedded?: boolean;
  onSwitch?: (mode: AuthModalMode) => void;
}) {
  const initialQueryState = useMemo(() => readSignInQueryState(), []);
  const [email, setEmail] = useState(initialQueryState.email);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialQueryState.error);
  const [success, setSuccess] = useState<string | null>(initialQueryState.success);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(initialQueryState.verificationEmail);
  const redirectUrl = getRedirectTarget(forceRedirectUrl, fallbackRedirectUrl);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const { response: preflight, data: preflightData } = await runCredentialPreflight(email, password);

      if (!preflight.ok) {
        if (preflightData?.code === 'EMAIL_NOT_VERIFIED') {
          setVerificationEmail(email);
        }

        setPending(false);
        setError(preflightData?.error || 'Unable to sign in.');
        return;
      }
    } catch {
      setPending(false);
      setError('Something went wrong. Please try again.');
      return;
    }

    const result = await betterAuthClient.signIn.email({
      email,
      password,
      callbackURL: redirectUrl,
      rememberMe: true,
    }) as AuthActionResult;

    setPending(false);

    if (result.error) {
      if (result.error.code === 'EMAIL_NOT_VERIFIED') {
        setVerificationEmail(email);
      }
      setError(getErrorMessage(result.error, 'Unable to sign in.'));
      return;
    }

    maybeRedirect(result, redirectUrl);
  }

  async function resendVerification() {
    if (!verificationEmail) {
      return;
    }

    setPending(true);
    setError(null);
    const redirectUrl = getRedirectTarget(forceRedirectUrl, fallbackRedirectUrl);
    const result = await betterAuthClient.sendVerificationEmail({
      email: verificationEmail,
      callbackURL: toAbsoluteUrl(buildVerificationSuccessUrl({
        path,
        redirectUrl,
      })),
    }) as AuthActionResult;
    setPending(false);

    if (result.error) {
      setError(getErrorMessage(result.error, 'Unable to resend verification email.'));
      return;
    }

    setSuccess('Verification email sent. Check your inbox.');
  }

  const content = (
    <div className={authContentClass}>
      <div className="space-y-1.5">
        <h2 className={authHeadingClass}>Sign in</h2>
        <p className={authSubtitleClass}>Use your email and password to access your account.</p>
      </div>

      {error ? <Message tone="error">{error}</Message> : null}
      {success ? <Message tone="success">{success}</Message> : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email address">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>

        <Field label="Password">
          <PasswordInput
            visible={showPassword}
            onToggle={() => setShowPassword((current) => !current)}
            toggleLabel={{ show: 'Show password', hide: 'Hide password' }}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>

        <div className="flex items-center justify-between gap-4 text-sm">
          <button
            type="button"
            onClick={() => onSwitch ? onSwitch('forgot-password') : (window.location.href = `${getBasePath(path, '/sign-in')}?mode=forgot-password`)}
            className={authAccentLinkClass}
          >
            Forgot password?
          </button>

          {onSwitch ? (
            <button
              type="button"
              onClick={() => onSwitch('signup')}
              className={authMutedLinkClass}
            >
              Create account
            </button>
          ) : signUpUrl ? (
            <Link href={signUpUrl} className={authMutedLinkClass}>
              Create account
            </Link>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending}
          className={authPrimaryButtonClass}
        >
          {pending ? 'Signing in...' : 'Sign in'}
        </button>

        <button
          type="button"
          onClick={() => onSwitch ? onSwitch('magic-link') : (window.location.href = `${getBasePath(path, '/sign-in')}?mode=magic-link`)}
          className={authSecondaryButtonClass}
        >
          Email me a magic link
        </button>
      </form>

      <OAuthButtons
        callbackURL={redirectUrl}
        onError={setError}
        onPendingChange={setPending}
      />

      {verificationEmail ? (
        <div className={authPanelClass}>
          <p>Email verification is still required for this account.</p>
          <button
            type="button"
            onClick={resendVerification}
            disabled={pending}
            className={`${authAccentLinkClass} mt-3 disabled:opacity-60`}
          >
            Resend verification email
          </button>
        </div>
      ) : null}
    </div>
  );

  return embedded ? content : <AuthCard>{content}</AuthCard>;
}

function MagicLinkForm({
  forceRedirectUrl,
  fallbackRedirectUrl,
  path,
  embedded = false,
  onSwitch,
}: {
  forceRedirectUrl?: string;
  fallbackRedirectUrl?: string;
  path?: string;
  embedded?: boolean;
  onSwitch?: (mode: AuthModalMode) => void;
}) {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);

    const redirectUrl = getRedirectTarget(forceRedirectUrl, fallbackRedirectUrl);
    const response = await fetch('/api/auth/magic-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        callbackURL: toAbsoluteUrl(redirectUrl),
        errorCallbackURL: toAbsoluteUrl(buildMagicLinkErrorUrl({ path, redirectUrl, email })),
      }),
    });
    const result = await response.json().catch(() => null) as { error?: string; message?: string } | null;

    setPending(false);

    if (!response.ok) {
      setError(result?.error || 'Unable to send a magic link right now.');
      return;
    }

    setSuccess(result?.message || 'If that email is eligible, a sign-in link has been sent.');
  }

  const content = (
    <div className={authContentClass}>
      <div className="space-y-1.5">
        <h2 className={authHeadingClass}>Sign in with a magic link</h2>
        <p className={authSubtitleClass}>Enter your email and we will send you a secure one-time sign-in link.</p>
      </div>

      {error ? <Message tone="error">{error}</Message> : null}
      {success ? <Message tone="success">{success}</Message> : null}

      {!success ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email address">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </Field>

          <button
            type="submit"
            disabled={pending}
            className={authPrimaryButtonClass}
          >
            {pending ? 'Sending...' : 'Send magic link'}
          </button>
        </form>
      ) : null}

      <button
        type="button"
        onClick={() => onSwitch ? onSwitch('signin') : (window.location.href = getBasePath(path, '/sign-in'))}
        className={`w-full text-center text-sm font-medium ${authAccentLinkClass}`}
      >
        Back to sign in with password
      </button>
    </div>
  );

  return embedded ? content : <AuthCard>{content}</AuthCard>;
}

function SignUpForm({
  forceRedirectUrl,
  fallbackRedirectUrl,
  signInUrl,
  embedded = false,
  onSwitch,
}: {
  forceRedirectUrl?: string;
  fallbackRedirectUrl?: string;
  signInUrl?: string;
  embedded?: boolean;
  onSwitch?: (mode: AuthModalMode) => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const redirectUrl = getRedirectTarget(forceRedirectUrl, fallbackRedirectUrl || '/dashboard/onboarding');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);

    const verificationSuccessUrl = buildVerificationSuccessUrl({
      signInUrl,
      redirectUrl,
    });
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        password,
        callbackURL: toAbsoluteUrl(verificationSuccessUrl),
      }),
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;

    setPending(false);

    if (!response.ok) {
      setError(result?.error || 'Unable to create account.');
      return;
    }

    const nextUrl = buildVerificationCheckEmailUrl({
      signInUrl,
      redirectUrl,
      email,
    });

    setSuccess('Verification link sent. Redirecting...');
    window.location.href = nextUrl;
  }

  const content = (
    <div className={authContentClass}>
      <div className="space-y-1.5">
        <h2 className={authHeadingClass}>Create account</h2>
        <p className={authSubtitleClass}>Start with a personal workspace and upgrade later.</p>
      </div>

      {error ? <Message tone="error">{error}</Message> : null}
      {success ? <Message tone="success">{success}</Message> : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
          </Field>

          <Field label="Last name">
            <Input value={lastName} onChange={(event) => setLastName(event.target.value)} required />
          </Field>
        </div>

        <Field label="Email address">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>

        <Field label="Password">
          <PasswordInput
            visible={showPassword}
            onToggle={() => setShowPassword((current) => !current)}
            toggleLabel={{ show: 'Show password', hide: 'Hide password' }}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>

        <button
          type="submit"
          disabled={pending}
          className={authPrimaryButtonClass}
        >
          {pending ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <OAuthButtons
        callbackURL={redirectUrl}
        requestSignUp
        onError={setError}
        onPendingChange={setPending}
      />

      {onSwitch ? (
        <p className={authSubtitleClass}>
          Already have an account?{' '}
          <button type="button" onClick={() => onSwitch('signin')} className={authAccentLinkClass}>
            Sign in
          </button>
        </p>
      ) : signInUrl ? (
        <p className={authSubtitleClass}>
          Already have an account?{' '}
          <Link href={signInUrl} className={authAccentLinkClass}>
            Sign in
          </Link>
        </p>
      ) : null}
    </div>
  );

  return embedded ? content : <AuthCard>{content}</AuthCard>;
}

function ForgotPasswordForm({
  path,
  embedded = false,
  onSwitch,
}: {
  path?: string;
  embedded?: boolean;
  onSwitch?: (mode: AuthModalMode) => void;
}) {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);

    const result = await betterAuthClient.requestPasswordReset({
      email,
      redirectTo: getResetRedirectTarget(path),
    }) as AuthActionResult;

    setPending(false);

    if (result.error) {
      setError(getErrorMessage(result.error, 'Unable to send reset email.'));
      return;
    }

    setSuccess('If that email exists, a reset link has been sent.');
  }

  const content = (
    <div className={authContentClass}>
      <div className="space-y-1.5">
        <h2 className={authHeadingClass}>Reset password</h2>
        <p className={authSubtitleClass}>Enter your email and we will send you a reset link.</p>
      </div>

      {error ? <Message tone="error">{error}</Message> : null}
      {success ? <Message tone="success">{success}</Message> : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email address">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>

        <button
          type="submit"
          disabled={pending}
          className={authPrimaryButtonClass}
        >
          {pending ? 'Sending...' : 'Send reset link'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => onSwitch ? onSwitch('signin') : (window.location.href = getBasePath(path, '/sign-in'))}
        className={`w-full text-center text-sm font-medium ${authAccentLinkClass}`}
      >
        Back to sign in
      </button>
    </div>
  );

  return embedded ? content : <AuthCard>{content}</AuthCard>;
}

function ResetPasswordForm({
  path,
  embedded = false,
  onSwitch,
}: {
  path?: string;
  embedded?: boolean;
  onSwitch?: (mode: AuthModalMode) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const resetState = useMemo(() => readResetState(), []);
  const [error, setError] = useState<string | null>(resetState.error);
  const [success, setSuccess] = useState<string | null>(null);
  const token = resetState.token;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError('Reset token is missing or invalid.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    const result = await betterAuthClient.resetPassword({
      token,
      newPassword: password,
    }) as AuthActionResult;

    setPending(false);

    if (result.error) {
      setError(getErrorMessage(result.error, 'Unable to reset password.'));
      return;
    }

    setSuccess('Password updated. Redirecting to sign in...');
    const nextPath = withQueryParams(getBasePath(path, '/sign-in'), { reset: 'success' });
    window.location.href = nextPath;
  }

  const content = (
    <div className={authContentClass}>
      <div className="space-y-1.5">
        <h2 className={authHeadingClass}>Choose a new password</h2>
        <p className={authSubtitleClass}>Use a strong password you have not used elsewhere.</p>
      </div>

      {error ? <Message tone="error">{error}</Message> : null}
      {success ? <Message tone="success">{success}</Message> : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="New password">
          <PasswordInput
            visible={showPassword}
            onToggle={() => setShowPassword((current) => !current)}
            toggleLabel={{ show: 'Show password', hide: 'Hide password' }}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>

        <Field label="Confirm new password">
          <PasswordInput
            visible={showConfirmPassword}
            onToggle={() => setShowConfirmPassword((current) => !current)}
            toggleLabel={{ show: 'Show confirm password', hide: 'Hide confirm password' }}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </Field>

        <button
          type="submit"
          disabled={pending || !token}
          className={authPrimaryButtonClass}
        >
          {pending ? 'Saving...' : 'Update password'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => onSwitch ? onSwitch('signin') : (window.location.href = getBasePath(path, '/sign-in'))}
        className={`w-full text-center text-sm font-medium ${authAccentLinkClass}`}
      >
        Back to sign in
      </button>
    </div>
  );

  return embedded ? content : <AuthCard>{content}</AuthCard>;
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
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  let content: React.ReactNode;
  if (mode === 'signup') {
    content = <SignUpForm embedded signInUrl="/sign-in" onSwitch={onSwitch} />;
  } else if (mode === 'magic-link') {
    content = <MagicLinkForm embedded onSwitch={onSwitch} />;
  } else if (mode === 'forgot-password') {
    content = <ForgotPasswordForm embedded onSwitch={onSwitch} />;
  } else if (mode === 'reset-password') {
    content = <ResetPasswordForm embedded onSwitch={onSwitch} />;
  } else {
    content = <SignInForm embedded signUpUrl="/sign-up" onSwitch={onSwitch} />;
  }

  return createPortal(
    <div data-auth-modal-root="true" className="fixed inset-0 z-[100] flex items-start justify-center bg-black/55 px-4 pb-4 pt-[7vh] backdrop-blur-sm sm:pt-[9vh]">
      <div className="relative max-h-[86vh] w-full max-w-md overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl shadow-black/20 dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-black/50">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-sm text-slate-500 transition hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white"
        >
          Close
        </button>
        {content}
      </div>
    </div>,
    document.body,
  );
}

export function AuthProvider({ children }: { children: React.ReactNode; [key: string]: unknown }) {
  return <>{children}</>;
}

export function AuthSignIn({
  forceRedirectUrl,
  fallbackRedirectUrl,
  signUpUrl,
  path,
}: {
  forceRedirectUrl?: string;
  fallbackRedirectUrl?: string;
  signUpUrl?: string;
  path?: string;
  [key: string]: unknown;
}) {
  const mode = readUrlMode('signin');

  if (mode === 'forgot-password') {
    return <ForgotPasswordForm path={path} />;
  }

  if (mode === 'magic-link') {
    return <MagicLinkForm path={path} forceRedirectUrl={forceRedirectUrl} fallbackRedirectUrl={fallbackRedirectUrl} />;
  }

  if (mode === 'reset-password') {
    return <ResetPasswordForm path={path} />;
  }

  return (
    <SignInForm
      forceRedirectUrl={forceRedirectUrl}
      fallbackRedirectUrl={fallbackRedirectUrl}
      signUpUrl={signUpUrl}
      path={path}
    />
  );
}

export function AuthSignUp({
  forceRedirectUrl,
  fallbackRedirectUrl,
  signInUrl,
}: {
  forceRedirectUrl?: string;
  fallbackRedirectUrl?: string;
  signInUrl?: string;
  [key: string]: unknown;
}) {
  return (
    <SignUpForm
      forceRedirectUrl={forceRedirectUrl}
      fallbackRedirectUrl={fallbackRedirectUrl}
      signInUrl={signInUrl}
    />
  );
}

export function AuthSignInButton({
  children,
  mode,
  forceRedirectUrl,
  fallbackRedirectUrl,
  ...rest
}: {
  children?: React.ReactNode;
  mode?: string;
  forceRedirectUrl?: string;
  fallbackRedirectUrl?: string;
  [key: string]: unknown;
}) {
  const [open, setOpen] = useState(false);
  const [currentMode, setCurrentMode] = useState<AuthModalMode>('signin');
  const redirectUrl = getRedirectTarget(forceRedirectUrl, fallbackRedirectUrl);

  const handleClick = () => {
    if (mode === 'modal') {
      setCurrentMode('signin');
      setOpen(true);
      return;
    }

    window.location.href = `/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`;
  };

  if (children) {
    return (
      <>
        <span onClick={handleClick} role="button" tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && handleClick()} {...rest}>
          {children}
        </span>
        <AuthModalShell open={open} mode={currentMode} onClose={() => setOpen(false)} onSwitch={setCurrentMode} />
      </>
    );
  }

  return (
    <>
      <button onClick={handleClick} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500" {...rest}>
        Sign In
      </button>
      <AuthModalShell open={open} mode={currentMode} onClose={() => setOpen(false)} onSwitch={setCurrentMode} />
    </>
  );
}

export function AuthSignUpButton({
  children,
  mode,
  forceRedirectUrl,
  fallbackRedirectUrl,
  ...rest
}: {
  children?: React.ReactNode;
  mode?: string;
  forceRedirectUrl?: string;
  fallbackRedirectUrl?: string;
  [key: string]: unknown;
}) {
  const [open, setOpen] = useState(false);
  const [currentMode, setCurrentMode] = useState<AuthModalMode>('signup');
  const redirectUrl = getRedirectTarget(forceRedirectUrl, fallbackRedirectUrl || '/dashboard/onboarding');

  const handleClick = () => {
    if (mode === 'modal') {
      setCurrentMode('signup');
      setOpen(true);
      return;
    }

    window.location.href = `/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}`;
  };

  if (children) {
    return (
      <>
        <span onClick={handleClick} role="button" tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && handleClick()} {...rest}>
          {children}
        </span>
        <AuthModalShell open={open} mode={currentMode} onClose={() => setOpen(false)} onSwitch={setCurrentMode} />
      </>
    );
  }

  return (
    <>
      <button onClick={handleClick} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5" {...rest}>
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
  const { signOut } = useAuthInstance();

  const handleClick = () => {
    void signOut({ redirectUrl: '/' });
  };

  if (children && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ onClick?: () => void; type?: string }>;
    return React.cloneElement(child, {
      ...rest,
      type: child.props.type || 'button',
      onClick: () => {
        child.props.onClick?.();
        handleClick();
      },
    });
  }

  return (
    <button onClick={handleClick} className="text-sm text-red-400 transition hover:text-red-300" {...rest}>
      Sign Out
    </button>
  );
}

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

export function AuthOrganizationSwitcher({
  hidePersonal = false,
}: {
  hidePersonal?: boolean;
  [key: string]: unknown;
}) {
  const { isSignedIn, isLoaded } = useAuthSession();
  const { setActiveOrganization } = useAuthInstance();
  const [open, setOpen] = useState(false);
  const [popoverDirection, setPopoverDirection] = useState<'up' | 'down'>('down');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      setOrgs([]);
      setActiveOrgId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/user/active-org', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Failed to load organizations');
        }
        const data = (await response.json()) as ActiveOrgResponse;
        if (!cancelled) {
          setOrgs(data.organizations);
          setActiveOrgId(data.activeOrgId);
        }
      } catch {
        if (!cancelled) {
          setOrgs([]);
          setActiveOrgId(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const container = dropdownRef.current;
    const popover = popoverRef.current;
    if (!container || !popover) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const gutter = 8;
    const spaceAbove = containerRect.top;
    const spaceBelow = window.innerHeight - containerRect.bottom;

    if (spaceBelow >= popoverRect.height + gutter || spaceBelow >= spaceAbove) {
      setPopoverDirection('down');
      return;
    }

    setPopoverDirection('up');
  }, [activeOrgId, open, orgs.length]);

  const activeOrg = useMemo(() => orgs.find((org) => org.id === activeOrgId) ?? null, [activeOrgId, orgs]);
  const displayName = activeOrg?.name || 'Personal workspace';

  async function switchOrg(orgId: string | null) {
    setSwitching(true);
    setOpen(false);

    try {
      await setActiveOrganization(orgId);
      setActiveOrgId(orgId);
      window.location.reload();
    } finally {
      setSwitching(false);
    }
  }

  if (!isSignedIn) {
    return null;
  }

  if (loading) {
    return (
      <div className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-500">
        <span className="flex items-center justify-between">
          <span>Loading workspaces...</span>
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </span>
      </div>
    );
  }

  if (orgs.length === 0) {
    if (hidePersonal) {
      return null;
    }

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
    <div ref={dropdownRef} data-auth-org-switcher="betterauth" className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:shadow-none dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
      >
        <span className="truncate">{switching ? 'Switching...' : displayName}</span>
        <span className="ml-3 text-xs text-slate-500 dark:text-neutral-500">{open ? 'Close' : 'Switch'}</span>
      </button>

      {open ? (
        <div
          ref={popoverRef}
          className={`absolute inset-x-0 z-[90] mt-2 w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-200/50 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-2xl dark:shadow-black/60 ${popoverDirection === 'up' ? 'bottom-full mb-2 mt-0' : 'top-full'}`}
        >
          {!hidePersonal ? (
            <button
              type="button"
              onClick={() => void switchOrg(null)}
              className={`flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm transition ${activeOrgId === null ? 'bg-slate-100 text-slate-900 dark:bg-neutral-800 dark:text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-neutral-800'}`}
            >
              <span className="truncate font-medium">Personal workspace</span>
              {activeOrgId === null ? <span className="mt-0.5 text-xs text-slate-400 dark:text-neutral-400">Active</span> : null}
            </button>
          ) : null}

          {orgs.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => void switchOrg(org.id)}
              className={`mt-1 flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm transition ${activeOrgId === org.id ? 'bg-slate-100 text-slate-900 dark:bg-neutral-800 dark:text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-neutral-800'}`}
            >
              <span className="truncate font-medium">{org.name}</span>
              <span className={`mt-0.5 text-xs ${activeOrgId === org.id ? 'text-slate-500 dark:text-neutral-400' : 'text-slate-400 dark:text-neutral-500'}`}>{org.planName || org.role}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AuthUserProfile(props: Record<string, unknown>) {
  void props;
  const { user, isLoaded } = useAuthUser();

  if (!isLoaded || !user) {
    return null;
  }

  return (
    <div className="w-full rounded-3xl border border-neutral-800 bg-neutral-950/80 p-6 text-neutral-100 shadow-xl shadow-black/20">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {user.imageUrl ? (
            <Image src={user.imageUrl} alt={user.fullName || 'User'} fill sizes="64px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-violet-200">
              {(user.fullName || user.primaryEmailAddress?.emailAddress || 'U').charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold">{user.fullName || 'Unnamed user'}</h3>
          <p className="truncate text-sm text-neutral-400">{user.primaryEmailAddress?.emailAddress}</p>
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <Link href="/dashboard/profile" className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500">
          Profile settings
        </Link>
        <Link href="/dashboard/settings" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-white/5">
          General settings
        </Link>
      </div>
    </div>
  );
}

export const authDarkTheme = undefined;

export function AuthLoading() {
  return null;
}

export function AuthLoaded({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}