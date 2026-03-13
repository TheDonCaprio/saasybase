import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../../lib/auth';
import { adminRateLimit } from '../../../../../lib/rateLimit';
import { recordAdminAction } from '../../../../../lib/admin-actions';

// Small runtime helpers to avoid `any` and safely narrow `unknown` inputs
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key];
  return typeof val === 'string' ? val : undefined;
}

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

export async function POST(request: NextRequest) {
  let actor: Awaited<ReturnType<typeof requireAdminOrModerator>>;
  let actorId: string;
  try {
    actor = await requireAdminOrModerator('notifications');
    actorId = actor.userId;
    const rl = await adminRateLimit(actorId, request, 'admin-notifications:create', { limit: 40, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
  const body: unknown = await request.json();
  const raw = asRecord(body);

  // Narrow and validate the minimal expected fields
  const title = getString(raw, 'title') || '';
  const message = getString(raw, 'message') || '';
  const type = getString(raw, 'type');
  const target = getString(raw, 'target');
  const targetEmail = getString(raw, 'targetEmail');

    if (!title || !message) {
      return NextResponse.json({ error: 'Title and message are required' }, { status: 400 });
    }

    if (target === 'all') {
      // Send to all users in batches to prevent OOM
      const BATCH_SIZE = 1000;
      let lastId: string | undefined = undefined;
      let totalUsers = 0;

      while (true) {
        const batchUsers: { id: string }[] = await prisma.user.findMany({
          select: { id: true },
          take: BATCH_SIZE,
          ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {})
        });

        if (batchUsers.length === 0) break;
        totalUsers += batchUsers.length;
        lastId = batchUsers[batchUsers.length - 1].id;

        const notifications = batchUsers.map((user: { id: string }) => {
          return type
            ? { userId: user.id, title, message, type }
            : { userId: user.id, title, message };
        });

        await prisma.notification.createMany({ data: notifications });
      }

      await recordAdminAction({
        actorId,
        actorRole: actor.role,
        action: 'notification.broadcast',
        targetType: 'notification',
        details: { title, recipientCount: totalUsers },
      });

      return NextResponse.json({ 
        success: true, 
        message: `Notification sent to ${totalUsers} users` 
      });
    } else {
      // Send to specific user
      const user = await prisma.user.findUnique({
        where: { email: targetEmail },
        select: { id: true }
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const data: { userId: string; title: string; message: string; type?: string } = {
        userId: user.id,
        title,
        message
      };
      if (type) data.type = type;

      await prisma.notification.create({ data });

      await recordAdminAction({
        actorId,
        actorRole: actor.role,
        action: 'notification.send',
        targetUserId: user.id,
        targetType: 'notification',
        details: { title, targetEmail },
      });

      return NextResponse.json({ 
        success: true, 
        message: `Notification sent to ${targetEmail}` 
      });
    }
  } catch (error) {
    console.error('Error creating notification:', toErrorMessage(error));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
