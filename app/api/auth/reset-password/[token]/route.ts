import { NextRequest, NextResponse } from 'next/server';

function isBetterAuthProviderEnabled() {
  return process.env.AUTH_PROVIDER === 'betterauth';
}

export async function GET(request: NextRequest) {
  if (!isBetterAuthProviderEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const { betterAuthNextJsHandler } = await import('@/lib/better-auth');
  return betterAuthNextJsHandler.GET(request);
}