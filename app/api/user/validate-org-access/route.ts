import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { deactivateOrganizationsByIds } from '../../../../lib/organization-access';
import { Logger } from '../../../../lib/logger';
import { toError } from '../../../../lib/runtime-guards';
import { getPaidTokensNaturalExpiryGraceHours } from '../../../../lib/settings';

export async function POST() {
    try {
        const userId = await requireUser();

        const now = new Date();
        const graceHours = await getPaidTokensNaturalExpiryGraceHours();
        const graceCutoff = new Date(now.getTime() - graceHours * 60 * 60 * 1000);

        // Check all active memberships for the user.
        // Only declare invalid if NONE map to an owner with an active (or pending) team/org plan.
        const memberships = await prisma.organizationMembership.findMany({
            where: {
                userId,
                status: 'ACTIVE'
            },
            include: {
                organization: {
                    select: {
                        id: true,
                        ownerUserId: true,
                    }
                }
            }
        });

        if (memberships.length === 0) {
            return NextResponse.json({ valid: true, reason: 'no_org' });
        }

        const ownerIds = Array.from(new Set(memberships.map(m => m.organization.ownerUserId).filter(Boolean)));
        if (ownerIds.length === 0) {
            return NextResponse.json({ valid: true, reason: 'no_owner' });
        }

        const ownersWithValidOrgPlan = await prisma.subscription.findMany({
            where: {
                userId: { in: ownerIds },
                plan: { supportsOrganizations: true },
                OR: [
                    // Any non-EXPIRED subscription with time remaining still confers org access.
                    { status: { not: 'EXPIRED' }, expiresAt: { gt: now } },
                    // After wall-clock expiry, keep org access during the grace window.
                    // Include CANCELLED and PAST_DUE — not just EXPIRED.
                    { status: { in: ['EXPIRED', 'CANCELLED', 'PAST_DUE'] }, expiresAt: { gt: graceCutoff, lte: now } },
                ]
            },
            select: { userId: true },
        });

        if (ownersWithValidOrgPlan.length > 0) {
            return NextResponse.json({ valid: true, reason: 'has_valid_owner' });
        }

        // No valid owner subscriptions found for any org the user belongs to.
        // Before deleting anything, require that the owner's org-capable subscription
        // has been expired for at least the configured grace window, applied per owner.
        const latestOrgPlanExpiryByOwner = await Promise.all(
            ownerIds.map(async (ownerId) => {
                const latest = await prisma.subscription.findFirst({
                    where: {
                        userId: ownerId,
                        plan: {
                            supportsOrganizations: true
                        }
                    },
                    orderBy: { expiresAt: 'desc' },
                    select: { expiresAt: true },
                });
                return { ownerId, expiresAt: latest?.expiresAt ?? null };
            })
        );

        const graceOwnerIds = new Set(
            latestOrgPlanExpiryByOwner
                .filter((row) => row.expiresAt && row.expiresAt > graceCutoff)
                .map((row) => row.ownerId)
        );

        const deletableOrgIds = Array.from(
            new Set(
                memberships
                    .filter((m) => !graceOwnerIds.has(m.organization.ownerUserId))
                    .map((m) => m.organization.id)
            )
        );

        if (deletableOrgIds.length === 0) {
            return NextResponse.json({ valid: true, reason: 'grace_period' });
        }

        Logger.info('Lazy Check: No valid organization owners; grace window elapsed; triggering scoped cleanup', {
            userId,
            ownerIds,
            orgIds: deletableOrgIds,
            graceOwnerIds: Array.from(graceOwnerIds),
        });

        try {
            await deactivateOrganizationsByIds(deletableOrgIds, {
                userId,
                reason: 'validate-org-access',
            });
        } catch (err) {
            Logger.warn('Lazy Check: Failed to deactivate organizations (scoped)', {
                userId,
                orgIds: deletableOrgIds,
                error: toError(err).message,
            });
        }

        return NextResponse.json({
            valid: false,
            reason: 'org_expired',
            message: 'Organization access has expired.'
        });

    } catch (error) {
        const err = toError(error);
        // Don't fail the request if check fails, just log it
        // Use warn level since unauthorized is expected for anonymous visitors
        Logger.warn('Lazy Check: Failed to validate org access', { error: err.message });
        return NextResponse.json({ valid: true, error: err.message });
    }
}
