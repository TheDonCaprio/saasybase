import { NextResponse } from 'next/server';

// Deprecated: This test endpoint has been disabled.
// Rationale: Unauthenticated refund testing must never be exposed.
// Behavior: Always returns 404 in all environments.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
