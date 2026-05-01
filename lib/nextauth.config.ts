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
import type { Adapter } from 'next-auth/adapters';
import type { EmailConfig } from 'next-auth/providers';
import CredentialsProvider from 'next-auth/providers/credentials';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { sendNextAuthMagicLinkEmail, sendNextAuthVerificationEmail } from '@/lib/nextauth-email-verification';
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { Logger } from '@/lib/logger';
import { getUserSuspensionDetails } from '@/lib/account-suspension';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BCRYPT_SALT_ROUNDS = 12;

function shouldTrustAuthHost(): boolean {
  if (process.env.AUTH_TRUST_HOST === 'true') {
    return true;
  }

  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  const configuredUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '';

  try {
    const parsed = new URL(configuredUrl);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function getRequestHeader(headers: unknown, key: string): string | null {
  if (!headers || typeof headers !== 'object') return null;

  const candidate = headers as { get?: (name: string) => string | null };
  if (typeof candidate.get !== 'function') return null;

  try {
    return candidate.get(key);
  } catch {
    return null;
  }
}

function getAuthRequestIp(request: unknown): string | null {
  if (!request || typeof request !== 'object' || !('headers' in request)) {
    return null;
  }

  const headers = (request as { headers?: unknown }).headers;
  const forwarded = getRequestHeader(headers, 'x-forwarded-for');
  const firstForwarded = forwarded?.split(',')[0]?.trim();

  return firstForwarded
    || getRequestHeader(headers, 'x-real-ip')
    || getRequestHeader(headers, 'cf-connecting-ip')
    || getRequestHeader(headers, 'x-client-ip')
    || getRequestHeader(headers, 'x-forwarded')
    || null;
}

/** Hash a password with bcrypt. */
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

function createPrismaAdapter(): Adapter {
  const adapter = PrismaAdapter(prisma);

  const toAdapterUser = (user: {
    id: string;
    email: string | null;
    name: string | null;
    imageUrl: string | null;
    emailVerified: Date | null;
  }) => ({
    id: user.id,
    email: user.email ?? '',
    name: user.name,
    image: user.imageUrl,
    emailVerified: user.emailVerified,
  });

  return {
    ...adapter,
    async createUser(data) {
      const user = await prisma.user.create({
        data: {
          email: data.email ?? '',
          name: data.name,
          imageUrl: data.image ?? null,
          emailVerified: data.emailVerified ?? null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          imageUrl: true,
          emailVerified: true,
        },
      });

      return toAdapterUser(user);
    },
    async updateUser(data) {
      if (!data.id) {
        throw new Error('NextAuth adapter updateUser requires an id.');
      }

      const user = await prisma.user.update({
        where: { id: data.id },
        data: {
          ...(data.email !== undefined ? { email: data.email ?? '' } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.image !== undefined ? { imageUrl: data.image } : {}),
          ...(data.emailVerified !== undefined ? { emailVerified: data.emailVerified } : {}),
        },
        select: {
          id: true,
          email: true,
          name: true,
          imageUrl: true,
          emailVerified: true,
        },
      });

      return toAdapterUser(user);
    },
    async deleteSession(sessionToken) {
      await prisma.session.deleteMany({ where: { sessionToken } });
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Provider List (driven by env vars — only add a provider when configured)
// ---------------------------------------------------------------------------

function buildProviders(): NextAuthConfig['providers'] {
  const providers: NextAuthConfig['providers'] = [];

  // Credentials (email + password) — always available
  providers.push(
    CredentialsProvider({
      id: 'credentials',
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;
        const ip = getAuthRequestIp(request) || 'unknown';
        const rateLimitKey = `auth:credentials-signin:${ip}`;

        const nowMs = Date.now();
        const windowMs = RATE_LIMITS.AUTH.windowMs;
        const windowStart = new Date(Math.floor(nowMs / windowMs) * windowMs);

        const existingBucket = await prisma.rateLimitBucket.findUnique({
          where: {
            rate_limit_key_window_unique: {
              key: rateLimitKey,
              windowStart,
            },
          },
          select: { hits: true },
        });

        if ((existingBucket?.hits ?? 0) >= RATE_LIMITS.AUTH.limit) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) {
          await rateLimit(rateLimitKey, RATE_LIMITS.AUTH, {
            ip,
            actorId: email,
            route: '/api/auth/callback/credentials',
            method: 'POST',
            userAgent: getRequestHeader((request as { headers?: unknown } | undefined)?.headers, 'user-agent'),
          });
          return null;
        }
        if (!user.emailVerified) return null;

        const valid = await verifyPassword(password, user.password);
        if (!valid) {
          await rateLimit(rateLimitKey, RATE_LIMITS.AUTH, {
            ip,
            actorId: user.id,
            route: '/api/auth/callback/credentials',
            method: 'POST',
            userAgent: getRequestHeader((request as { headers?: unknown } | undefined)?.headers, 'user-agent'),
          });
          return null;
        }

        if (user.suspendedAt) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.imageUrl,
        };
      },
    })
  );

  const emailProvider: EmailConfig = {
    id: 'nodemailer',
    type: 'email',
    name: 'Email',
    from: process.env.EMAIL_FROM || `no-reply@${process.env.NEXT_PUBLIC_APP_DOMAIN || 'example.com'}`,
    maxAge: 15 * 60,
    normalizeIdentifier(identifier) {
      return identifier.toLowerCase().trim();
    },
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
        if (existingUser?.id) {
          await sendNextAuthVerificationEmail({
            userId: existingUser.id,
            email,
            name: existingUser.name,
            baseUrl: new URL(url).origin,
          });
        }
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
  };

  providers.push(emailProvider);

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
  adapter: createPrismaAdapter(),
  providers: buildProviders(),
  trustHost: shouldTrustAuthHost(),
  session: { strategy: 'database' },
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
      Logger.error('[auth][error]', error);
    },
    warn(code) {
      Logger.warn('[auth][warn]', { code });
    },
    debug(message, metadata) {
      // Only log in development if needed
      if (process.env.AUTH_DEBUG === 'true') {
        Logger.debug('[auth][debug]', { message, metadata });
      }
    },
  },
  callbacks: {
    async signIn({ user, account, email }) {
      const resolvedUser = user.id
        ? await prisma.user.findUnique({
            where: { id: user.id },
            select: {
              suspendedAt: true,
              suspensionReason: true,
              suspensionIsPermanent: true,
            },
          })
        : user.email
          ? await prisma.user.findUnique({
              where: { email: user.email.toLowerCase().trim() },
              select: {
                suspendedAt: true,
                suspensionReason: true,
                suspensionIsPermanent: true,
              },
            })
          : null;

      if (resolvedUser?.suspendedAt) {
        const suspension = await getUserSuspensionDetails(resolvedUser);
        return `/sign-in?error=${encodeURIComponent(suspension.code.toLowerCase().replace(/_/g, '-'))}`;
      }

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
    async session({ session, user }) {
      if (!user?.id) {
        return {
          ...session,
          user: undefined,
          expires: session.expires,
        };
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          role: true,
          imageUrl: true,
          suspendedAt: true,
        },
      });

      if (!dbUser || dbUser.suspendedAt || !session.user) {
        return {
          ...session,
          user: undefined,
          expires: session.expires,
        };
      }

      session.user.id = dbUser.id;
      (session.user as unknown as Record<string, unknown>).role = dbUser.role ?? 'USER';
      session.user.lastSignInAt = null;
      if (dbUser.imageUrl) {
        session.user.image = dbUser.imageUrl;
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
