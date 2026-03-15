import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAdminOrModeratorMock = vi.hoisted(() => vi.fn(async () => ({ userId: 'admin_1', role: 'ADMIN', permissions: {} })));
const toAuthGuardErrorResponseMock = vi.hoisted(() => vi.fn(() => null));
const prismaMock = vi.hoisted(() => ({
  supportTicket: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock('../lib/auth', () => ({
  requireAdminOrModerator: requireAdminOrModeratorMock,
  toAuthGuardErrorResponse: toAuthGuardErrorResponseMock,
}));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/queryUtils', () => ({
  stripMode: vi.fn((value: unknown) => value),
  isPrismaModeError: vi.fn(() => false),
  buildStringContainsFilter: vi.fn((value: string) => ({ contains: value })),
  sanitizeWhereForInsensitiveSearch: vi.fn((value: unknown) => value),
}));
vi.mock('../lib/logger', () => ({ Logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../lib/runtime-guards', () => ({
  asRecord: vi.fn((value: unknown) => (typeof value === 'object' && value !== null ? value : null)),
  toError: vi.fn((error: unknown) => (error instanceof Error ? error : new Error(String(error)))),
}));

import { GET } from '../app/api/admin/support/tickets/route';

describe('GET /api/admin/support/tickets cursor pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.supportTicket.count.mockResolvedValue(4);
    prismaMock.supportTicket.findMany
      .mockResolvedValueOnce([
        { id: 'ticket_4', createdAt: new Date('2026-03-04T00:00:00.000Z') },
        { id: 'ticket_3', createdAt: new Date('2026-03-03T00:00:00.000Z') },
      ])
      .mockResolvedValueOnce([
        { id: 'ticket_2', createdAt: new Date('2026-03-02T00:00:00.000Z') },
        { id: 'ticket_1', createdAt: new Date('2026-03-01T00:00:00.000Z') },
      ]);
  });

  it('returns a nextCursor and advances without overlapping ids', async () => {
    const firstRequest = new NextRequest('http://localhost/api/admin/support/tickets?limit=2&count=false');
    const firstResponse = await GET(firstRequest);
    const firstBody = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstBody.totalCount).toBeNull();
    expect(firstBody.tickets.map((ticket: { id: string }) => ticket.id)).toEqual(['ticket_4', 'ticket_3']);
    expect(typeof firstBody.nextCursor).toBe('string');

    const secondRequest = new NextRequest(`http://localhost/api/admin/support/tickets?limit=2&count=false&cursor=${encodeURIComponent(firstBody.nextCursor)}`);
    const secondResponse = await GET(secondRequest);
    const secondBody = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(secondBody.tickets.map((ticket: { id: string }) => ticket.id)).toEqual(['ticket_2', 'ticket_1']);

    const firstIds = new Set(firstBody.tickets.map((ticket: { id: string }) => ticket.id));
    expect(secondBody.tickets.some((ticket: { id: string }) => firstIds.has(ticket.id))).toBe(false);
    expect(prismaMock.supportTicket.count).not.toHaveBeenCalled();
  });
});