import { prisma } from '../prisma';
import { Logger } from '../logger';
import { markRedemptionConsumed } from '../couponRedemptions';
import { toError } from '../runtime-guards';

export async function consumeCouponRedemptionFromMetadata(metadata?: Record<string, unknown> | null): Promise<void> {
    const redemptionId = metadata && typeof metadata['couponRedemptionId'] === 'string' ? metadata['couponRedemptionId'] : undefined;
    if (!redemptionId) return;

    try {
        const redemption = await prisma.couponRedemption.findUnique({ where: { id: redemptionId } });
        if (!redemption) return;

        await markRedemptionConsumed(redemption);
        Logger.info('Coupon redemption consumed after checkout', { redemptionId, couponId: redemption.couponId });
    } catch (err) {
        Logger.warn('Failed to consume coupon redemption', { redemptionId, error: toError(err).message });
    }
}