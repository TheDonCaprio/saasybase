/**
 * Reset Password API Route (NextAuth)
 * ======================================
 * Validates a password-reset token and updates the user's password.
 * Only used when AUTH_PROVIDER=nextauth.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/nextauth.config';
import { createHash } from 'crypto';

export async function POST(request: Request) {
  try {
    const { token, email, password } = await request.json();

    if (!token || !email || !password) {
      return NextResponse.json({ error: 'Token, email, and password are required' }, { status: 400 });
    }

    if (typeof password === 'string' && password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const hashedToken = createHash('sha256').update(token).digest('hex');
    const identifier = `pwd-reset:${email.toLowerCase().trim()}`;

    // Find the token
    const record = await prisma.verificationToken.findFirst({
      where: { identifier, token: hashedToken },
    });

    if (!record) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
    }

    if (record.expires < new Date()) {
      // Clean up expired token
      await prisma.verificationToken.deleteMany({ where: { identifier, token: hashedToken } });
      return NextResponse.json({ error: 'Reset link has expired. Please request a new one.' }, { status: 400 });
    }

    // Update password
    const hashed = await hashPassword(password);
    await prisma.user.update({
      where: { email: email.toLowerCase().trim() },
      data: { password: hashed },
    });

    // Delete the used token
    await prisma.verificationToken.deleteMany({ where: { identifier } });

    return NextResponse.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
