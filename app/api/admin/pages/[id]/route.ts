import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../../lib/auth';
import { getPageById, toSitePageDTO, trashSitePages, updateSitePage } from '../../../../../lib/sitePages';
import { recordAdminAction } from '../../../../../lib/admin-actions';
import { z } from 'zod';
import { Logger } from '../../../../../lib/logger';

const updateSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  slug: z.string().min(2).max(64).optional(),
  description: z.string().max(320).optional().nullable(),
  content: z.string().min(10).optional(),
  published: z.boolean().optional(),
  metaTitle: z.string().max(60).optional().nullable(),
  metaDescription: z.string().max(160).optional().nullable(),
  canonicalUrl: z.string().url().optional().nullable().or(z.literal('')),
  noIndex: z.boolean().optional(),
  ogTitle: z.string().max(60).optional().nullable(),
  ogDescription: z.string().max(160).optional().nullable(),
  ogImage: z.string().optional().nullable().or(z.literal('')).refine(
    (val) => !val || val === '' || z.string().url().safeParse(val).success || val.startsWith('/'),
    { message: "Must be a valid URL or relative path" }
  )
});

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const params = await context.params;
    const record = await getPageById(params.id);
    if (!record) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ page: toSitePageDTO(record) });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to read site page', {
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: 'Failed to read page' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actorId = await requireAdmin();
    const params = await context.params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message).join(', ');
      return NextResponse.json({ error: issues }, { status: 400 });
    }

    const page = await updateSitePage(params.id, parsed.data);
    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'page.update',
      targetType: 'site_page',
      details: { pageId: params.id, title: parsed.data.title },
    });
    return NextResponse.json({ page: toSitePageDTO(page) });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to update site page', {
      error: error instanceof Error ? error.message : String(error)
    });
    const message = error instanceof Error ? error.message : 'Failed to update page';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actorId = await requireAdmin();
    const params = await context.params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message).join(', ');
      return NextResponse.json({ error: issues }, { status: 400 });
    }

    const page = await updateSitePage(params.id, parsed.data);
    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'page.update',
      targetType: 'site_page',
      details: { pageId: params.id, title: parsed.data.title },
    });
    return NextResponse.json({ page: toSitePageDTO(page) });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to patch site page', {
      error: error instanceof Error ? error.message : String(error)
    });
    const message = error instanceof Error ? error.message : 'Failed to update page';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actorId = await requireAdmin();
    const params = await context.params;
    const count = await trashSitePages([params.id]);
    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'page.trash',
      targetType: 'site_page',
      details: { pageId: params.id },
    });
    return NextResponse.json({ trashed: count });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to delete site page', {
      error: error instanceof Error ? error.message : String(error)
    });
    const message = error instanceof Error ? error.message : 'Failed to delete page';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
