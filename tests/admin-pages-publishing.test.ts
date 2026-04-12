import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAdminMock = vi.hoisted(() => vi.fn(async () => 'admin_1'));
const toAuthGuardErrorResponseMock = vi.hoisted(() => vi.fn(() => null));
const recordAdminActionMock = vi.hoisted(() => vi.fn(async () => undefined));
const createSitePageMock = vi.hoisted(() => vi.fn());
const updateSitePageMock = vi.hoisted(() => vi.fn());
const toSitePageDTOMock = vi.hoisted(() => vi.fn((page) => page));

vi.mock('../lib/auth', () => ({
  requireAdmin: requireAdminMock,
  toAuthGuardErrorResponse: toAuthGuardErrorResponseMock,
}));

vi.mock('../lib/admin-actions', () => ({
  recordAdminAction: recordAdminActionMock,
}));

vi.mock('../lib/logger', () => ({
  Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../lib/sitePages', () => ({
  createSitePage: createSitePageMock,
  updateSitePage: updateSitePageMock,
  toSitePageDTO: toSitePageDTOMock,
  listSitePagesPaginated: vi.fn(),
  getPageById: vi.fn(),
  trashSitePages: vi.fn(),
}));

import { POST } from '../app/api/admin/pages/route';
import { PATCH } from '../app/api/admin/pages/[id]/route';

describe('admin site page publishing routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue('admin_1');
    toAuthGuardErrorResponseMock.mockReturnValue(null);
    createSitePageMock.mockImplementation(async (payload) => ({ id: 'page_1', ...payload }));
    updateSitePageMock.mockImplementation(async (id, payload) => ({ id, ...payload }));
  });

  it('creates a published site page', async () => {
    const request = new NextRequest('http://localhost/api/admin/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'About us',
        slug: 'about-us',
        description: 'About page copy.',
        content: '<p>Our company story and mission.</p>',
        published: true,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(createSitePageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        published: true,
      })
    );
    expect(body.page).toEqual(
      expect.objectContaining({
        id: 'page_1',
        published: true,
      })
    );
    expect(recordAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'page.create',
        details: expect.objectContaining({ title: 'About us' }),
      })
    );
  });

  it('publishes an existing site page via patch', async () => {
    const request = new NextRequest('http://localhost/api/admin/pages/page_1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        published: true,
        content: '<p>Refreshed company story for publication.</p>',
      }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'page_1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateSitePageMock).toHaveBeenCalledWith(
      'page_1',
      expect.objectContaining({
        published: true,
      })
    );
    expect(body.page).toEqual(
      expect.objectContaining({
        id: 'page_1',
        published: true,
      })
    );
    expect(recordAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'page.update',
        details: expect.objectContaining({ pageId: 'page_1' }),
      })
    );
  });
});