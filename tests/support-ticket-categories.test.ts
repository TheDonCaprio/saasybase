import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAdminOrModeratorMock = vi.hoisted(() => vi.fn(async () => ({ userId: 'admin_1', role: 'ADMIN', permissions: {} })));
const toAuthGuardErrorResponseMock = vi.hoisted(() => vi.fn(() => null));
const recordAdminActionMock = vi.hoisted(() => vi.fn(async () => undefined));
const prismaMock = vi.hoisted(() => ({
  supportTicket: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}));

vi.mock('../lib/auth', () => ({
  requireAdminOrModerator: requireAdminOrModeratorMock,
  toAuthGuardErrorResponse: toAuthGuardErrorResponseMock,
}));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/admin-actions', () => ({ recordAdminAction: recordAdminActionMock }));
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

import { GET, POST } from '../app/api/admin/support/tickets/route';

describe('admin support ticket category handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.supportTicket.findMany.mockResolvedValue([]);
    prismaMock.supportTicket.count.mockResolvedValue(0);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user_1' });
    prismaMock.supportTicket.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'ticket_1',
      ...data,
    }));
  });

  it('filters admin ticket queries by category when provided', async () => {
    const response = await GET(new NextRequest('http://localhost/api/admin/support/tickets?category=BILLING&count=false'));

    expect(response.status).toBe(200);
    expect(prismaMock.supportTicket.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: 'BILLING',
        }),
      })
    );
  });

  it('stores an explicit category on admin-created tickets', async () => {
    const request = new NextRequest('http://localhost/api/admin/support/tickets', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'user_1',
        subject: 'Need billing help',
        message: 'Please review this invoice.',
        category: 'BILLING',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: 'BILLING',
        }),
      })
    );
    expect(body.ticket.category).toBe('BILLING');
    expect(recordAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          category: 'BILLING',
        }),
      })
    );
  });

  it('defaults admin-created tickets to GENERAL when category is omitted', async () => {
    const request = new NextRequest('http://localhost/api/admin/support/tickets', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'user_1',
        subject: 'General question',
        message: 'I have a general question about the product.',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: 'GENERAL',
        }),
      })
    );
    expect(body.ticket.category).toBe('GENERAL');
  });
});