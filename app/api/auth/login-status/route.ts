import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIP, RATE_LIMITS } from '@/lib/rateLimit';
import { Logger } from '@/lib/logger';
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password. Please try again.';

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const rl = await rateLimit(`auth:login-status:${ip}`, RATE_LIMITS.AUTH, {
      ip,
      route: '/api/auth/login-status',
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
        email: true,
        name: true,
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

    if (user.emailVerified) {
      return NextResponse.json({ ok: true, canSignIn: true });
    }

    return NextResponse.json(
      {
        ok: false,
        canSignIn: false,
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Your email is not verified.',
      },
      { status: 403 }
    );
  } catch (err) {
    Logger.error('Login status check failed', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}