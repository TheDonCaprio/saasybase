import { NextRequest, NextResponse } from 'next/server';

// Basic stub for session retrieval / placeholder. Having at least one export
// ensures this file is treated as a module by the type generator.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
	const params = await ctx.params;
	const { sessionId } = params;
	return NextResponse.json({ message: 'Session endpoint', sessionId }, { status: 200 });
}

// Accept other methods but return Method Not Allowed for now.
export async function POST() {
	return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
