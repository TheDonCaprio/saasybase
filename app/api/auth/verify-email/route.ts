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
import {
  clearBetterAuthPendingEmailChange,
  hasBetterAuthPendingEmailChange,
  parseBetterAuthEmailChangeToken,
} from '@/lib/better-auth-email-change';
import { resolveNextAuthRuntimeBaseUrl } from '@/lib/nextauth-email-verification';

function isBetterAuthProviderEnabled() {
  return process.env.AUTH_PROVIDER === 'betterauth';
}

function normalizeCallbackUrl(request: NextRequest, callbackURL?: string) {
  if (!callbackURL) {
    return undefined;
  }

  const requestOrigin = new URL(request.url).origin;

  try {
    if (callbackURL.startsWith('/')) {
      return new URL(callbackURL, requestOrigin).toString();
    }

    const candidate = new URL(callbackURL);
    return candidate.origin === requestOrigin ? candidate.toString() : undefined;
  } catch {
    return undefined;
  }
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
      baseUrl: resolveNextAuthRuntimeBaseUrl(new URL(request.url).origin),
    });

    return NextResponse.json({ message: 'Verification email sent' });
  } catch (err) {
    Logger.error('Send verification email error', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (isBetterAuthProviderEnabled()) {
    const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    const token = request.nextUrl.searchParams.get('token');

    if (secret && token) {
      const parsedToken = await parseBetterAuthEmailChangeToken(token, secret);
      if (parsedToken) {
        const hasPending = await hasBetterAuthPendingEmailChange(parsedToken.userId, parsedToken.newEmail);
        if (!hasPending) {
          return NextResponse.redirect(new URL('/dashboard/profile?emailChange=canceled', request.url));
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

        return response;
      }
    }

    const { betterAuthNextJsHandler } = await import('@/lib/better-auth');
    return betterAuthNextJsHandler.GET(request);
  }

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    if (!token || !email) {
      return NextResponse.redirect(new URL('/sign-in?error=invalid-verification-link', request.url));
    }

    const hashedToken = createHash('sha256').update(token).digest('hex');
    const record = await prisma.verificationToken.findUnique({ where: { token: hashedToken } });

    if (!record || record.expires < new Date()) {
      if (record) {
        await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier, token: hashedToken } });
      }
      return NextResponse.redirect(new URL('/sign-in?error=expired-verification-link', request.url));
    }

    const { parseVerificationIdentifier } = await import('@/lib/nextauth-email-verification');
    const parsedIdentifier = parseVerificationIdentifier(record.identifier);
    if (!parsedIdentifier) {
      await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier, token: hashedToken } });
      return NextResponse.redirect(new URL('/sign-in?error=invalid-verification-link', request.url));
    }

    if (parsedIdentifier.kind === 'email-verify') {
      const normalizedEmail = email.toLowerCase().trim();
      if (parsedIdentifier.email !== normalizedEmail) {
        await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier, token: hashedToken } });
        return NextResponse.redirect(new URL('/sign-in?error=invalid-verification-link', request.url));
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

      return NextResponse.redirect(new URL('/sign-in?verification=success', request.url));
    }

    const normalizedNewEmail = email.toLowerCase().trim();
    if (parsedIdentifier.newEmail !== normalizedNewEmail) {
      await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier, token: hashedToken } });
      return NextResponse.redirect(new URL('/sign-in?error=invalid-verification-link', request.url));
    }

    const user = await prisma.user.findUnique({
      where: { id: parsedIdentifier.userId },
      select: { id: true, name: true, email: true },
    });
    if (!user?.id || !user.email) {
      await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } });
      return NextResponse.redirect(new URL('/sign-in?error=verification-failed', request.url));
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
      return NextResponse.redirect(new URL('/dashboard/profile?emailChange=already-used', request.url));
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: normalizedNewEmail,
        emailVerified: new Date(),
      },
    });

    await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } });

    return NextResponse.redirect(new URL('/dashboard/profile?emailChange=success', request.url));
  } catch (err) {
    Logger.error('Verify email error', err);
    return NextResponse.redirect(new URL('/sign-in?error=verification-failed', request.url));
  }
}
