import { prisma } from '../prisma';

export async function findRecentNotificationByExactMessage(
    userId: string,
    title: string,
    message: string,
    lookbackMs: number
) {
    return prisma.notification.findFirst({
        where: {
            userId,
            title,
            message,
            createdAt: { gte: new Date(Date.now() - lookbackMs) }
        }
    });
}

export async function findRecentNotificationByTitles(
    userId: string,
    titles: string[],
    lookbackMs: number
) {
    return prisma.notification.findFirst({
        where: {
            userId,
            title: { in: titles },
            createdAt: { gte: new Date(Date.now() - lookbackMs) },
        },
    });
}

export async function findRecentCancelledRecurringSubscription(
    userId: string,
    lookbackMs: number,
    excludeSubscriptionId?: string
) {
    return prisma.subscription.findFirst({
        where: {
            userId,
            ...(excludeSubscriptionId ? { id: { not: excludeSubscriptionId } } : null),
            status: 'CANCELLED',
            canceledAt: { gte: new Date(Date.now() - lookbackMs) },
            plan: { autoRenew: true },
        },
        select: { id: true },
    });
}

export function getPendingSubscriptionLookbackDate(lookbackMs: number): Date {
    return new Date(Date.now() - lookbackMs);
}