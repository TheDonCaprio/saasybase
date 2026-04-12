import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAdminOrModeratorMock = vi.hoisted(() =>
  vi.fn(async () => ({ userId: 'admin_1', role: 'ADMIN', permissions: {} }))
);
const toAuthGuardErrorResponseMock = vi.hoisted(() => vi.fn(() => null));
const recordAdminActionMock = vi.hoisted(() => vi.fn(async () => undefined));
const createBlogPostMock = vi.hoisted(() => vi.fn());
const updateBlogPostMock = vi.hoisted(() => vi.fn());
const toBlogPostDTOMock = vi.hoisted(() => vi.fn((post) => post));

vi.mock('../lib/auth', () => ({
  requireAdminOrModerator: requireAdminOrModeratorMock,
  toAuthGuardErrorResponse: toAuthGuardErrorResponseMock,
}));

vi.mock('../lib/admin-actions', () => ({
  recordAdminAction: recordAdminActionMock,
}));

vi.mock('../lib/logger', () => ({
  Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../lib/blog', () => ({
  createBlogPost: createBlogPostMock,
  updateBlogPost: updateBlogPostMock,
  toBlogPostDTO: toBlogPostDTOMock,
  listBlogPostsPaginated: vi.fn(),
  getBlogPostById: vi.fn(),
  trashBlogPosts: vi.fn(),
}));

import { POST } from '../app/api/admin/blog/route';
import { PATCH } from '../app/api/admin/blog/[id]/route';

describe('admin blog publishing routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminOrModeratorMock.mockResolvedValue({ userId: 'admin_1', role: 'ADMIN', permissions: {} });
    toAuthGuardErrorResponseMock.mockReturnValue(null);
    createBlogPostMock.mockImplementation(async (payload) => ({ id: 'post_1', ...payload }));
    updateBlogPostMock.mockImplementation(async (id, payload) => ({ id, ...payload }));
  });

  it('creates a published blog post with categories', async () => {
    const request = new NextRequest('http://localhost/api/admin/blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Spring release',
        slug: 'spring-release',
        description: 'Release notes for spring.',
        content: '<p>This release ships new billing flows.</p>',
        published: true,
        categoryIds: ['cat_1', 'cat_2'],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(createBlogPostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        published: true,
        categoryIds: ['cat_1', 'cat_2'],
      })
    );
    expect(body.page).toEqual(
      expect.objectContaining({
        id: 'post_1',
        published: true,
      })
    );
    expect(recordAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'blog.create',
        details: expect.objectContaining({ title: 'Spring release' }),
      })
    );
  });

  it('publishes an existing blog post via patch', async () => {
    const request = new NextRequest('http://localhost/api/admin/blog/post_1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        published: true,
        categoryIds: ['cat_3'],
        content: '<p>Updated post body for publication.</p>',
      }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'post_1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateBlogPostMock).toHaveBeenCalledWith(
      'post_1',
      expect.objectContaining({
        published: true,
        categoryIds: ['cat_3'],
      })
    );
    expect(body.page).toEqual(
      expect.objectContaining({
        id: 'post_1',
        published: true,
      })
    );
    expect(recordAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'blog.update',
        details: expect.objectContaining({ postId: 'post_1' }),
      })
    );
  });
});