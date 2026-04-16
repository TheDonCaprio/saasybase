import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authService } from '@/lib/auth-provider';
import { Logger } from '@/lib/logger';

export async function POST() {
  const { userId } = await authService.getSession();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await prisma.notification.updateMany({
      where: { 
        userId: userId,
        read: false
      },
      data: { read: true }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    Logger.error('Error marking all notifications as read', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
