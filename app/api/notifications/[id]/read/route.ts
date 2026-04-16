import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authService } from '@/lib/auth-provider';
import { Logger } from '@/lib/logger';

async function handleMarkRead(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const { userId } = await authService.getSession();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const notification = await prisma.notification.updateMany({
      where: {
        id: params.id,
        userId: userId // Ensure user can only update their own notifications
      },
      data: { read: true }
    });

    // notification.count will be 1 if updated, 0 if not found/owned
    return NextResponse.json({ updated: notification.count });
  } catch (error) {
    Logger.error('Error marking notification as read', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleMarkRead(request, ctx);
}

// Client code currently issues POST for convenience; accept POST as well
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleMarkRead(request, ctx);
}

