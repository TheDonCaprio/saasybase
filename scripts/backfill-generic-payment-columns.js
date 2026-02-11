const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Starting backfill of generic payment columns...');

    // 1. Users
    console.log('Backfilling Users...');
    const users = await prisma.user.findMany({
        where: {
            stripeCustomerId: { not: null },
            externalCustomerId: null
        }
    });

    for (const user of users) {
        await prisma.user.update({
            where: { id: user.id },
            data: {
                paymentProvider: 'stripe',
                externalCustomerId: user.stripeCustomerId
            }
        });
    }
    console.log(`Updated ${users.length} users.`);

    // 2. Plans
    console.log('Backfilling Plans...');
    const plans = await prisma.plan.findMany({
        where: {
            stripePriceId: { not: null },
            externalPriceId: null
        }
    });

    for (const plan of plans) {
        await prisma.plan.update({
            where: { id: plan.id },
            data: {
                externalPriceId: plan.stripePriceId
            }
        });
    }
    console.log(`Updated ${plans.length} plans.`);

    // 3. Subscriptions
    console.log('Backfilling Subscriptions...');
    const subs = await prisma.subscription.findMany({
        where: {
            stripeSubscriptionId: { not: null },
            externalSubscriptionId: null
        }
    });

    for (const sub of subs) {
        await prisma.subscription.update({
            where: { id: sub.id },
            data: {
                paymentProvider: 'stripe',
                externalSubscriptionId: sub.stripeSubscriptionId
            }
        });
    }
    console.log(`Updated ${subs.length} subscriptions.`);

    // 4. Payments
    console.log('Backfilling Payments...');
    const payments = await prisma.payment.findMany({
        where: {
            OR: [
                { stripePaymentIntentId: { not: null } },
                { stripeCheckoutSessionId: { not: null } },
                { stripeRefundId: { not: null } }
            ],
            externalPaymentId: null,
            externalSessionId: null,
            externalRefundId: null
        }
    });

    for (const payment of payments) {
        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                paymentProvider: 'stripe',
                externalPaymentId: payment.stripePaymentIntentId,
                externalSessionId: payment.stripeCheckoutSessionId,
                externalRefundId: payment.stripeRefundId
            }
        });
    }
    console.log(`Updated ${payments.length} payments.`);

    // 5. Coupons
    console.log('Backfilling Coupons...');
    const coupons = await prisma.coupon.findMany({
        where: {
            stripeCouponId: { not: null },
            externalCouponId: null
        }
    });

    for (const coupon of coupons) {
        await prisma.coupon.update({
            where: { id: coupon.id },
            data: {
                externalCouponId: coupon.stripeCouponId
            }
        });
    }
    console.log(`Updated ${coupons.length} coupons.`);

    console.log('Backfill complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
