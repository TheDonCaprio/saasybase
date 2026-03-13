import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { toError } from '../../../../../lib/runtime-guards';

export async function POST(_request: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
	const params = await ctx.params;
	const { userId } = await authService.getSession();
	if (!userId) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (!authService.supportsFeature('session_management')) {
		return NextResponse.json({ error: 'Session revocation is not supported by the active auth provider' }, { status: 501 });
	}

	const { sessionId } = params;

	try {
		const sessionInfos = await authService.getUserSessions(userId);
		const session = sessionInfos.find((entry) => entry.id === sessionId);

		if (!session) {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
		}

		await authService.revokeSession(sessionId);

		return NextResponse.json({ revoked: true });
	} catch (error: unknown) {
		console.error('Failed to revoke session:', toError(error));
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function GET() {
	return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
