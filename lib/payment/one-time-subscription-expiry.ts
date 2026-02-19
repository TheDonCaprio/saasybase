import { prisma } from '../prisma';
import { Logger } from '../logger';
import { maybeClearPaidTokensAfterNaturalExpiryGrace } from '../paidTokenCleanup';
import { syncOrganizationEligibilityForUser } from '../organization-access';
import { notifyExpiredSubscriptions } from '../notifications';
import { toError } from '../runtime-guards';

export async function expirePriorActiveSubscriptionsForOneTimeCheckout(userId: string): Promise<void> {
    const expiredOnetimeSubs = await prisma.subscription.findMany({
        where: { userId, status: 'ACTIVE', expiresAt: { lt: new Date() } },
        select: {
            id: true,
            organizationId: true,
            plan: { select: { autoRenew: true, supportsOrganizations: true } },
        }
    });

    const expiredOnetimeCount = await prisma.subscription.updateMany({
        where: { userId, status: 'ACTIVE', expiresAt: { lt: new Date() } },
        data: { status: 'EXPIRED', canceledAt: new Date() }
    });

    if (expiredOnetimeCount.count > 0) {
        await maybeClearPaidTokensAfterNaturalExpiryGrace({ userId });
        try {
            await syncOrganizationEligibilityForUser(userId);
        } catch (err) {
            Logger.warn('Failed to sync organization eligibility after expiring one-time subscriptions', {
                userId,
                error: toError(err).message
            });
        }
    }

    if (expiredOnetimeSubs.length > 0) {
        notifyExpiredSubscriptions(expiredOnetimeSubs.map(s => s.id)).catch(err => {
            Logger.warn('Failed to notify expired subscriptions', { error: toError(err).message });
        });
    }
}