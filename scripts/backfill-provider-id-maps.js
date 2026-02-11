const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseMap(value) {
    if (!value) return {};
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }
    if (typeof value === 'object') return { ...value };
    return {};
}

function mergeMap(existing, provider, value) {
    const map = parseMap(existing);
    if (value && !map[provider]) {
        map[provider] = value;
    }
    return map;
}

async function backfillUsers() {
    console.log('Backfilling users...');
    const users = await prisma.user.findMany({});
    let updated = 0;

    for (const user of users) {
        const { stripeCustomerId, externalCustomerId, externalCustomerIds, paymentProvider } = user;
        let map = mergeMap(externalCustomerIds, 'stripe', stripeCustomerId || externalCustomerId);
        const updates = {};

        if (Object.keys(map).length > 0) {
            const serialized = JSON.stringify(map);
            if (serialized !== externalCustomerIds) {
                updates.externalCustomerIds = serialized;
            }
        }
        if (!paymentProvider) {
            updates.paymentProvider = 'stripe';
        }

        if (Object.keys(updates).length > 0) {
            await prisma.user.update({ where: { id: user.id }, data: updates });
            updated += 1;
        }
    }
    console.log(`Users updated: ${updated}`);
}

async function backfillPlans() {
    console.log('Backfilling plans...');
    const plans = await prisma.plan.findMany({});
    let updated = 0;

    for (const plan of plans) {
        const { stripePriceId, externalPriceId, externalProductId, externalPriceIds, externalProductIds } = plan;
        let priceMap = mergeMap(externalPriceIds, 'stripe', stripePriceId || externalPriceId);
        let productMap = mergeMap(externalProductIds, 'stripe', externalProductId);
        const updates = {};

        if (Object.keys(priceMap).length > 0) {
            const serialized = JSON.stringify(priceMap);
            if (serialized !== externalPriceIds) updates.externalPriceIds = serialized;
        }
        if (Object.keys(productMap).length > 0) {
            const serialized = JSON.stringify(productMap);
            if (serialized !== externalProductIds) updates.externalProductIds = serialized;
        }

        if (Object.keys(updates).length > 0) {
            await prisma.plan.update({ where: { id: plan.id }, data: updates });
            updated += 1;
        }
    }
    console.log(`Plans updated: ${updated}`);
}

async function backfillSubscriptions() {
    console.log('Backfilling subscriptions...');
    const subs = await prisma.subscription.findMany({});
    let updated = 0;

    for (const sub of subs) {
        const { stripeSubscriptionId, externalSubscriptionId, externalSubscriptionIds, paymentProvider } = sub;
        let map = mergeMap(externalSubscriptionIds, 'stripe', stripeSubscriptionId || externalSubscriptionId);
        const updates = {};

        if (Object.keys(map).length > 0) {
            const serialized = JSON.stringify(map);
            if (serialized !== externalSubscriptionIds) updates.externalSubscriptionIds = serialized;
        }
        if (!paymentProvider) {
            updates.paymentProvider = 'stripe';
        }

        if (Object.keys(updates).length > 0) {
            await prisma.subscription.update({ where: { id: sub.id }, data: updates });
            updated += 1;
        }
    }
    console.log(`Subscriptions updated: ${updated}`);
}

async function backfillPayments() {
    console.log('Backfilling payments...');
    const payments = await prisma.payment.findMany({});
    let updated = 0;

    for (const payment of payments) {
        const {
            stripePaymentIntentId,
            stripeCheckoutSessionId,
            stripeRefundId,
            externalPaymentId,
            externalSessionId,
            externalRefundId,
            externalPaymentIds,
            externalSessionIds,
            externalRefundIds,
            paymentProvider
        } = payment;

        const paymentId = stripePaymentIntentId || externalPaymentId;
        const sessionId = stripeCheckoutSessionId || externalSessionId;
        const refundId = stripeRefundId || externalRefundId;

        let paymentMap = mergeMap(externalPaymentIds, 'stripe', paymentId);
        let sessionMap = mergeMap(externalSessionIds, 'stripe', sessionId);
        let refundMap = mergeMap(externalRefundIds, 'stripe', refundId);

        const updates = {};

        if (Object.keys(paymentMap).length > 0) {
            const serialized = JSON.stringify(paymentMap);
            if (serialized !== externalPaymentIds) updates.externalPaymentIds = serialized;
        }
        if (Object.keys(sessionMap).length > 0) {
            const serialized = JSON.stringify(sessionMap);
            if (serialized !== externalSessionIds) updates.externalSessionIds = serialized;
        }
        if (Object.keys(refundMap).length > 0) {
            const serialized = JSON.stringify(refundMap);
            if (serialized !== externalRefundIds) updates.externalRefundIds = serialized;
        }
        if (!paymentProvider) {
            updates.paymentProvider = 'stripe';
        }

        if (Object.keys(updates).length > 0) {
            await prisma.payment.update({ where: { id: payment.id }, data: updates });
            updated += 1;
        }
    }
    console.log(`Payments updated: ${updated}`);
}

async function main() {
    console.log('Starting provider-aware ID map backfill...');
    await backfillUsers();
    await backfillPlans();
    await backfillSubscriptions();
    await backfillPayments();
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
