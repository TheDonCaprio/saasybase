'use client';

/**
 * Auth Provider – Client-Side Hooks (Conditional Dispatch)
 * ==========================================================
 * At build time, Next.js inlines `NEXT_PUBLIC_AUTH_PROVIDER` as a string
 * literal. Webpack dead-code-eliminates the unused branch, so only the
 * active provider's module is included in the client bundle.
 * Better Auth currently reuses the self-hosted NextAuth client layer until
 * the dedicated Better Auth client UX is cut over.
 *
 * This is the same pattern React uses for production vs. development builds.
 */

import type { UseAuthUserReturn, UseAuthSessionReturn, UseAuthInstanceReturn } from './types';

/* eslint-disable @typescript-eslint/no-require-imports */
const _mod: {
  useAuthUser: () => UseAuthUserReturn;
  useAuthSession: () => UseAuthSessionReturn;
  useAuthInstance: () => UseAuthInstanceReturn;
} = process.env.NEXT_PUBLIC_AUTH_PROVIDER === 'betterauth'
  ? require('./providers/betterauth/hooks')
  : process.env.NEXT_PUBLIC_AUTH_PROVIDER === 'nextauth'
    ? require('./providers/nextauth/hooks')
    : require('./providers/clerk/hooks');
/* eslint-enable @typescript-eslint/no-require-imports */

export const useAuthUser = _mod.useAuthUser;
export const useAuthSession = _mod.useAuthSession;
export const useAuthInstance = _mod.useAuthInstance;

