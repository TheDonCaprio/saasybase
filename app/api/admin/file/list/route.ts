import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { Logger } from '@/lib/logger';
import { listAdminFiles } from '@/lib/logoStorage';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const searchParams = request.nextUrl.searchParams;
  const limitParam = parseInt(searchParams.get('limit') || '20', 10);
  const limit = Number.isFinite(limitParam) ? limitParam : 20;
  const cursor = searchParams.get('cursor');
  const search = searchParams.get('search');

  const result = await listAdminFiles({ limit, cursor, search });

    return NextResponse.json({
      files: result.files.map(({ url, filename, size, uploadedAt, key }) => ({
        url,
        filename,
        size,
        uploadedAt,
        key,
      })),
      pagination: {
        limit,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
        total: result.total,
      },
    });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;

    Logger.error('File list error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to fetch files' },
      { status: 500 },
    );
  }
}