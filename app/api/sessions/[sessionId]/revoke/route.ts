import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { toError } from '../../../../../lib/runtime-guards';

type LegacySessionsApi = {
	delete?: (sessionId: string) => Promise<unknown>;
};

type LegacyUsersApi = {
	deleteSession?: (userId: string, sessionId: string) => Promise<unknown>;
};

export async function POST(_request: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
	const params = await ctx.params;
	const { userId } = await auth();
	if (!userId) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { sessionId } = params;

	try {
		const client = await clerkClient();

		try {
			await client.sessions.revokeSession(sessionId);
		} catch (err) {
			// Fallback for older SDKs or different API shapes if needed, but try standard first
			// Actually, with @clerk/nextjs v5, revokeSession is the standard way on the client instance
			// If that fails, we can try delete
			try {
				const legacySessions = client.sessions as LegacySessionsApi;
				if (typeof legacySessions.delete === 'function') {
					await legacySessions.delete(sessionId);
				} else {
					throw err;
				}
			} catch {
				// Try users.deleteSession as last resort
				const legacyUsers = client.users as LegacyUsersApi;
				if (typeof legacyUsers?.deleteSession === 'function') {
					await legacyUsers.deleteSession(userId, sessionId);
				} else {
					throw err;
				}
			}
		}

		return NextResponse.json({ revoked: true });
	} catch (error: unknown) {
		console.error('Failed to revoke session:', toError(error));
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

// Also respond to GET for simple testing in browser
export async function GET(_request: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
	const params = await ctx.params;
	return NextResponse.json({ message: 'Revoke endpoint', sessionId: params.sessionId });
}
