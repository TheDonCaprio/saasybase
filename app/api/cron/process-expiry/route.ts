import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { Logger } from '../../../../lib/logger';
import { deactivateUserOrganizations } from '../../../../lib/organization-access';
import { toError } from '../../../../lib/runtime-guards';
import { getPaidTokensNaturalExpiryGraceHours } from '../../../../lib/settings';
import { maybeClearPaidTokensAfterNaturalExpiryGrace } from '../../../../lib/paidTokenCleanup';

import { rateLimit, getClientIP } from '../../../../lib/rateLimit';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest): string | null {
    const bearer = req.headers.get('authorization') || '';
    if (!bearer.startsWith('Bearer ')) return null;
    const token = bearer.slice('Bearer '.length).trim();
    return token.length ? token : null;
}

function isCronAuthorized(req: NextRequest): boolean {
    const expected = process.env.CRON_PROCESS_EXPIRY_TOKEN || process.env.CRON_TOKEN || process.env.INTERNAL_API_TOKEN || null;
    const bearer = getBearerToken(req);

    // Production: require a configured secret and a matching Bearer token.
    if (process.env.NODE_ENV === 'production') {
        return Boolean(expected && bearer && bearer === expected);
    }

    // Non-production: allow either the explicit dev header or the bearer token.
    if (req.headers.get('X-Internal-API') === 'true') return true;
    return Boolean(expected && bearer && bearer === expected);
}

export async function GET(request: NextRequest) {
    // 0. Authorization
    // This endpoint mutates data; do not expose publicly in production.
    if (!isCronAuthorized(request)) {
        // Return 404 (not 401) in production to reduce endpoint discovery.
        if (process.env.NODE_ENV === 'production') {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Rate limiting
    // Limit to 2 requests per minute to prevent accidental/abusive repeated runs.
    const ip = getClientIP(request);
    const rateLimitResult = await rateLimit(`cron:expiry:${ip}`, {
        limit: 2,
        windowMs: 60 * 1000, // 1 minute
        message: 'Too many cron requests'
    });

    if (!rateLimitResult.success || !rateLimitResult.allowed) {
        return new NextResponse('Too Many Requests', { status: 429 });
    }

    const now = new Date();
    const graceHours = await getPaidTokensNaturalExpiryGraceHours();
    const graceCutoff = new Date(now.getTime() - graceHours * 60 * 60 * 1000);
    const results = {
        expiredSubscriptions: 0,
        clearedPaidTokenUsers: 0,
        dismantledOrganizations: 0,
        errors: [] as string[]
    };

    try {
        // 2. Expire 'ACTIVE' subscriptions that have passed their expiry date
        // This handles cases where the subscription naturally ended but wasn't updated
        const expiredActiveSubs = await prisma.subscription.updateMany({
            where: {
                status: 'ACTIVE',
                expiresAt: { lt: now }
            },
            data: {
                status: 'EXPIRED'
            }
        });

        results.expiredSubscriptions = expiredActiveSubs.count;

        if (expiredActiveSubs.count > 0) {
            Logger.info('Cron: Expired active subscriptions', { count: expiredActiveSubs.count });
        }

        // 2b. Clear paid tokens for users whose ended subscriptions are beyond the grace cutoff.
        // This makes cleanup effective even if a user stays signed-in for days.
        const endedUsers = await prisma.subscription.findMany({
            where: {
                status: { in: ['EXPIRED', 'CANCELLED'] },
                expiresAt: { lt: graceCutoff },
            },
            distinct: ['userId'],
            select: { userId: true },
        });

        for (const row of endedUsers) {
            try {
                const res = await maybeClearPaidTokensAfterNaturalExpiryGrace({ userId: row.userId, graceHours });
                if (res.cleared) results.clearedPaidTokenUsers++;
            } catch (err) {
                const error = toError(err);
                Logger.error('Cron: Failed to clear paid tokens after grace', {
                    userId: row.userId,
                    error: error.message,
                });
                results.errors.push(`PaidTokens ${row.userId}: ${error.message}`);
            }
        }

        // 3. Find "Zombie" Organizations
        // These are organizations where the owner does NOT have a valid, active team subscription
        // We check for:
        // - Owner has NO active subscription
        // - OR Owner has an active subscription but it does NOT support organizations

        // First, get all organization owners
        const organizations = await prisma.organization.findMany({
            select: {
                id: true,
                ownerUserId: true,
                name: true
            }
        });

        // For each organization, check if the owner has a valid team plan
        for (const org of organizations) {
            try {
                const validSubscription = await prisma.subscription.findFirst({
                    where: {
                        userId: org.ownerUserId,
                        plan: {
                            supportsOrganizations: true
                        },
                        OR: [
                            // Any non-EXPIRED subscription with time remaining still confers org access.
                            { status: { not: 'EXPIRED' }, expiresAt: { gt: now } },
                            // After wall-clock expiry, keep org access during the grace window.
                            // Include CANCELLED and PAST_DUE — not just EXPIRED.
                            { status: { in: ['EXPIRED', 'CANCELLED', 'PAST_DUE'] }, expiresAt: { gt: graceCutoff, lte: now } },
                        ]
                    }
                });

                if (!validSubscription) {
                    // Owner has no valid team subscription -> Dismantle Organization
                    Logger.info('Cron: Dismantling zombie organization', {
                        orgId: org.id,
                        orgName: org.name,
                        ownerId: org.ownerUserId
                    });

                    await deactivateUserOrganizations(org.ownerUserId);
                    results.dismantledOrganizations++;
                }
            } catch (err) {
                const error = toError(err);
                Logger.error('Cron: Failed to process organization cleanup', {
                    orgId: org.id,
                    error: error.message
                });
                results.errors.push(`Org ${org.id}: ${error.message}`);
            }
        }

        return NextResponse.json({
            success: true,
            timestamp: now.toISOString(),
            results
        });

    } catch (error) {
        const err = toError(error);
        Logger.error('Cron: Job failed', { error: err.message });
        return NextResponse.json(
            { success: false, error: err.message },
            { status: 500 }
        );
    }
}
