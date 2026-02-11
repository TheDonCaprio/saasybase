import { NextResponse } from 'next/server';

// Deprecated: generic test endpoint disabled.
export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
