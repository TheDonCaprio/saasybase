import { NextResponse } from 'next/server';
// Deprecated: dev/test-subscription endpoint disabled in all environments.
export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
