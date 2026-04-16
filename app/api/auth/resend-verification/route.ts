import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIP, RATE_LIMITS } from '@/lib/rateLimit';
import { sendNextAuthVerificationEmail } from '@/lib/nextauth-email-verification';
import { Logger } from '@/lib/logger';

const GENERIC_SUCCESS_MESSAGE = 'If that account exists and is awaiting verification, a verification email has been sent.';

export async function POST(request: NextRequest) {
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
      await sendNextAuthVerificationEmail({
        userId: user.id,
        email: user.email,
        name: user.name,
      });
    }

    return NextResponse.json({ ok: true, message: GENERIC_SUCCESS_MESSAGE });
  } catch (error) {
    Logger.error('Resend verification failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}