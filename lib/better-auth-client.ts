import { createAuthClient } from 'better-auth/react';
import { magicLinkClient, organizationClient } from 'better-auth/client/plugins';
import { BETTER_AUTH_BASE_PATH } from '@/lib/better-auth-shared';

export function resolveBetterAuthClientBaseUrl(currentOrigin?: string) {
  return currentOrigin
    || process.env.NEXT_PUBLIC_BETTER_AUTH_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || undefined;
}

function getBetterAuthClientBaseUrl() {
  return resolveBetterAuthClientBaseUrl(
    typeof window !== 'undefined' ? window.location.origin : undefined,
  );
}

export const betterAuthClient = createAuthClient({
  basePath: BETTER_AUTH_BASE_PATH,
  baseURL: getBetterAuthClientBaseUrl(),
  plugins: [organizationClient(), magicLinkClient()],
});

export type BetterAuthClient = typeof betterAuthClient;