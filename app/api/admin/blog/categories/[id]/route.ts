import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../../../lib/auth';
import { Logger } from '../../../../../../lib/logger';
import { deleteBlogCategory, updateBlogCategory } from '../../../../../../lib/blog';

const updateSchema = z.object({
  title: z.string().min(2).max(80).optional(),
  slug: z.string().min(2).max(64).optional(),
  description: z.string().max(280).optional().nullable()
});

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrModerator('blog');
    const params = await context.params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message).join(', ');
      return NextResponse.json({ error: issues }, { status: 400 });
    }

    const category = await updateBlogCategory(params.id, parsed.data);
    return NextResponse.json({ category });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to update blog category', {
      error: error instanceof Error ? error.message : String(error)
    });
    const message = error instanceof Error ? error.message : 'Failed to update category';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrModerator('blog');
    const params = await context.params;
    await deleteBlogCategory(params.id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to delete blog category', {
      error: error instanceof Error ? error.message : String(error)
    });
    const message = error instanceof Error ? error.message : 'Failed to delete category';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
