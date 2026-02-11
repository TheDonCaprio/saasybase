import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { paymentService } from '@/lib/payment/service';
import { asRecord, toError } from '@/lib/runtime-guards';
import { Logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json() as unknown;
    const b = asRecord(body) || {};
    const priceId = typeof b.priceId === 'string' ? b.priceId : undefined;
    if (!priceId || typeof priceId !== 'string') {
      return NextResponse.json({ error: 'Missing priceId' }, { status: 400 });
    }

    try {
      const price = await paymentService.provider.verifyPrice(priceId);
      // Return a compact, safe subset of the price info useful to admins
      return NextResponse.json({
        id: price.id,
        unit_amount: price.unitAmount,
        currency: price.currency,
        recurring: price.recurring,
        product: price.productId,
        type: price.type,
      });
    } catch (e: unknown) {
      const err = toError(e);
      Logger.error('Price verification failed', { error: err.message, stack: err.stack });
      return NextResponse.json({ error: err.message || 'Failed to verify price' }, { status: 400 });
    }
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.warn('Verify price error', { error: err.message });
    return NextResponse.json({ error: 'Failed to verify price' }, { status: 500 });
  }
}
