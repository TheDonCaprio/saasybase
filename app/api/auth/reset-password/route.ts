/**
 * Reset Password API Route (NextAuth)
 * ======================================
 * Validates a password-reset token and updates the user's password.
 * Only used when AUTH_PROVIDER=nextauth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';
import { rateLimit, getClientIP } from '@/lib/rateLimit';
import { validatePasswordStrength } from '@/lib/password-policy';
import { Logger } from '@/lib/logger';

function isBetterAuthProviderEnabled() {
  return process.env.AUTH_PROVIDER === 'betterauth';
}

export async function POST(request: NextRequest) {
  if (isBetterAuthProviderEnabled()) {
    const clonedRequest = request.clone();
    const queryToken = request.nextUrl.searchParams.get('token') || undefined;
    const resetBody = await clonedRequest.json().catch(() => null) as { token?: string; newPassword?: string } | null;
    const resetToken = typeof resetBody?.token === 'string' && resetBody.token.length > 0 ? resetBody.token : queryToken;
    const newPassword = typeof resetBody?.newPassword === 'string' ? resetBody.newPassword : '';

    const verification = resetToken
      ? await prisma.verification.findFirst({
          where: { identifier: `reset-password:${resetToken}` },
          select: { value: true },
        })
      : null;

    const { betterAuthNextJsHandler } = await import('@/lib/better-auth');
    const response = await betterAuthNextJsHandler.POST(request);

    if (response.ok && verification?.value && newPassword) {
      const { hashPassword } = await import('@/lib/nextauth.config');
      const hashed = await hashPassword(newPassword);
      await prisma.user.update({
        where: { id: verification.value },
        data: { password: hashed },
      });
    }

    return response;
  }

  try {
    // Rate limit by IP
    const ip = getClientIP(request);
    const rl = await rateLimit(`auth:reset-password:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000, message: 'Too many password reset attempts' }, {
      ip,
      route: '/api/auth/reset-password',
      method: 'POST',
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
      );
    }

    const { token, email, password } = await request.json();

    if (!token || !email || !password) {
      return NextResponse.json({ error: 'Token, email, and password are required' }, { status: 400 });
    }

    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.message }, { status: 400 });
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

    const { hashPassword } = await import('@/lib/nextauth.config');
    const hashed = await hashPassword(password);
    const normalizedEmail = email.toLowerCase().trim();
    const updatedUser = await prisma.user.update({
      where: { email: normalizedEmail },
      data: { password: hashed, tokenVersion: { increment: 1 } },
      select: { id: true },
    });

    await prisma.session.deleteMany({ where: { userId: updatedUser.id } });

    // Delete the used token
    await prisma.verificationToken.deleteMany({ where: { identifier } });

    return NextResponse.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    Logger.error('Reset password error', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
