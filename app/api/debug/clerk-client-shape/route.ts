import { NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';

function debugRouteDisabled() {
  return process.env.NODE_ENV === 'production' || process.env.ENABLE_DEBUG_ROUTES !== 'true';
}

export async function GET() {
  if (debugRouteDisabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    await requireAdmin();
    return NextResponse.json({ ok: true, message: 'clerk-client-shape debug route' });
  } catch (error) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}