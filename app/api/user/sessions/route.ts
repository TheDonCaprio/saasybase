/**
 * User Sessions API Route
 * =========================
 * Lists active sessions for the authenticated user.
 * Used by the NextAuth client hooks (`user.getSessions()`).
 * Also works with Clerk — calls through the auth abstraction.
 *
 */

import { NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';

export async function GET() {
  try {
    const session = await authService.getSession();
    if (!session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessions = await authService.getUserSessions(session.userId);

    return NextResponse.json(
      sessions.map((s) => ({
        id: s.id,
        status: s.status,
        lastActiveAt: s.lastActiveAt?.toISOString() ?? null,
        latestActivity: s.activity ?? null,
        isCurrent: s.id === session.sessionId,
      }))
    );
  } catch (err) {
    console.error('Failed to fetch sessions:', err);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}
