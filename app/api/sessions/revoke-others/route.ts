import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

type LegacySessionSummary = { id: string };
type LegacyUserWithSessions = { sessions?: LegacySessionSummary[] };
type LegacySessionsApi = {
	revokeSession?: (sessionId: string) => Promise<unknown>;
	delete?: (sessionId: string) => Promise<unknown>;
	list?: (args: { userId: string }) => Promise<LegacySessionSummary[] | { data?: LegacySessionSummary[] }>;
	getSessionsForUser?: (userId: string) => Promise<LegacySessionSummary[]>;
};

type LegacyUsersApi = {
	deleteSession?: (userId: string, sessionId: string) => Promise<unknown>;
};

export async function POST(request: NextRequest) {
	const { userId } = await auth();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

	const body: unknown = await request.json().catch(() => ({} as unknown));
	const bodyRec = (body && typeof body === 'object') ? (body as Record<string, unknown>) : {} as Record<string, unknown>;
	const keepSessionId: string | undefined = typeof bodyRec.keepSessionId === 'string' ? bodyRec.keepSessionId : undefined;

	try {
		// Collect sessions for this user using standard API
		let sessions: Array<{ id: string }> = [];
		const client = await clerkClient();

		try {
			const user = await client.users.getUser(userId);
			const maybeWithSessions = user as LegacyUserWithSessions;
			if (maybeWithSessions.sessions && Array.isArray(maybeWithSessions.sessions)) {
				sessions = maybeWithSessions.sessions.map(s => ({ id: s.id }));
			}
		} catch { /* ignore */ }

		// If not found yet, try sessions.list or sessions.getSessionsForUser depending on SDK
		if (sessions.length === 0) {
			try {
				const sessionsApi = client.sessions as LegacySessionsApi;
				if (typeof sessionsApi.list === 'function') {
					const list = await sessionsApi.list({ userId });
					const items = Array.isArray(list) ? list : (list?.data ?? []);
					sessions = items.map(s => ({ id: s.id }));
				} else if (typeof sessionsApi.getSessionsForUser === 'function') {
					const items = await sessionsApi.getSessionsForUser(userId);
					sessions = items.map(s => ({ id: s.id }));
				}
			} catch { /* ignore */ }
		}

		// If still no sessions, return 501 (SDK doesn't expose list capabilities)
		if (!sessions || sessions.length === 0) {
			return NextResponse.json({ error: 'Unable to enumerate sessions on this Clerk SDK' }, { status: 501 });
		}

		// Revoke/delete every session except keepSessionId
		const toRevoke = sessions.filter(s => s.id !== keepSessionId).map(s => s.id);
		const revoked: string[] = [];
		const failed: Array<{ id: string; error: string }> = [];

		for (const sid of toRevoke) {
			try {
				const sessionsApi = client.sessions as LegacySessionsApi;
				const usersApi = client.users as LegacyUsersApi;
				if (typeof sessionsApi.revokeSession === 'function') {
					await sessionsApi.revokeSession(sid);
				} else if (typeof sessionsApi.delete === 'function') {
					await sessionsApi.delete(sid);
				} else if (typeof usersApi?.deleteSession === 'function') {
					await usersApi.deleteSession(userId, sid);
				} else {
					throw new Error('No supported session deletion method on Clerk SDK');
				}
				revoked.push(sid);
			} catch (e) {
				const errMsg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null && 'message' in e ? String((e as Record<string, unknown>)['message']) : String(e));
				failed.push({ id: sid, error: errMsg });
			}
		}

		return NextResponse.json({ revoked, failed });
	} catch (error) {
		console.error('Failed to revoke other sessions:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function GET() {
	return NextResponse.json({ message: 'Revoke others endpoint (POST expected)' });
}
