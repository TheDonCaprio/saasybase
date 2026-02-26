import { Logger } from '../logger';
import { toError } from '../runtime-guards';

type PaystackPostProcessSubscription = {
    id: string;
    userId: string;
    plan: {
        autoRenew: boolean;
    };
};

type SubscriptionCreatedExistingRecord = {
    id: string;
    userId: string;
    status: string;
    canceledAt: Date | null;
    expiresAt: Date;
    cancelAtPeriodEnd: boolean;
    plan: {
        autoRenew: boolean;
    };
};

export async function processSubscriptionCreatedPendingPaymentLink<TSubscription extends Pick<PaystackPostProcessSubscription, 'id' | 'userId'>>(
    params: {
        subscriptionId: string;
        dbSub: TSubscription;
        logMessage: string;
    },
    deps: {
        linkPendingPaymentToSubscription: (dbSub: TSubscription) => Promise<boolean>;
        syncOrganizationEligibilityForUser: (userId: string) => Promise<unknown>;
    }
): Promise<boolean> {
    const linked = await deps.linkPendingPaymentToSubscription(params.dbSub);
    if (linked) {
        await deps.syncOrganizationEligibilityForUser(params.dbSub.userId);
    }

    Logger.info(params.logMessage, {
        subscriptionId: params.subscriptionId,
        dbSubscriptionId: params.dbSub.id,
        userId: params.dbSub.userId,
        linked,
    });

    return linked;
}

export async function handlePaystackActiveSubscriptionPostProcessing<TSubscription extends PaystackPostProcessSubscription>(
    dbSub: TSubscription,
    source: 'subscription.created' | 'subscription.updated',
    deps: {
        cancelSupersededOneTimeSubscriptions: (userId: string, replacementSubscriptionId: string) => Promise<void>;
        linkPendingPaymentToSubscription: (dbSub: TSubscription) => Promise<boolean>;
    }
): Promise<boolean> {
    if (dbSub.plan.autoRenew === true) {
        await deps.cancelSupersededOneTimeSubscriptions(dbSub.userId, dbSub.id);
    }

    const linked = await deps.linkPendingPaymentToSubscription(dbSub);
    if (linked) {
        Logger.info(`Linked pending Paystack payment on ${source} (existing record)`, {
            dbSubscriptionId: dbSub.id,
            userId: dbSub.userId,
        });
    }

    return linked;
}

export async function processPaystackSubscriptionUpdatedPostProcessing<TSubscription extends PaystackPostProcessSubscription>(
    params: {
        effectiveStatus: string;
        providerKey: string;
        isNewlyCreated: boolean;
        subscriptionId: string;
        dbSub: TSubscription;
    },
    deps: {
        handlePaystackActiveSubscriptionPostProcessing: (dbSub: TSubscription, source: 'subscription.updated') => Promise<boolean>;
    }
): Promise<void> {
    if (!(params.effectiveStatus === 'ACTIVE' && params.providerKey === 'paystack' && !params.isNewlyCreated)) {
        return;
    }

    try {
        const linked = await deps.handlePaystackActiveSubscriptionPostProcessing(params.dbSub, 'subscription.updated');
        if (linked) {
            // already logged in helper
        }
    } catch (err) {
        Logger.warn('Failed to link pending Paystack payment on subscription.updated', {
            subscriptionId: params.subscriptionId,
            error: toError(err).message,
        });
    }
}

export async function processSubscriptionCreatedExistingRecord<TSubscription extends SubscriptionCreatedExistingRecord>(
    params: {
        subscriptionId: string;
        providerKey: string;
        dbSub: TSubscription;
        subscription: {
            status: string;
            currentPeriodEnd: Date;
            cancelAtPeriodEnd?: boolean;
            canceledAt?: Date | null;
        };
    },
    deps: {
        deriveSubscriptionWebhookState: (params: {
            status: string;
            currentPeriodEnd: Date;
            cancelAtPeriodEnd?: boolean;
            canceledAt?: Date | null;
            dbStatus: string;
            dbCanceledAt: Date | null;
            dbExpiresAt: Date;
            dbCancelAtPeriodEnd: boolean;
            providerKey: string;
            dbCreatedAt?: Date | null;
        }) => {
            effectiveStatus: string;
            effectiveExpiresAt: Date;
            nextCancelAtPeriodEnd: boolean;
            nextCanceledAt: Date | null;
        };
        applySubscriptionCreatedExistingRecordUpdate: (params: {
            dbSub: TSubscription;
            status: string;
            effectiveStatus: string;
            effectiveExpiresAt: Date;
            nextCancelAtPeriodEnd: boolean;
            nextCanceledAt: Date | null;
            isProviderSubscriptionActiveStatus: (status: string) => boolean;
        }) => Promise<{ dbSub: TSubscription; wasTransitioningToActive: boolean }>;
        isProviderSubscriptionActiveStatus: (status: string) => boolean;
        handlePaystackActiveSubscriptionPostProcessing: (dbSub: TSubscription, source: 'subscription.created') => Promise<boolean>;
        processSubscriptionCreatedPendingPaymentLink: (params: {
            subscriptionId: string;
            dbSub: TSubscription;
            logMessage: string;
        }, deps: {
            linkPendingPaymentToSubscription: (dbSub: TSubscription) => Promise<boolean>;
            syncOrganizationEligibilityForUser: (userId: string) => Promise<unknown>;
        }) => Promise<boolean>;
        linkPendingPaymentToSubscription: (dbSub: TSubscription) => Promise<boolean>;
        syncOrganizationEligibilityForUser: (userId: string) => Promise<unknown>;
    }
): Promise<{ dbSub: TSubscription; wasTransitioningToActive: boolean }> {
    const {
        effectiveStatus,
        effectiveExpiresAt,
        nextCancelAtPeriodEnd,
        nextCanceledAt,
    } = deps.deriveSubscriptionWebhookState({
        status: params.subscription.status,
        currentPeriodEnd: params.subscription.currentPeriodEnd,
        cancelAtPeriodEnd: params.subscription.cancelAtPeriodEnd,
        canceledAt: params.subscription.canceledAt,
        dbStatus: params.dbSub.status,
        dbCanceledAt: params.dbSub.canceledAt,
        dbExpiresAt: params.dbSub.expiresAt,
        dbCancelAtPeriodEnd: params.dbSub.cancelAtPeriodEnd,
        providerKey: params.providerKey,
    });

    const existingRecordUpdate = await deps.applySubscriptionCreatedExistingRecordUpdate({
        dbSub: params.dbSub,
        status: params.subscription.status,
        effectiveStatus,
        effectiveExpiresAt,
        nextCancelAtPeriodEnd,
        nextCanceledAt,
        isProviderSubscriptionActiveStatus: deps.isProviderSubscriptionActiveStatus,
    });

    let currentSub = existingRecordUpdate.dbSub;
    const wasTransitioningToActive = existingRecordUpdate.wasTransitioningToActive;

    if (params.providerKey === 'paystack' && deps.isProviderSubscriptionActiveStatus(params.subscription.status)) {
        const linked = await deps.handlePaystackActiveSubscriptionPostProcessing(currentSub, 'subscription.created');
        if (linked) {
            // already logged in helper
        }
    }

    if (wasTransitioningToActive) {
        await deps.processSubscriptionCreatedPendingPaymentLink({
            subscriptionId: params.subscriptionId,
            dbSub: currentSub,
            logMessage: 'Processed subscription.created activation transition',
        }, {
            linkPendingPaymentToSubscription: deps.linkPendingPaymentToSubscription,
            syncOrganizationEligibilityForUser: deps.syncOrganizationEligibilityForUser,
        });
        currentSub = currentSub;
    }

    Logger.info('Processed subscription.created as update', {
        subscriptionId: params.subscriptionId,
        status: params.subscription.status,
        wasTransitioningToActive,
    });

    return { dbSub: currentSub, wasTransitioningToActive };
}