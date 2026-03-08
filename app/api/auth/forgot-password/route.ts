/**
 * Forgot Password API Route (NextAuth)
 * =======================================
 * Generates a time-limited reset token and sends a password-reset email.
 * Only used when AUTH_PROVIDER=nextauth.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { randomBytes, createHash } from 'crypto';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Always return success to prevent email enumeration
    const successResponse = NextResponse.json({
      message: 'If an account with that email exists, a password reset link has been sent.',
    });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) return successResponse;

    // Generate a token. Store the hash in the DB, send the raw token via email.
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = createHash('sha256').update(rawToken).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Upsert into VerificationToken (reusing the NextAuth model)
    await prisma.verificationToken.upsert({
      where: { identifier_token: { identifier: `pwd-reset:${email}`, token: hashedToken } },
      update: { expires },
      create: {
        identifier: `pwd-reset:${email}`,
        token: hashedToken,
        expires,
      },
    });

    // Build reset URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/sign-in?mode=reset-password&token=${rawToken}&email=${encodeURIComponent(email)}`;

    await sendEmail({
      to: email,
      userId: user.id,
      templateKey: 'password_reset',
      variables: {
        firstName: user.name?.split(' ')[0] || 'there',
        userEmail: email,
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
