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
import { sendEmail } from '@/lib/email';
import { randomBytes, createHash } from 'crypto';

export async function POST() {
  try {
    const session = await authService.getSession();
    if (!session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Generate token
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = createHash('sha256').update(rawToken).digest('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const identifier = `email-verify:${user.email}`;

    // Delete old tokens for this identifier before creating a new one
    await prisma.verificationToken.deleteMany({ where: { identifier } });

    await prisma.verificationToken.create({
      data: {
        identifier,
        token: hashedToken,
        expires,
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

    await sendEmail({
      to: user.email,
      userId: user.id,
      templateKey: 'email_verification',
      variables: {
        firstName: user.name?.split(' ')[0] || 'there',
        userEmail: user.email,
        actionUrl: verifyUrl,
      },
    });

    return NextResponse.json({ message: 'Verification email sent' });
  } catch (err) {
    console.error('Send verification email error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    if (!token || !email) {
      return NextResponse.redirect(new URL('/sign-in?error=invalid-verification-link', request.url));
    }

    const hashedToken = createHash('sha256').update(token).digest('hex');
    const identifier = `email-verify:${email}`;

    const record = await prisma.verificationToken.findFirst({
      where: { identifier, token: hashedToken },
    });

    if (!record || record.expires < new Date()) {
      if (record) {
        await prisma.verificationToken.deleteMany({ where: { identifier, token: hashedToken } });
      }
      return NextResponse.redirect(new URL('/sign-in?error=expired-verification-link', request.url));
    }

    // Mark email as verified
    await prisma.user.updateMany({
      where: { email: email.toLowerCase().trim() },
      data: { emailVerified: new Date() },
    });

    // Delete the token
    await prisma.verificationToken.deleteMany({ where: { identifier } });

    return NextResponse.redirect(new URL('/dashboard?verified=true', request.url));
  } catch (err) {
    console.error('Verify email error:', err);
    return NextResponse.redirect(new URL('/sign-in?error=verification-failed', request.url));
  }
}
