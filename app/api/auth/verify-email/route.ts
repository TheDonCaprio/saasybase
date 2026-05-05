/**
 * Email Verification API Route (NextAuth)
 * ===========================================
 * Sends a verification email with a magic-link token.
 * POST — request verification email
 * GET  — verify token and mark email as verified
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authService } from '@/lib/auth-provider';
import { createHash } from 'crypto';
import { RATE_LIMITS, getClientIP, rateLimit } from '@/lib/rateLimit';
import { sendWelcomeIfNotSent } from '@/lib/welcome';
import { Logger } from '@/lib/logger';
import { resolveRequestOrigin, resolveSameOriginUrl } from '@/lib/request-origin';
import { getConfiguredPublicOrigins, normalizeAppRedirectPath } from '@/lib/url-security';
import {
  clearBetterAuthPendingEmailChange,
  hasBetterAuthPendingEmailChange,
  parseBetterAuthEmailChangeToken,
} from '@/lib/better-auth-email-change';

function isBetterAuthProviderEnabled() {
  return process.env.AUTH_PROVIDER === 'betterauth';
}

function normalizeCallbackUrl(request: NextRequest, callbackURL?: string) {
  if (!callbackURL) {
    return undefined;
  }

  return resolveSameOriginUrl(request, callbackURL);
}

function sanitizeVerifyEmailRequestUrl(request: NextRequest) {
  const nextUrl = new URL(request.url);
  const rawCallbackUrl = nextUrl.searchParams.get('callbackURL') || nextUrl.searchParams.get('callbackUrl');

  if (!rawCallbackUrl) {
    return null;
  }

  const normalized = normalizeCallbackUrl(request, rawCallbackUrl);
  if (!normalized) {
    nextUrl.searchParams.delete('callbackURL');
    nextUrl.searchParams.delete('callbackUrl');
    return nextUrl;
  }

  if (normalized !== rawCallbackUrl) {
    nextUrl.searchParams.set('callbackURL', normalized);
    nextUrl.searchParams.delete('callbackUrl');
    return nextUrl;
  }

  return null;
}

function createRequestRedirect(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, resolveRequestOrigin(request)));
}

function rewriteDelegatedLocation(request: NextRequest, response: Response) {
  const location = response.headers.get('location');
  if (!location) {
    return response;
  }

  const requestOrigin = resolveRequestOrigin(request);
  const allowedOrigins = Array.from(new Set([
    requestOrigin,
    ...getConfiguredPublicOrigins(),
    'http://localhost:3000',
    'https://localhost:3000',
    'http://127.0.0.1:3000',
    'https://127.0.0.1:3000',
  ]));

  const normalizedPath = normalizeAppRedirectPath(location, {
    fallbackPath: '',
    allowedOrigins,
  });

  if (!normalizedPath) {
    return response;
  }

  const rewrittenLocation = new URL(normalizedPath, requestOrigin).toString();
  if (rewrittenLocation === location) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('location', rewrittenLocation);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = await authService.getSession();
    if (!session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ip = getClientIP(request);
    const rl = await rateLimit(`auth:verify-email:${ip}:${session.userId}`, RATE_LIMITS.AUTH, {
      ip,
      actorId: session.userId,
      route: '/api/auth/verify-email',
      method: 'POST',
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many verification email requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
      );
    }

    if (isBetterAuthProviderEnabled()) {
      const { betterAuthServer } = await import('@/lib/better-auth');
      const authSession = await betterAuthServer.api.getSession({
        headers: request.headers,
      });

      if (!authSession?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await request.json().catch(() => null);
      const callbackURL = normalizeCallbackUrl(
        request,
        typeof body?.callbackURL === 'string' ? body.callbackURL : undefined,
      );

      await betterAuthServer.api.sendVerificationEmail({
        headers: request.headers,
        body: {
          email: authSession.user.email,
          ...(callbackURL ? { callbackURL } : {}),
        },
      });

      return NextResponse.json({ message: 'Verification email sent' });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, emailVerified: true },
    });

    if (!user?.email) {
      return NextResponse.json({ error: 'No email address on account' }, { status: 400 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ message: 'Email is already verified' });
    }

    const { sendNextAuthVerificationEmail } = await import('@/lib/nextauth-email-verification');
    await sendNextAuthVerificationEmail({
      userId: user.id,
      email: user.email,
      name: user.name,
      baseUrl: resolveRequestOrigin(request),
    });

    return NextResponse.json({ message: 'Verification email sent' });
  } catch (err) {
    Logger.error('Send verification email error', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (isBetterAuthProviderEnabled()) {
    const sanitizedUrl = sanitizeVerifyEmailRequestUrl(request);
    if (sanitizedUrl) {
      return NextResponse.redirect(sanitizedUrl);
    }

    const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    const token = request.nextUrl.searchParams.get('token');

    if (secret && token) {
      const parsedToken = await parseBetterAuthEmailChangeToken(token, secret);
      if (parsedToken) {
        const hasPending = await hasBetterAuthPendingEmailChange(parsedToken.userId, parsedToken.newEmail);
        if (!hasPending) {
          return createRequestRedirect(request, '/dashboard/profile?emailChange=canceled');
        }

        const { betterAuthNextJsHandler } = await import('@/lib/better-auth');
        const response = await betterAuthNextJsHandler.GET(request);
        const location = response.headers.get('location') || '';
        const verificationCompleted = parsedToken.requestType === 'change-email-verification'
          && (
            (response.status >= 200 && response.status < 300)
            || ((response.status === 302 || response.status === 303 || response.status === 307 || response.status === 308) && !location.includes('error='))
          );

        if (verificationCompleted) {
          await clearBetterAuthPendingEmailChange(parsedToken.userId, parsedToken.newEmail);
        }

        return rewriteDelegatedLocation(request, response);
      }
    }

    const { betterAuthNextJsHandler } = await import('@/lib/better-auth');
    const response = await betterAuthNextJsHandler.GET(request);
    return rewriteDelegatedLocation(request, response);
  }

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    if (!token || !email) {
      return createRequestRedirect(request, '/sign-in?error=invalid-verification-link');
    }

    const hashedToken = createHash('sha256').update(token).digest('hex');
    const record = await prisma.verificationToken.findUnique({ where: { token: hashedToken } });

    if (!record || record.expires < new Date()) {
      if (record) {
        await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier, token: hashedToken } });
      }
      return createRequestRedirect(request, '/sign-in?error=expired-verification-link');
    }

    const { parseVerificationIdentifier } = await import('@/lib/nextauth-email-verification');
    const parsedIdentifier = parseVerificationIdentifier(record.identifier);
    if (!parsedIdentifier) {
      await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier, token: hashedToken } });
      return createRequestRedirect(request, '/sign-in?error=invalid-verification-link');
    }

    if (parsedIdentifier.kind === 'email-verify') {
      const normalizedEmail = email.toLowerCase().trim();
      if (parsedIdentifier.email !== normalizedEmail) {
        await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier, token: hashedToken } });
        return createRequestRedirect(request, '/sign-in?error=invalid-verification-link');
      }

      await prisma.user.updateMany({
        where: { email: normalizedEmail },
        data: { emailVerified: new Date() },
      });

      await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } });

      const verifiedUser = await prisma.user.findFirst({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      if (verifiedUser?.id) {
        await sendWelcomeIfNotSent(verifiedUser.id, normalizedEmail).catch(() => {});
      }

      return createRequestRedirect(request, '/sign-in?verification=success');
    }

    const normalizedNewEmail = email.toLowerCase().trim();
    if (parsedIdentifier.newEmail !== normalizedNewEmail) {
      await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier, token: hashedToken } });
      return createRequestRedirect(request, '/sign-in?error=invalid-verification-link');
    }

    const user = await prisma.user.findUnique({
      where: { id: parsedIdentifier.userId },
      select: { id: true, name: true, email: true },
    });
    if (!user?.id || !user.email) {
      await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } });
      return createRequestRedirect(request, '/sign-in?error=verification-failed');
    }

    const existing = await prisma.user.findFirst({
      where: {
        email: normalizedNewEmail,
        NOT: { id: user.id },
      },
      select: { id: true },
    });
    if (existing) {
      await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } });
      return createRequestRedirect(request, '/dashboard/profile?emailChange=already-used');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: normalizedNewEmail,
        emailVerified: new Date(),
      },
    });

    await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } });

    return createRequestRedirect(request, '/dashboard/profile?emailChange=success');
  } catch (err) {
    Logger.error('Verify email error', err);
    return createRequestRedirect(request, '/sign-in?error=verification-failed');
  }
}
