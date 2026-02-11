import { NextResponse } from 'next/server';

// Deprecated: test PDF generation endpoint is disabled in all environments.
export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
