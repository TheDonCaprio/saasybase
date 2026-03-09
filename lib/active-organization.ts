import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

export const ACTIVE_ORG_COOKIE = 'saasybase-active-org';

export function getActiveOrgCookieOptions(overrides?: Partial<ResponseCookie>): Partial<ResponseCookie> {
  return {
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    ...overrides,
  };
}