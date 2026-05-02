/**
 * User Registration API Route (NextAuth)
 * =========================================
 * Creates a new user with email + password.
 * Only used when AUTH_PROVIDER=nextauth (Clerk handles its own registration).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIP, RATE_LIMITS } from '@/lib/rateLimit';
import { validatePasswordStrength } from '@/lib/password-policy';
import { validateAndFormatPersonName } from '@/lib/name-validation';
import { Logger } from '@/lib/logger';
import { resolveRequestOrigin, resolveSameOriginUrl } from '@/lib/request-origin';
import { apiSchemas, validateInput } from '@/lib/validation';

function isBetterAuthProviderEnabled() {
  return process.env.AUTH_PROVIDER === 'betterauth';
}

function normalizeCallbackUrl(request: NextRequest, callbackURL?: string) {
  if (!callbackURL) {
    return undefined;
  }

  return resolveSameOriginUrl(request, callbackURL);
}

function getRequestOrigin(request: NextRequest) {
  return resolveRequestOrigin(request);
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = getClientIP(request);
    const rl = await rateLimit(`auth:register:${ip}`, RATE_LIMITS.AUTH, {
      ip,
      route: '/api/auth/register',
      method: 'POST',
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json().catch(() => null);
    const validation = validateInput(apiSchemas.authRegister, body);

    if (!validation.success) {
      return NextResponse.json({ error: validation.error, issues: validation.issues }, { status: 400 });
    }

    const {
      name,
      firstName,
      lastName,
      email: rawEmail,
      password,
      callbackURL: rawCallbackURL,
    } = validation.data;

    // Normalize email
    const email = typeof rawEmail === 'string' ? rawEmail.toLowerCase().trim() : '';
    if (!email) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    // Validate password strength
    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.message }, { status: 400 });
    }

    const validatedName = validateAndFormatPersonName({
      fullName: typeof name === 'string' ? name : undefined,
      firstName: typeof firstName === 'string' ? firstName : undefined,
      lastName: typeof lastName === 'string' ? lastName : undefined,
    });
    if (!validatedName.ok) {
      return NextResponse.json({ error: validatedName.error || 'Invalid name' }, { status: 400 });
    }

    const displayName = validatedName.fullName || email.split('@')[0] || 'User';

    // Check if user already exists — use generic message to prevent email enumeration
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        {
          error: 'An account already exists for this email. Sign in or use a different email address.',
          code: 'EMAIL_ALREADY_USED',
        },
        { status: 409 }
      );
    }

    if (isBetterAuthProviderEnabled()) {
      const { betterAuthServer } = await import('@/lib/better-auth');

      await betterAuthServer.api.signUpEmail({
        headers: request.headers,
        body: {
          email,
          password,
          name: displayName,
          ...(normalizeCallbackUrl(request, rawCallbackURL) ? { callbackURL: normalizeCallbackUrl(request, rawCallbackURL) } : {}),
        },
      });

      return NextResponse.json({ email, requiresVerification: true }, { status: 201 });
    }

    // Create the user (emailVerified: null — require verification)
    const { hashPassword } = await import('@/lib/nextauth.config');
    const hashed = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        name: validatedName.fullName,
        password: hashed,
        role: 'USER',
        emailVerified: null,
      },
    });

    // Send verification email (async, non-blocking)
    const { sendNextAuthVerificationEmail } = await import('@/lib/nextauth-email-verification');
    sendNextAuthVerificationEmail({
      userId: user.id,
      email,
      name: validatedName.fullName,
      baseUrl: getRequestOrigin(request),
    }).catch(() => {});

    return NextResponse.json({ id: user.id, email: user.email, requiresVerification: true }, { status: 201 });
  } catch (err) {
    Logger.error('Registration failed', err);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
