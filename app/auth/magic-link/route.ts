import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestOrigin } from '@/lib/request-origin';

export async function GET(request: NextRequest) {
  const source = new URL(request.url);
  const target = new URL('/api/auth/callback/nodemailer', resolveRequestOrigin(request));

  for (const key of ['token', 'email', 'callbackUrl']) {
    const value = source.searchParams.get(key);
    if (value) {
      target.searchParams.set(key, value);
    }
  }

  return NextResponse.redirect(target);
}