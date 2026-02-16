import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../lib/auth';
import { recordAdminAction } from '../../../../lib/admin-actions';
import { Logger } from '../../../../lib/logger';
import { z } from 'zod';
import { createBlogPost, listBlogPostsPaginated, toBlogPostDTO } from '../../../../lib/blog';

const createSchema = z.object({
  title: z.string().min(2, 'Title must be at least two characters').max(120, 'Title is too long'),
  slug: z.string().min(2, 'Slug must be at least two characters').max(64, 'Slug is too long'),
  description: z.string().max(320, 'Description too long').optional().nullable(),
  content: z.string().min(10, 'Content must be at least ten characters'),
  published: z.boolean().optional(),
  metaTitle: z.string().max(60).optional().nullable(),
  metaDescription: z.string().max(160).optional().nullable(),
  canonicalUrl: z.string().url().optional().nullable().or(z.literal('')),
  noIndex: z.boolean().optional(),
  ogTitle: z.string().max(60).optional().nullable(),
  ogDescription: z.string().max(160).optional().nullable(),
  ogImage: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(''))
    .refine((val) => !val || val === '' || z.string().url().safeParse(val).success || val.startsWith('/'), {
      message: 'Must be a valid URL or relative path'
    }),
  categoryIds: z.array(z.string().min(1)).optional()
});

export async function GET(req: NextRequest) {
  try {
    await requireAdminOrModerator('blog');
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    const rawStatus = searchParams.get('status')?.toLowerCase();
    const rawSortBy = searchParams.get('sortBy')?.toLowerCase();
    const rawSortOrder = searchParams.get('sortOrder')?.toLowerCase();
    const search = searchParams.get('search') ?? undefined;
    const countParam = searchParams.get('count');

    const page = Number.isFinite(Number(pageParam)) ? Math.max(1, Math.floor(Number(pageParam))) : 1;
    const limit = Number.isFinite(Number(limitParam)) ? Math.min(100, Math.max(1, Math.floor(Number(limitParam)))) : 20;
    const status: 'all' | 'published' | 'draft' | 'trashed' | 'system' =
      rawStatus === 'published' || rawStatus === 'draft' || rawStatus === 'trashed' || rawStatus === 'system' ? rawStatus : 'all';
    const sortBy: 'publishedAt' | 'updatedAt' | 'createdAt' =
      rawSortBy === 'updatedat' ? 'updatedAt' : rawSortBy === 'createdat' ? 'createdAt' : 'publishedAt';
    const sortOrder: 'asc' | 'desc' = rawSortOrder === 'asc' ? 'asc' : 'desc';
    const includeTotals = countParam !== 'false';

    const result = await listBlogPostsPaginated({
      page,
      limit,
      status,
      search,
      sortBy,
      sortOrder,
      includeStatusTotals: includeTotals
    });

    return NextResponse.json({
      pages: result.posts.map(toBlogPostDTO),
      totalCount: result.totalCount,
      page: result.page,
      pageSize: result.pageSize,
      publishedCount: result.overallTotals?.published,
      draftCount: result.overallTotals?.draft,
      trashedCount: result.overallTotals?.trashed,
      systemCount: result.overallTotals?.system,
      totalPageCount: result.overallTotals?.total,
      nextCursor: null
    });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to list blog posts', {
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: 'Failed to list posts' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAdminOrModerator('blog');
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message).join(', ');
      return NextResponse.json({ error: issues }, { status: 400 });
    }

    const post = await createBlogPost(parsed.data);
    await recordAdminAction({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'blog.create',
      targetType: 'blog_post',
      details: { postId: post.id, title: parsed.data.title },
    });
    return NextResponse.json({ page: toBlogPostDTO(post) }, { status: 201 });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to create blog post', {
      error: error instanceof Error ? error.message : String(error)
    });
    const message = error instanceof Error ? error.message : 'Failed to create post';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
