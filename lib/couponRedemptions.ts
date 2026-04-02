import type { CouponRedemption } from '@/lib/prisma-client';
import { prisma } from './prisma';
import { Logger } from './logger';
import { toError } from './runtime-guards';

export async function markRedemptionConsumed(redemption: CouponRedemption, tx = prisma) {
  if (redemption.consumedAt) return redemption;
  const now = new Date();
  try {
    return await tx.$transaction(async (client) => {
      await client.coupon.update({
        where: { id: redemption.couponId },
        data: { redemptionCount: { increment: 1 } },
      });
      return client.couponRedemption.update({
        where: { id: redemption.id },
        data: { consumedAt: now },
      });
    });
  } catch (err: unknown) {
    const e = toError(err);
    Logger.error('Failed to mark coupon redemption consumed', { redemptionId: redemption.id, error: e.message });
    throw err;
  }
}

export async function getPendingRedemptionCount(couponId: string): Promise<number> {
  return prisma.couponRedemption.count({
    where: { couponId, consumedAt: null },
  });
}
