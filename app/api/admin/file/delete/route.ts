import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { recordAdminAction } from '@/lib/admin-actions';
import { deleteAdminFile } from '@/lib/logoStorage';
import { Logger } from '@/lib/logger';

export async function DELETE(request: NextRequest) {
  try {
    const actorId = await requireAdmin();

    let keyFromBody: string | null = null;
    try {
      const body = await request.json();
      if (body && typeof body === 'object' && typeof (body as { key?: unknown }).key === 'string') {
        keyFromBody = (body as { key: string }).key;
      }
    } catch {
      // Ignore JSON parsing errors – fallback to search params below.
    }

    const key = keyFromBody ?? request.nextUrl.searchParams.get('key');
    if (!key) {
      return NextResponse.json({ error: 'Missing file key' }, { status: 400 });
    }

    await deleteAdminFile({ key });
    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'file.delete',
      targetType: 'file',
      details: { key },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const guardResponse = toAuthGuardErrorResponse(error);
    if (guardResponse) {
      return guardResponse;
    }

    Logger.error('File delete error', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
