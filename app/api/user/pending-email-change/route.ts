import { NextResponse } from 'next/server';
import { getAuthSafe } from '@/lib/auth';
import { cancelPendingEmailChangeForActiveProvider, supportsManagedPendingEmailChange } from '@/lib/pending-email-change';
import { Logger } from '@/lib/logger';

export async function DELETE() {
  try {
    if (!supportsManagedPendingEmailChange()) {
      return NextResponse.json({ error: 'Not supported for the active auth provider.' }, { status: 400 });
    }

    const { userId } = await getAuthSafe();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await cancelPendingEmailChangeForActiveProvider(userId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    Logger.error('Cancel pending email change failed', error);
    return NextResponse.json({ error: 'Failed to cancel pending email change.' }, { status: 500 });
  }
}