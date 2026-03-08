/**
 * Forgot Password API Route (NextAuth)
 * =======================================
 * Generates a time-limited reset token and sends a password-reset email.
 * Only used when AUTH_PROVIDER=nextauth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { randomBytes, createHash } from 'crypto';
import { rateLimit, getClientIP, RATE_LIMITS } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP — stricter limit for password reset
    const ip = getClientIP(request);
    const rl = await rateLimit(`auth:forgot-password:${ip}`, { limit: 5, windowMs: 15 * 60 * 1000, message: 'Too many password reset requests' }, {
      ip,
      route: '/api/auth/forgot-password',
      method: 'POST',
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
      );
    }

    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Always return success to prevent email enumeration
    const successResponse = NextResponse.json({
      message: 'If an account with that email exists, a password reset link has been sent.',
    });

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) return successResponse;

    // Generate a token. Store the hash in the DB, send the raw token via email.
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = createHash('sha256').update(rawToken).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const identifier = `pwd-reset:${normalizedEmail}`;

    // Delete any existing tokens for this user before creating a new one
    await prisma.verificationToken.deleteMany({ where: { identifier } });

    await prisma.verificationToken.create({
      data: {
        identifier,
        token: hashedToken,
        expires,
      },
    });

    // Build reset URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/sign-in?mode=reset-password&token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;

    await sendEmail({
      to: normalizedEmail,
      userId: user.id,
      templateKey: 'password_reset',
      variables: {
        firstName: user.name?.split(' ')[0] || 'there',
        userEmail: normalizedEmail,
        actionUrl: resetUrl,
        dashboardUrl: `${baseUrl}/dashboard`,
      },
    });

    return successResponse;
  } catch (err) {
    console.error('Forgot password error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
