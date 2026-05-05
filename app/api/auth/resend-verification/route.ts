import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIP, RATE_LIMITS } from '@/lib/rateLimit';
import { Logger } from '@/lib/logger';
import { resolveRequestOrigin } from '@/lib/request-origin';

const GENERIC_SUCCESS_MESSAGE = 'If that account exists and is awaiting verification, a verification email has been sent.';

function isBetterAuthProviderEnabled() {
  return process.env.AUTH_PROVIDER === 'betterauth';
}

export async function POST(request: NextRequest) {
  if (isBetterAuthProviderEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  try {
    const ip = getClientIP(request);
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const rl = await rateLimit(`auth:resend-verification:${ip}:${email}`, RATE_LIMITS.AUTH, {
      ip,
      route: '/api/auth/resend-verification',
      method: 'POST',
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many verification email requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, emailVerified: true },
    });

    if (user && !user.emailVerified && user.email) {
      const { sendNextAuthVerificationEmail } = await import('@/lib/nextauth-email-verification');
      await sendNextAuthVerificationEmail({
        userId: user.id,
        email: user.email,
        name: user.name,
        baseUrl: resolveRequestOrigin(request),
      });
    }

    return NextResponse.json({ ok: true, message: GENERIC_SUCCESS_MESSAGE });
  } catch (error) {
    Logger.error('Resend verification failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}