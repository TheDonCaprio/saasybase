import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getClientIP, rateLimit, RATE_LIMITS } from '@/lib/rateLimit';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password. Please try again.';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function shouldUseSecureCookie(request: NextRequest): boolean {
  return request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
}

function getSessionCookieName(request: NextRequest): string {
  return `${shouldUseSecureCookie(request) ? '__Secure-' : ''}authjs.session-token`;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const rl = await rateLimit(`auth:credentials-signin:${ip}`, RATE_LIMITS.AUTH, {
      ip,
      route: '/api/auth/credentials-login',
      method: 'POST',
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
      return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        password: true,
        emailVerified: true,
      },
    });

    if (!user?.password) {
      return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
    }

    if (!user.emailVerified) {
      return NextResponse.json(
        {
          ok: false,
          canSignIn: false,
          code: 'EMAIL_NOT_VERIFIED',
          error: 'Your email is not verified.',
        },
        { status: 403 }
      );
    }

    const sessionToken = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(getSessionCookieName(request), sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: shouldUseSecureCookie(request),
      expires,
    });

    return response;
  } catch (err) {
    console.error('Credentials login failed:', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}