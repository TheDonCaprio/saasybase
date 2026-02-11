import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../../lib/auth';
import { Logger } from '../../../../../lib/logger';
import { permanentlyDeleteBlogPosts, restoreBlogPosts, trashBlogPosts } from '../../../../../lib/blog';

const bulkActionSchema = z.object({
  action: z.enum(['trash', 'restore', 'delete']),
  ids: z.array(z.string().min(1)).min(1)
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const payload = await req.json();
    const parsed = bulkActionSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const { action, ids } = parsed.data;
    let affected = 0;

    switch (action) {
      case 'trash':
        affected = await trashBlogPosts(ids);
        break;
      case 'restore':
        affected = await restoreBlogPosts(ids);
        break;
      case 'delete':
        affected = await permanentlyDeleteBlogPosts(ids);
        break;
      default:
        return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }

    return NextResponse.json({ action, affected });
  } catch (error) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to process bulk blog action', {
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
