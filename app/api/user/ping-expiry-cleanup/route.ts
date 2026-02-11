import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/auth';
import { Logger } from '../../../../lib/logger';
import { maybeClearPaidTokensAfterNaturalExpiryGrace } from '../../../../lib/paidTokenCleanup';
import { toError } from '../../../../lib/runtime-guards';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const userId = await requireUser();

    const res = await maybeClearPaidTokensAfterNaturalExpiryGrace({ userId });

    return NextResponse.json({ ok: true, ...res });
  } catch (error) {
    const err = toError(error);
    // Treat failures as non-fatal; client pings should not disrupt UX.
    Logger.warn('Lazy Check: Failed to run expiry cleanup ping', { error: err.message });
    return NextResponse.json({ ok: false, error: err.message });
  }
}
