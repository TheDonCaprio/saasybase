import { prisma } from '../prisma';
import { PLAN_DEFINITIONS } from '../plans';
import type { Plan } from '@/lib/prisma-client';

type LatestActiveOneTimeDispositionSub = {
    id: string;
    expiresAt: Date;
    plan: {
        autoRenew: boolean;
        supportsOrganizations: boolean;
    } | null;
};

export async function resolvePlanForOneTimeCheckout(params: {
    priceId?: string | null;
    metadataPlanId?: string | null;
    findPlanByPriceIdentifier: (priceId: string, metadataPlanId?: string | null) => Promise<Plan | null>;
}): Promise<Plan | null> {
    if (params.priceId) {
        const planByPrice = await params.findPlanByPriceIdentifier(params.priceId, params.metadataPlanId);
        if (planByPrice) return planByPrice;
    }

    if (!params.metadataPlanId) return null;
    const identifier = params.metadataPlanId.trim();
    if (!identifier) return null;

    const planById = await prisma.plan.findUnique({ where: { id: identifier } });
    if (planById) return planById;

    const candidateNames = new Set<string>();
    candidateNames.add(identifier);
    const seed = PLAN_DEFINITIONS.find(def => def.id === identifier);
    if (seed) {
        candidateNames.add(seed.name);
    }

    for (const nameCandidate of candidateNames) {
        const planByName = await prisma.plan.findFirst({ where: { name: nameCandidate } });
        if (planByName) return planByName;
    }

    return null;
}

export async function resolveOneTimeCheckoutDisposition(params: {
    userId: string;
    now: Date;
    planSupportsOrganizations: boolean;
}): Promise<{
    latestActive: LatestActiveOneTimeDispositionSub | null;
    mode: 'extend_non_recurring' | 'replace_non_recurring' | 'topup_recurring' | 'create_new';
}> {
    const latestActive = await prisma.subscription.findFirst({
        where: {
            userId: params.userId,
            status: 'ACTIVE',
            expiresAt: { gt: params.now },
        },
        include: { plan: true },
        orderBy: { expiresAt: 'desc' },
    });

    if (latestActive && latestActive.plan && latestActive.plan.autoRenew === false) {
        const latestSupportsOrganizations = latestActive.plan.supportsOrganizations === true;
        const purchasedSupportsOrganizations = params.planSupportsOrganizations === true;

        if (latestSupportsOrganizations !== purchasedSupportsOrganizations) {
            return { latestActive, mode: 'replace_non_recurring' };
        }

        return { latestActive, mode: 'extend_non_recurring' };
    }
    if (latestActive && latestActive.plan && latestActive.plan.autoRenew === true) {
        const latestSupportsOrganizations = latestActive.plan.supportsOrganizations === true;
        const purchasedSupportsOrganizations = params.planSupportsOrganizations === true;

        if (latestSupportsOrganizations === purchasedSupportsOrganizations) {
            return { latestActive, mode: 'topup_recurring' };
        }

        return { latestActive, mode: 'create_new' };
    }

    return { latestActive, mode: 'create_new' };
}