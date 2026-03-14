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
import {
  parseVerificationIdentifier,
  sendNextAuthVerificationEmail,
} from '@/lib/nextauth-email-verification';
import { sendWelcomeIfNotSent } from '@/lib/welcome';

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

    await sendNextAuthVerificationEmail({
      userId: user.id,
      email: user.email,
      name: user.name,
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
    const record = await prisma.verificationToken.findUnique({ where: { token: hashedToken } });

    if (!record || record.expires < new Date()) {
      if (record) {
        await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier, token: hashedToken } });
      }
      return NextResponse.redirect(new URL('/sign-in?error=expired-verification-link', request.url));
    }

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
    console.error('Verify email error:', err);
    return NextResponse.redirect(new URL('/sign-in?error=verification-failed', request.url));
  }
}
