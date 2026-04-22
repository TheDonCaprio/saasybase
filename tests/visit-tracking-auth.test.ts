import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const executeRawMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $executeRaw: executeRawMock,
  },
}));

vi.mock('@/lib/logger', () => ({
  Logger: {
    warn: loggerWarnMock,
    error: vi.fn(),
  },
}));

import { POST } from '../app/api/internal/track-visit/route';
import { trackVisit } from '../lib/visit-tracking';

describe('visit tracking internal auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_TOKEN = 'visit_test_token';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  });

  it('rejects the legacy X-Internal-API header without a bearer token', async () => {
    const req = new NextRequest('http://localhost/api/internal/track-visit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Internal-API': 'true' },
      body: JSON.stringify({ sessionId: 'session_1', ip: '127.0.0.1', userAgent: 'Mozilla', country: 'US', referrer: 'direct', path: '/' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('accepts a matching bearer token', async () => {
    executeRawMock.mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost/api/internal/track-visit', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer visit_test_token',
      },
      body: JSON.stringify({ sessionId: 'session_1', ip: '127.0.0.1', userAgent: 'Mozilla', country: 'US', referrer: 'direct', path: '/' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(executeRawMock).toHaveBeenCalled();
  });

  it('fails cleanly when the VisitLog table is missing instead of creating schema at request time', async () => {
    const missingTableError = new Error('no such table: VisitLog');
    executeRawMock.mockRejectedValueOnce(missingTableError);

    const req = new NextRequest('http://localhost/api/internal/track-visit', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer visit_test_token',
      },
      body: JSON.stringify({ sessionId: 'session_1', ip: '127.0.0.1', userAgent: 'Mozilla', country: 'US', referrer: 'direct', path: '/' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ success: false });
    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });

  it('sends bearer auth from the visit-tracking client helper', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/pricing', {
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0',
      },
    });

    await trackVisit(req, 'session_1');
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/internal/track-visit',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer visit_test_token',
        }),
      })
    );

    vi.unstubAllGlobals();
  });
});