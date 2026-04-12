import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAdminOrModeratorMock = vi.hoisted(() =>
  vi.fn(async () => ({ userId: 'admin_1', role: 'ADMIN', permissions: {} }))
);
const toAuthGuardErrorResponseMock = vi.hoisted(() => vi.fn(() => null));
const recordAdminActionMock = vi.hoisted(() => vi.fn(async () => undefined));
const listBlogCategoriesMock = vi.hoisted(() => vi.fn());
const createBlogCategoryMock = vi.hoisted(() => vi.fn());
const updateBlogCategoryMock = vi.hoisted(() => vi.fn());
const deleteBlogCategoryMock = vi.hoisted(() => vi.fn());

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
  listBlogCategories: listBlogCategoriesMock,
  createBlogCategory: createBlogCategoryMock,
  updateBlogCategory: updateBlogCategoryMock,
  deleteBlogCategory: deleteBlogCategoryMock,
}));

import { GET, POST } from '../app/api/admin/blog/categories/route';
import { PATCH, DELETE } from '../app/api/admin/blog/categories/[id]/route';

describe('admin blog category routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminOrModeratorMock.mockResolvedValue({ userId: 'admin_1', role: 'ADMIN', permissions: {} });
    toAuthGuardErrorResponseMock.mockReturnValue(null);
    listBlogCategoriesMock.mockResolvedValue([
      { id: 'cat_1', title: 'Changelog', slug: 'changelog', description: null, postCount: 3 },
    ]);
    createBlogCategoryMock.mockImplementation(async (payload) => ({ id: 'cat_2', postCount: 0, ...payload }));
    updateBlogCategoryMock.mockImplementation(async (id, payload) => ({ id, postCount: 1, ...payload }));
    deleteBlogCategoryMock.mockResolvedValue(undefined);
  });

  it('lists blog categories', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.categories).toEqual([
      expect.objectContaining({ id: 'cat_1', slug: 'changelog' }),
    ]);
    expect(listBlogCategoriesMock).toHaveBeenCalledOnce();
  });

  it('creates a blog category', async () => {
    const request = new NextRequest('http://localhost/api/admin/blog/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Guides',
        slug: 'guides',
        description: 'Long-form tutorials',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(createBlogCategoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Guides',
        slug: 'guides',
      })
    );
    expect(body.category).toEqual(expect.objectContaining({ id: 'cat_2', title: 'Guides' }));
    expect(recordAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'blog_category.create',
        details: expect.objectContaining({ title: 'Guides' }),
      })
    );
  });

  it('updates a blog category', async () => {
    const request = new NextRequest('http://localhost/api/admin/blog/categories/cat_2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Product guides',
        description: 'Updated category description',
      }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'cat_2' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateBlogCategoryMock).toHaveBeenCalledWith(
      'cat_2',
      expect.objectContaining({
        title: 'Product guides',
      })
    );
    expect(body.category).toEqual(expect.objectContaining({ id: 'cat_2', title: 'Product guides' }));
    expect(recordAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'blog_category.update',
        details: expect.objectContaining({ categoryId: 'cat_2' }),
      })
    );
  });

  it('deletes a blog category', async () => {
    const response = await DELETE(new NextRequest('http://localhost/api/admin/blog/categories/cat_2', {
      method: 'DELETE',
    }), { params: Promise.resolve({ id: 'cat_2' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(deleteBlogCategoryMock).toHaveBeenCalledWith('cat_2');
    expect(recordAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'blog_category.delete',
        details: expect.objectContaining({ categoryId: 'cat_2' }),
      })
    );
  });
});