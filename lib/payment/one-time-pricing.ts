import type { Plan } from '@/lib/prisma-client';
import type { StandardizedCheckoutSession } from './types';

export function resolveOneTimeCheckoutPricing(params: {
    session: StandardizedCheckoutSession;
    planToUse: Plan;
}): {
    resolvedAmountCents: number;
    resolvedSubtotalCents: number;
    resolvedDiscountCents: number;
    couponCode: string | null;
} {
    const sessionSubtotalCents = params.session.amountSubtotal;
    const sessionTotalCents = params.session.amountTotal;

    const inAppDiscountCents = params.session.metadata?.inAppDiscountCents
        ? parseInt(params.session.metadata.inAppDiscountCents, 10)
        : 0;
    const originalPriceCents = params.session.metadata?.originalPriceCents
        ? parseInt(params.session.metadata.originalPriceCents, 10)
        : null;

    const sessionDiscountCents = params.session.amountTotal && params.session.amountSubtotal
        ? params.session.amountSubtotal - params.session.amountTotal
        : inAppDiscountCents;

    const resolvedAmountCents = sessionTotalCents ?? params.planToUse.priceCents;
    const resolvedSubtotalCents = originalPriceCents
        ?? sessionSubtotalCents
        ?? (sessionDiscountCents != null ? resolvedAmountCents + sessionDiscountCents : undefined)
        ?? params.planToUse.priceCents;
    const resolvedDiscountCents = inAppDiscountCents > 0
        ? inAppDiscountCents
        : (sessionDiscountCents ?? (resolvedSubtotalCents != null ? Math.max(0, resolvedSubtotalCents - resolvedAmountCents) : undefined));

    return {
        resolvedAmountCents,
        resolvedSubtotalCents,
        resolvedDiscountCents,
        couponCode: params.session.metadata?.couponCode ?? null,
    };
}