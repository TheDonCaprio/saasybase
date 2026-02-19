type RefreshExpirySubscriptionShape = {
    id: string;
    status: string;
    expiresAt: Date;
};

export async function refreshInvoicePaymentSubscriptionExpiry<TSub extends RefreshExpirySubscriptionShape>(params: {
    dbSub: TSub;
    subscriptionId: string;
    refreshSubscriptionExpiryFromProvider: (opts: {
        dbSubscriptionId: string;
        providerSubscriptionId: string;
        wasLocallyExpired: boolean;
        resurrectOnlyIfFuture: boolean;
        warnMessage: string;
    }) => Promise<{ refreshedPeriodEnd: Date | null; resurrected: boolean }>;
}): Promise<{ dbSub: TSub; refreshedExpiresAt: Date | null }> {
    let refreshedExpiresAt: Date | null = params.dbSub.expiresAt ?? null;

    const refreshed = await params.refreshSubscriptionExpiryFromProvider({
        dbSubscriptionId: params.dbSub.id,
        providerSubscriptionId: params.subscriptionId,
        wasLocallyExpired: params.dbSub.status === 'EXPIRED',
        resurrectOnlyIfFuture: true,
        warnMessage: 'Unable to refresh subscription expiry before renewal notification',
    });

    if (!refreshed.refreshedPeriodEnd) {
        return { dbSub: params.dbSub, refreshedExpiresAt };
    }

    refreshedExpiresAt = refreshed.refreshedPeriodEnd;
    const nextDbSub = {
        ...params.dbSub,
        expiresAt: refreshed.refreshedPeriodEnd,
        ...(refreshed.resurrected ? { status: 'ACTIVE' } : null),
    } as TSub;

    return { dbSub: nextDbSub, refreshedExpiresAt };
}