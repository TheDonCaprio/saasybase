import type { NextRequest } from 'next/server';

function firstForwardedForIp(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

export function getRequestIp(request: Pick<NextRequest, 'headers'>): string | null {
  const headers = request.headers;

  return (
    firstForwardedForIp(headers.get('x-forwarded-for')) ||
    headers.get('x-real-ip') ||
    headers.get('cf-connecting-ip') ||
    headers.get('x-client-ip') ||
    headers.get('x-forwarded') ||
    null
  );
}
