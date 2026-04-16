import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { Logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
	const { userId } = await authService.getSession();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	if (!authService.supportsFeature('session_management')) {
		return NextResponse.json({ error: 'Session revocation is not supported by the active auth provider' }, { status: 501 });
	}

	const body: unknown = await request.json().catch(() => ({} as unknown));
	const bodyRec = (body && typeof body === 'object') ? (body as Record<string, unknown>) : {} as Record<string, unknown>;
	const keepSessionId: string | undefined = typeof bodyRec.keepSessionId === 'string' ? bodyRec.keepSessionId : undefined;

	try {
		// Collect sessions for this user via auth provider abstraction
		const sessionInfos = await authService.getUserSessions(userId);
		const sessions: Array<{ id: string }> = sessionInfos.map(s => ({ id: s.id }));

		if (!sessions || sessions.length === 0) {
			return NextResponse.json({ error: 'Unable to enumerate sessions via auth provider' }, { status: 501 });
		}

		// Revoke/delete every session except keepSessionId
		const toRevoke = sessions.filter(s => s.id !== keepSessionId).map(s => s.id);
		const revoked: string[] = [];
		const failed: Array<{ id: string; error: string }> = [];

		for (const sid of toRevoke) {
			try {
				await authService.revokeSession(sid);
				revoked.push(sid);
			} catch (e) {
				const errMsg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null && 'message' in e ? String((e as Record<string, unknown>)['message']) : String(e));
				failed.push({ id: sid, error: errMsg });
			}
		}

		return NextResponse.json({ revoked, failed });
	} catch (error) {
		Logger.error('Failed to revoke other sessions', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function GET() {
	return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
