/**
 * Change Password API Route
 * ============================
 * Allows authenticated users to change their password (NextAuth only).
 * Requires the current password for verification.
 */

import { NextResponse } from 'next/server';
import { getAuthSafe } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

const BCRYPT_SALT_ROUNDS = 12;

export async function POST(request: Request) {
  try {
    const { userId } = await getAuthSafe();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters' },
        { status: 400 }
      );
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
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    return NextResponse.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
