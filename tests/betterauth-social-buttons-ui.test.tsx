// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const socialSignInMock = vi.hoisted(() => vi.fn());

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={alt ?? ''} {...rest} />
  ),
}));

vi.mock('../lib/better-auth-client', () => ({
  betterAuthClient: {
    signIn: {
      social: socialSignInMock,
      email: vi.fn(),
    },
    sendVerificationEmail: vi.fn(),
    requestPasswordReset: vi.fn(),
  },
}));

import { AuthSignIn, AuthSignUp } from '../lib/auth-provider/client/providers/betterauth/components';

describe('Better Auth social buttons UI', () => {
  let root: Root | null = null;

  beforeEach(() => {
    socialSignInMock.mockReset();
    socialSignInMock.mockResolvedValue({ error: { message: 'OAuth unavailable in test' } });
    window.history.replaceState({}, '', '/sign-in');
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }

    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  async function render(ui: React.ReactElement) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(ui);
    });

    await act(async () => {
      await Promise.resolve();
    });

    return container;
  }

  function mockOAuthProviders(providers: { github: boolean; google: boolean }) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(providers), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function findButton(container: HTMLElement, label: string) {
    return Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes(label));
  }

  it('renders configured GitHub social sign-in and uses the sign-in callback URL', async () => {
    const fetchMock = mockOAuthProviders({ github: true, google: false });
    const container = await render(
      <AuthSignIn forceRedirectUrl="/dashboard" signUpUrl="/sign-up" />,
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/oauth-providers', { cache: 'no-store' });
    expect(findButton(container, 'Continue with GitHub')).toBeTruthy();
    expect(findButton(container, 'Continue with Google')).toBeUndefined();

    await act(async () => {
      findButton(container, 'Continue with GitHub')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(socialSignInMock).toHaveBeenCalledWith({
      provider: 'github',
      callbackURL: '/dashboard',
      errorCallbackURL: '/dashboard',
    });
  });

  it('renders configured Google social sign-up and requests sign-up mode', async () => {
    const fetchMock = mockOAuthProviders({ github: false, google: true });
    const container = await render(
      <AuthSignUp forceRedirectUrl="/welcome" signInUrl="/sign-in" />,
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/oauth-providers', { cache: 'no-store' });
    expect(findButton(container, 'Continue with GitHub')).toBeUndefined();
    expect(findButton(container, 'Continue with Google')).toBeTruthy();

    await act(async () => {
      findButton(container, 'Continue with Google')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(socialSignInMock).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: '/welcome',
      errorCallbackURL: '/welcome',
      requestSignUp: true,
    });
  });
});