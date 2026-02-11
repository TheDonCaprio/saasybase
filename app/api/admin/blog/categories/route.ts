import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../../lib/auth';
import { Logger } from '../../../../../lib/logger';
import { createBlogCategory, listBlogCategories } from '../../../../../lib/blog';

const createSchema = z.object({
  title: z.string().min(2, 'Title must be at least two characters').max(80, 'Title is too long'),
  slug: z.string().min(2).max(64).optional(),
  description: z.string().max(280, 'Description is too long').optional().nullable()
});

export async function GET() {
  try {
    await requireAdminOrModerator('blog');
    const categories = await listBlogCategories();
    return NextResponse.json({ categories });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to list blog categories', {
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: 'Failed to list categories' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminOrModerator('blog');
    const payload = await req.json();
    const parsed = createSchema.safeParse(payload);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message).join(', ');
      return NextResponse.json({ error: issues }, { status: 400 });
    }

    const category = await createBlogCategory(parsed.data);
    return NextResponse.json({ category }, { status: 201 });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to create blog category', {
      error: error instanceof Error ? error.message : String(error)
    });
    const message = error instanceof Error ? error.message : 'Failed to create category';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
