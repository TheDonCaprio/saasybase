import { prisma } from '../prisma';
import { Logger } from '../logger';

export async function cancelSupersededOneTimeSubscriptions(params: {
    userId: string;
    replacementSubscriptionId: string;
    providerKey: string;
    buildImmediateCancellationData: (cancellationTime: Date) => {
        status: 'CANCELLED';
        canceledAt: Date;
        expiresAt: Date;
        cancelAtPeriodEnd: boolean;
    };
}): Promise<void> {
    const cancellationTime = new Date();

    const cancelled = await prisma.subscription.updateMany({
        where: {
            userId: params.userId,
            id: { not: params.replacementSubscriptionId },
            status: 'ACTIVE',
            expiresAt: { gt: cancellationTime },
            plan: { autoRenew: false },
        },
        data: params.buildImmediateCancellationData(cancellationTime),
    });

    if (cancelled.count > 0) {
        Logger.info('Cancelled superseded one-time subscriptions for recurring replacement', {
            userId: params.userId,
            replacementSubscriptionId: params.replacementSubscriptionId,
            cancelledCount: cancelled.count,
            provider: params.providerKey,
        });
    }
}