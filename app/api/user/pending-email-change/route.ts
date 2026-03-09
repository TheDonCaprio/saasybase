import { NextResponse } from 'next/server';
import { getAuthSafe } from '@/lib/auth';
import { cancelPendingEmailChange } from '@/lib/nextauth-email-verification';
import { authService } from '@/lib/auth-provider';

export async function DELETE() {
  try {
    if (authService.providerName !== 'nextauth') {
      return NextResponse.json({ error: 'Not supported for the active auth provider.' }, { status: 400 });
    }

    const { userId } = await getAuthSafe();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await cancelPendingEmailChange(userId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Cancel pending email change failed:', error);
    return NextResponse.json({ error: 'Failed to cancel pending email change.' }, { status: 500 });
  }
}