import type { Prisma } from '@/lib/prisma-client';

type SubscriptionLookupClient = Pick<Prisma.TransactionClient, 'subscription'>;

export type ActivePaidPersonalSubscription = {
  id: string;
  tokenLimit: number | null;
  tokenName: string | null;
  expiresAt: Date | null;
};

export async function findActivePaidPersonalSubscription(
  db: SubscriptionLookupClient,
  userId: string,
): Promise<ActivePaidPersonalSubscription | null> {
  const now = new Date();
  const subscription = await db.subscription.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      expiresAt: true,
      plan: {
        select: {
          tokenLimit: true,
          tokenName: true,
        },
      },
    },
    orderBy: { expiresAt: 'desc' },
  });

  if (!subscription) {
    return null;
  }

  return {
    id: subscription.id,
    tokenLimit: subscription.plan
      ? (typeof subscription.plan.tokenLimit === 'number' ? subscription.plan.tokenLimit : null)
      : 0,
    tokenName: typeof subscription.plan?.tokenName === 'string' ? subscription.plan.tokenName : null,
    expiresAt: subscription.expiresAt ?? null,
  };
}

export function hasUnlimitedPaidPersonalAccess(subscription: ActivePaidPersonalSubscription | null): boolean {
  return Boolean(subscription && subscription.tokenLimit == null);
}