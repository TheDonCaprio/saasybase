/**
 * Change Password API Route
 * ============================
 * Allows authenticated users to change their password (NextAuth only).
 * Requires the current password for verification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { rateLimit, getClientIP } from '@/lib/rateLimit';
import { validatePasswordStrength } from '@/lib/password-policy';
import { Logger } from '@/lib/logger';

const BCRYPT_SALT_ROUNDS = 12;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await authService.getSession();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit by user ID
    const ip = getClientIP(request);
    const rl = await rateLimit(`auth:change-password:${userId}`, { limit: 5, windowMs: 15 * 60 * 1000, message: 'Too many password change attempts' }, {
      actorId: userId,
      ip,
      route: '/api/user/change-password',
      method: 'POST',
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    const pwCheck = validatePasswordStrength(newPassword);
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.message }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user?.password) {
      return NextResponse.json(
        { error: 'Your account uses social login and does not have a password. You can set one via "Forgot Password" on the sign-in page.' },
        { status: 400 }
      );
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });
    }

    const hashed = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { password: hashed, tokenVersion: { increment: 1 } },
      }),
      prisma.session.deleteMany({ where: { userId } }),
    ]);

    return NextResponse.json({ message: 'Password changed successfully' });
  } catch (error) {
    Logger.error('Change password error', error);
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
