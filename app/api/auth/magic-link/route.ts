import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Logger } from '@/lib/logger';
import { RATE_LIMITS, getClientIP, rateLimit } from '@/lib/rateLimit';
import { apiSchemas, validateInput } from '@/lib/validation';
import { handleApiError, ApiError } from '@/lib/api-error';

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
    if (process.env.AUTH_PROVIDER !== 'betterauth') {
      throw ApiError.badRequest('Magic link sign-in is only available with Better Auth.', 'MAGIC_LINK_UNAVAILABLE');
    }

    const ip = getClientIP(request);
    const rl = await rateLimit(`auth:magic-link:${ip}`, RATE_LIMITS.AUTH, {
      ip,
      route: '/api/auth/magic-link',
      method: 'POST',
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many magic-link requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json().catch(() => null);
    const validation = validateInput(apiSchemas.authMagicLink, body);

    if (!validation.success) {
      return NextResponse.json({ error: validation.error, issues: validation.issues }, { status: 400 });
    }

    const { email, callbackURL, errorCallbackURL, newUserCallbackURL } = validation.data;
    const normalizedEmail = email.toLowerCase().trim();
    const successResponse = NextResponse.json({
      message: 'If that email is eligible, a sign-in link has been sent.',
    });

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (!user) {
      return successResponse;
    }

    const { betterAuthServer } = await import('@/lib/better-auth');

    await betterAuthServer.api.signInMagicLink({
      headers: request.headers,
      body: {
        email: normalizedEmail,
        ...(normalizeCallbackUrl(request, callbackURL) ? { callbackURL: normalizeCallbackUrl(request, callbackURL) } : {}),
        ...(normalizeCallbackUrl(request, errorCallbackURL) ? { errorCallbackURL: normalizeCallbackUrl(request, errorCallbackURL) } : {}),
        ...(normalizeCallbackUrl(request, newUserCallbackURL) ? { newUserCallbackURL: normalizeCallbackUrl(request, newUserCallbackURL) } : {}),
      },
    });

    return successResponse;
  } catch (error) {
    Logger.error('Magic link request failed', error);
    return handleApiError(error);
  }
}