/**
 * NextAuth (Auth.js v5) Configuration
 * ======================================
 * Only loaded when AUTH_PROVIDER=nextauth.
 *
 * This file defines NextAuth handlers, the session callback, and the
 * Prisma adapter wiring. It is lazily imported by the NextAuth provider
 * so Clerk-only installs never pull in the next-auth dependency.
 */

import NextAuth, { type NextAuthConfig } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import NodemailerProvider from 'next-auth/providers/nodemailer';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { sendNextAuthMagicLinkEmail } from '@/lib/nextauth-email-verification';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BCRYPT_SALT_ROUNDS = 12;

/** Hash a password with bcrypt. */
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

// ---------------------------------------------------------------------------
// Provider List (driven by env vars — only add a provider when configured)
// ---------------------------------------------------------------------------

function buildProviders(): NextAuthConfig['providers'] {
  const providers: NextAuthConfig['providers'] = [];
  const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;

  // Credentials (email + password) — always available
  providers.push(
    CredentialsProvider({
      id: 'credentials',
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) return null;
        if (!user.emailVerified) return null;

        const valid = await verifyPassword(password, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.imageUrl,
        };
      },
    })
  );

  providers.push(
    NodemailerProvider({
      server: {
        host: process.env.SMTP_HOST || '::1',
        port: smtpPort,
        secure: smtpPort === 465,
        auth:
          process.env.SMTP_USER && process.env.SMTP_PASS
            ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
              }
            : undefined,
      },
      from: process.env.EMAIL_FROM || `no-reply@${process.env.NEXT_PUBLIC_APP_DOMAIN || 'example.com'}`,
      maxAge: 15 * 60,
      async sendVerificationRequest({ identifier, url, expires }) {
        const email = identifier.toLowerCase().trim();
        const existingUser = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            emailVerified: true,
          },
        });

        if (!existingUser?.emailVerified) {
          return;
        }

        await sendNextAuthMagicLinkEmail({
          userId: existingUser.id,
          email,
          name: existingUser.name,
          url,
          expires,
        });
      },
    })
  );

  // GitHub OAuth
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      })
    );
  }

  // Google OAuth
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    );
  }

  return providers;
}

// ---------------------------------------------------------------------------
// NextAuth Configuration
// ---------------------------------------------------------------------------

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: buildProviders(),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/sign-in',
    newUser: '/dashboard/onboarding',
    error: '/sign-in',
  },
  // Suppress expected CredentialsSignin errors from spamming server logs.
  // These are normal user-facing errors (wrong email/password), not bugs.
  logger: {
    error(error) {
      // NextAuth v5 wraps credential failures in a CredentialsSignin error.
      // Detect by error name/type and silently ignore it.
      const err = error as unknown as Record<string, unknown>;
      const msg = typeof error === 'object' && error !== null
        ? err.name ?? err.type ?? ''
        : String(error);
      if (
        msg === 'CredentialsSignin' ||
        (typeof msg === 'string' && msg.includes('CredentialsSignin'))
      ) {
        return; // Expected — don't log
      }
      console.error('[auth][error]', error);
    },
    warn(code) {
      console.warn('[auth][warn]', code);
    },
    debug(message, metadata) {
      // Only log in development if needed
      if (process.env.AUTH_DEBUG === 'true') {
        console.debug('[auth][debug]', message, metadata);
      }
    },
  },
  callbacks: {
    async signIn({ user, account, email }) {
      if (account?.provider === 'nodemailer' && !email?.verificationRequest) {
        const emailAddress = (user.email || '').toLowerCase().trim();
        if (!emailAddress) {
          return false;
        }

        const existingUser = await prisma.user.findUnique({
          where: { email: emailAddress },
          select: {
            emailVerified: true,
          },
        });

        return Boolean(existingUser?.emailVerified);
      }

      return true;
    },
    async jwt({ token, user, trigger }) {
      // On initial sign-in, `user` is the object returned by authorize() or the adapter.
      if (user) {
        token.id = user.id;
        const dbUser = await prisma.user.findUnique({ where: { id: user.id! } });
        const dbUserRecord = dbUser as (typeof dbUser & { tokenVersion?: number }) | null;
        token.role = dbUserRecord?.role ?? 'USER';
        token.tokenVersion = dbUserRecord?.tokenVersion ?? 0;
        if (dbUserRecord?.imageUrl) {
          token.picture = dbUserRecord.imageUrl;
        }
      }

      // On every subsequent request, verify tokenVersion hasn't been bumped
      // (password change/reset increments it to invalidate existing JWTs).
      if (!user && token.id && trigger !== 'signIn') {
        const dbUser = await prisma.user.findUnique({ where: { id: token.id as string } });
        const dbUserRecord = dbUser as (typeof dbUser & { tokenVersion?: number }) | null;
        if (dbUserRecord && dbUserRecord.tokenVersion !== (token.tokenVersion ?? 0)) {
          // Token is stale — force re-authentication
          return { ...token, id: undefined, role: undefined };
        }
      }

      return token;
    },
    async session({ session, token }) {
      // Propagate JWT claims into the session object returned by auth().
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as unknown as Record<string, unknown>).role = token.role ?? 'USER';
        if (token.picture) {
          session.user.image = token.picture as string;
        }
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // Ensure the user record has required SaaSyBase defaults.
      // The Prisma adapter creates a bare user; we fill in our app-specific fields.
      if (user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            imageUrl: user.image ?? null,
            role: 'USER',
          },
        });
      }
    },
  },
});

// Re-export the hashPassword helper for the registration API route
export { hashPassword };
