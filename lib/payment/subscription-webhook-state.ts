export function isProviderSubscriptionActiveStatus(status: string): boolean {
    return status === 'active' || status === 'trialing';
}

export function normalizeWebhookSubscriptionStatus(status: string): 'ACTIVE' | 'CANCELLED' | 'PAST_DUE' | 'PENDING' {
    return isProviderSubscriptionActiveStatus(status)
        ? 'ACTIVE'
        : status === 'canceled'
            ? 'CANCELLED'
            : status === 'past_due' || status === 'unpaid'
                ? 'PAST_DUE'
                : 'PENDING';
}

export function deriveSubscriptionWebhookState(params: {
    status: string;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: Date | null;
    dbStatus: string;
    dbProrationPendingSince?: Date | null;
    dbCanceledAt: Date | null;
    dbExpiresAt: Date;
    providerKey: string;
}): {
    normalizedStatus: 'ACTIVE' | 'CANCELLED' | 'PAST_DUE' | 'PENDING';
    effectiveStatus: string;
    effectiveExpiresAt: Date;
    nextCancelAtPeriodEnd: boolean;
    nextCanceledAt: Date | null;
    isLocallyCancelled: boolean;
} {
    const normalizedStatus = normalizeWebhookSubscriptionStatus(params.status);

    const nextCancelAtPeriodEnd = params.cancelAtPeriodEnd === true;
    const nextCanceledAt = normalizedStatus === 'CANCELLED'
        ? (params.canceledAt ?? params.dbCanceledAt ?? new Date())
        : nextCancelAtPeriodEnd
            ? (params.canceledAt ?? params.dbCanceledAt ?? params.currentPeriodEnd)
            : (params.canceledAt ?? null);

    const isLocallyCancelled = params.dbStatus === 'CANCELLED';
    const isPaystackProvisionallyPending = params.providerKey === 'paystack'
        && params.dbStatus === 'PENDING'
        && params.dbProrationPendingSince instanceof Date
        && normalizedStatus === 'ACTIVE';
    const effectiveStatus = isLocallyCancelled && normalizedStatus === 'ACTIVE'
        ? params.dbStatus
        : isPaystackProvisionallyPending
            ? 'PENDING'
            : normalizedStatus;

    const nowTs = Date.now();
    const shouldPreserveExistingPaystackExpiry = params.providerKey === 'paystack'
        && normalizedStatus === 'ACTIVE'
        && params.currentPeriodEnd.getTime() <= nowTs
        && params.dbExpiresAt.getTime() > nowTs;

    const effectiveExpiresAt = shouldPreserveExistingPaystackExpiry
        ? params.dbExpiresAt
        : (isLocallyCancelled && normalizedStatus === 'ACTIVE'
            ? params.dbExpiresAt
            : (normalizedStatus === 'CANCELLED' && !nextCancelAtPeriodEnd)
                ? (nextCanceledAt ?? new Date())
                : params.currentPeriodEnd);

    return {
        normalizedStatus,
        effectiveStatus,
        effectiveExpiresAt,
        nextCancelAtPeriodEnd,
        nextCanceledAt,
        isLocallyCancelled,
    };
}

export async function resolveNextPlanIdForSubscriptionUpdate(params: {
    isLocallyCancelled: boolean;
    normalizedStatus: 'ACTIVE' | 'CANCELLED' | 'PAST_DUE' | 'PENDING';
    priceId?: string | null;
    metadataPlanId?: string | null;
    currentPlanId: string;
    providerKey: string;
    scheduledPlanId?: string | null;
    scheduledPlanDate?: Date | null;
    findPlanByPriceIdentifier: (priceId: string, metadataPlanId?: string | null) => Promise<{ id: string } | null>;
    onUnknownPriceId?: (priceId: string) => void;
}): Promise<string | null> {
    if (params.isLocallyCancelled && params.normalizedStatus === 'ACTIVE') {
        return null;
    }

    const priceId = params.priceId;
    if (typeof priceId !== 'string' || priceId.length === 0) {
        return null;
    }

    const nextPlan = await params.findPlanByPriceIdentifier(priceId, params.metadataPlanId);
    if (!nextPlan) {
        params.onUnknownPriceId?.(priceId);
        return null;
    }

    // Paddle scheduled plan changes (bill next cycle) update the subscription items/price immediately.
    // Preserve the current plan locally until the scheduled effective date so the app can show
    // "current plan" + "scheduled plan" accurately.
    if (
        params.providerKey === 'paddle'
        && typeof params.scheduledPlanId === 'string'
        && params.scheduledPlanId.length > 0
        && params.scheduledPlanDate instanceof Date
        && Number.isFinite(params.scheduledPlanDate.getTime())
        && params.scheduledPlanDate.getTime() > Date.now()
        && nextPlan.id === params.scheduledPlanId
    ) {
        return null;
    }

    if (nextPlan.id === params.currentPlanId) {
        return null;
    }

    return nextPlan.id;
}

export function shouldApplySubscriptionWebhookUpdate(params: {
    currentStatus: string;
    effectiveStatus: string;
    currentExpiresAt: Date;
    effectiveExpiresAt: Date;
    currentCancelAtPeriodEnd: boolean;
    nextCancelAtPeriodEnd: boolean;
    currentCanceledAt: Date | null;
    nextCanceledAt: Date | null;
    currentPlanId: string;
    nextPlanId: string | null;
}): boolean {
    return (
        params.currentStatus !== params.effectiveStatus
        || params.currentExpiresAt.getTime() !== params.effectiveExpiresAt.getTime()
        || params.currentCancelAtPeriodEnd !== params.nextCancelAtPeriodEnd
        || (params.currentCanceledAt?.getTime() ?? 0) !== (params.nextCanceledAt?.getTime() ?? 0)
        || (params.nextPlanId != null && params.nextPlanId !== params.currentPlanId)
    );
}

export async function resolveSubscriptionWebhookMutationPlan(params: {
    dbSub: {
        status: string;
        prorationPendingSince?: Date | null;
        canceledAt: Date | null;
        expiresAt: Date;
        cancelAtPeriodEnd: boolean;
        planId: string;
        scheduledPlanId?: string | null;
        scheduledPlanDate?: Date | null;
    };
    status: string;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: Date | null;
    priceId?: string | null;
    metadataPlanId?: string | null;
    providerKey: string;
    findPlanByPriceIdentifier: (priceId: string, metadataPlanId?: string | null) => Promise<{ id: string } | null>;
    onUnknownPriceId?: (priceId: string) => void;
}): Promise<{
    normalizedStatus: 'ACTIVE' | 'CANCELLED' | 'PAST_DUE' | 'PENDING';
    effectiveStatus: string;
    effectiveExpiresAt: Date;
    nextCancelAtPeriodEnd: boolean;
    nextCanceledAt: Date | null;
    isLocallyCancelled: boolean;
    nextPlanId: string | null;
    shouldApply: boolean;
}> {
    const {
        normalizedStatus,
        effectiveStatus,
        effectiveExpiresAt,
        nextCancelAtPeriodEnd,
        nextCanceledAt,
        isLocallyCancelled,
    } = deriveSubscriptionWebhookState({
        status: params.status,
        currentPeriodEnd: params.currentPeriodEnd,
        cancelAtPeriodEnd: params.cancelAtPeriodEnd,
        canceledAt: params.canceledAt,
        dbStatus: params.dbSub.status,
        dbProrationPendingSince: params.dbSub.prorationPendingSince,
        dbCanceledAt: params.dbSub.canceledAt,
        dbExpiresAt: params.dbSub.expiresAt,
        providerKey: params.providerKey,
    });

    const nextPlanId = await resolveNextPlanIdForSubscriptionUpdate({
        isLocallyCancelled,
        normalizedStatus,
        priceId: params.priceId,
        metadataPlanId: params.metadataPlanId,
        currentPlanId: params.dbSub.planId,
        providerKey: params.providerKey,
        scheduledPlanId: params.dbSub.scheduledPlanId ?? null,
        scheduledPlanDate: params.dbSub.scheduledPlanDate ?? null,
        findPlanByPriceIdentifier: params.findPlanByPriceIdentifier,
        onUnknownPriceId: params.onUnknownPriceId,
    });

    const shouldApply = shouldApplySubscriptionWebhookUpdate({
        currentStatus: params.dbSub.status,
        effectiveStatus,
        currentExpiresAt: params.dbSub.expiresAt,
        effectiveExpiresAt,
        currentCancelAtPeriodEnd: params.dbSub.cancelAtPeriodEnd,
        nextCancelAtPeriodEnd,
        currentCanceledAt: params.dbSub.canceledAt,
        nextCanceledAt,
        currentPlanId: params.dbSub.planId,
        nextPlanId,
    });

    return {
        normalizedStatus,
        effectiveStatus,
        effectiveExpiresAt,
        nextCancelAtPeriodEnd,
        nextCanceledAt,
        isLocallyCancelled,
        nextPlanId,
        shouldApply,
    };
}