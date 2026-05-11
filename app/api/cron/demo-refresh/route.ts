import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIP } from '@/lib/rateLimit';
import { DemoRefreshSeedMissingError, refreshDemoData } from '@/lib/demo-refresh';
import { toError } from '@/lib/runtime-guards';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getBearerToken(req: NextRequest): string | null {
  const bearer = req.headers.get('authorization') || '';
  if (!bearer.startsWith('Bearer ')) return null;
  const token = bearer.slice('Bearer '.length).trim();
  return token.length ? token : null;
}

function isCronAuthorized(req: NextRequest): boolean {
  const expectedTokens = [
    process.env.CRON_DEMO_REFRESH_TOKEN,
    process.env.CRON_PROCESS_EXPIRY_TOKEN,
    process.env.CRON_SECRET,
    process.env.CRON_TOKEN,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  const bearer = getBearerToken(req);
  return Boolean(bearer && expectedTokens.some((token) => token === bearer));
}

function readPositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function handleRequest(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIP(request);
  const rateLimitResult = await rateLimit(`cron:demo-refresh:${ip}`, {
    limit: 2,
    windowMs: 60 * 1000,
    message: 'Too many cron requests',
  });

  if (!rateLimitResult.success || !rateLimitResult.allowed) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  try {
    const windowDays = readPositiveInt(request.nextUrl.searchParams.get('window'), 120);
    const visitWindowDays = readPositiveInt(request.nextUrl.searchParams.get('visits'), 45);
    const result = await refreshDemoData({ windowDays, visitWindowDays });

    Logger.info('Cron: demo refresh complete', {
      windowDays,
      visitWindowDays,
      result,
    });
  } catch (error) {
    if (error instanceof DemoRefreshSeedMissingError) {
      Logger.info('Cron: demo refresh skipped', { reason: error.message });

      return NextResponse.json({
        success: true,
        skipped: true,
        reason: error.message,
        timestamp: new Date().toISOString(),
      });
    }

    const err = toError(error);
    Logger.error('Cron: demo refresh failed', { error: err.message });
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}