import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { toError } from '../../../../../lib/runtime-guards';

export async function POST(_request: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
	const params = await ctx.params;
	const { userId } = await authService.getSession();
	if (!userId) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { sessionId } = params;

	try {
		await authService.revokeSession(sessionId);

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
