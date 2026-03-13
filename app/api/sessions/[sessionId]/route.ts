import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
	const params = await ctx.params;
	const { userId } = await authService.getSession();
	if (!userId) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (!authService.supportsFeature('session_management')) {
		return NextResponse.json({ error: 'Session management is not supported by the active auth provider' }, { status: 501 });
	}

	const sessionInfos = await authService.getUserSessions(userId);
	const session = sessionInfos.find((entry) => entry.id === params.sessionId);
	if (!session) {
		return NextResponse.json({ error: 'Not found' }, { status: 404 });
	}

	return NextResponse.json({
		id: session.id,
		status: session.status,
		lastActiveAt: session.lastActiveAt?.toISOString() ?? null,
		latestActivity: session.activity ?? null,
	});
}

export async function POST() {
	return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
