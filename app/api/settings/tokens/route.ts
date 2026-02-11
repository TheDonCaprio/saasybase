import { NextResponse } from 'next/server';
import { shouldResetPaidTokensOnRenewalForPlanAutoRenew } from '@/lib/settings';

export async function GET() {
  try {
    const oneTimeRenewalResetsTokens = await shouldResetPaidTokensOnRenewalForPlanAutoRenew(false);
    return NextResponse.json({ ok: true, oneTimeRenewalResetsTokens });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to load token settings' }, { status: 500 });
  }
}
