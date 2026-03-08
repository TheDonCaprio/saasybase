/**
 * NextAuth API Route Handler
 * ============================
 * Exposes GET and POST handlers for NextAuth sign-in/sign-out/callback/session.
 * Only active when AUTH_PROVIDER=nextauth.
 *
 * @see https://authjs.dev/getting-started/installation#configure
 */

import { handlers } from '@/lib/nextauth.config';

export const { GET, POST } = handlers;
