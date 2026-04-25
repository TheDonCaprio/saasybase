import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../lib/auth';
import { Logger } from '../../../../lib/logger';
import { toError } from '../../../../lib/runtime-guards';
import {
  captureSentryException,
  captureSentryMessage,
  flushSentry,
  isSentryRuntimeEnabled,
  shouldForwardLoggerEventsToSentry,
} from '../../../../lib/sentry';

export const dynamic = 'force-dynamic';

type SentryTestRequest = {
  level?: 'warning' | 'error';
};

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAdmin();

    if (!isSentryRuntimeEnabled('server')) {
      return NextResponse.json(
        {
          error: 'Server-side Sentry is not enabled. Set SENTRY_ENABLED=true and SENTRY_DSN to use the server smoke test.',
        },
        { status: 409 }
      );
    }

    if (!shouldForwardLoggerEventsToSentry()) {
      return NextResponse.json(
        {
          error: 'Logger fan-out to Sentry is disabled in this environment. Set SENTRY_CAPTURE_IN_DEVELOPMENT=true or run in production to use the server smoke test.',
        },
        { status: 409 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as SentryTestRequest;
    const level = body.level === 'warning' ? 'warning' : 'error';
    const timestamp = new Date().toISOString();
    let eventId: string | undefined;

    if (level === 'warning') {
      Logger.warn('Sentry smoke test warning', {
        source: 'admin-settings',
        triggeredAt: timestamp,
        triggeredBy: userId,
      });

      eventId = await captureSentryMessage('Sentry smoke test warning', 'warning', {
        tags: {
          source: 'admin-settings',
          surface: 'server-smoke-test',
        },
        extras: {
          triggeredAt: timestamp,
          triggeredBy: userId,
        },
      });
    } else {
      Logger.error(
        'Sentry smoke test error',
        new Error(`Sentry smoke test error at ${timestamp}`),
        {
          source: 'admin-settings',
          triggeredBy: userId,
        }
      );

      eventId = await captureSentryException(new Error(`Sentry smoke test error at ${timestamp}`), {
        tags: {
          source: 'admin-settings',
          surface: 'server-smoke-test',
        },
        extras: {
          triggeredBy: userId,
          triggeredAt: timestamp,
        },
      });
    }

    const flushed = await flushSentry(3000);

    return NextResponse.json({
      ok: true,
      level,
      eventId,
      flushed,
      message: eventId
        ? `Sent ${level} smoke test to Sentry${flushed ? '' : ' (flush pending)'}. Event ID: ${eventId}`
        : `Queued ${level} smoke test via the server logger.`,
    });
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Sentry test API error', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Failed to queue Sentry smoke test' }, { status: 500 });
  }
}