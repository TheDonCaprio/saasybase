import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/auth';
import { authService } from '../../../../lib/auth-provider';
import { prisma } from '../../../../lib/prisma';
import { deactivateOrganizationsByIds } from '../../../../lib/organization-access';
import { Logger } from '../../../../lib/logger';
import { toError } from '../../../../lib/runtime-guards';
import { getPaidTokensNaturalExpiryGraceHours } from '../../../../lib/settings';

type ValidateOrgAccessPayload = {
    activeOrgId?: string | null;
};

export async function POST(request: Request) {
    try {
        const userId = await requireUser();
        const payload = await request.json().catch(() => null) as ValidateOrgAccessPayload | null;
        const requestedActiveOrgId = typeof payload?.activeOrgId === 'string' && payload.activeOrgId.trim().length > 0
            ? payload.activeOrgId.trim()
            : null;

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
                        clerkOrganizationId: true,
                        ownerUserId: true,
                    }
                }
            }
        });

        let clearActiveOrg = false;
        let activeOrgReason: string | null = null;

        if (requestedActiveOrgId) {
            const activeMembership = memberships.find(
                (membership) => membership.organization.id === requestedActiveOrgId
                    || membership.organization.clerkOrganizationId === requestedActiveOrgId
            );

            if (!activeMembership) {
                clearActiveOrg = true;
                activeOrgReason = 'active_org_membership_missing';
            } else if (authService.supportsFeature('organizations')) {
                const providerOrganizationId = activeMembership.organization.clerkOrganizationId ?? requestedActiveOrgId;
                const providerOrganization = await authService.getOrganization(providerOrganizationId);

                if (!providerOrganization) {
                    clearActiveOrg = true;
                    activeOrgReason = 'active_org_provider_missing';
                }
            }
        }

        if (memberships.length === 0) {
            return NextResponse.json({ valid: true, reason: 'no_org', clearActiveOrg, activeOrgReason });
        }

        const ownerIds = Array.from(new Set(memberships.map(m => m.organization.ownerUserId).filter(Boolean)));
        if (ownerIds.length === 0) {
            return NextResponse.json({ valid: true, reason: 'no_owner', clearActiveOrg, activeOrgReason });
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
            return NextResponse.json({ valid: true, reason: 'has_valid_owner', clearActiveOrg, activeOrgReason });
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
            return NextResponse.json({ valid: true, reason: 'grace_period', clearActiveOrg, activeOrgReason });
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
            message: 'Organization access has expired.',
            clearActiveOrg,
            activeOrgReason,
        });

    } catch (error) {
        const err = toError(error);
        // Don't fail the request if check fails, just log it
        // Use warn level since unauthorized is expected for anonymous visitors
        Logger.warn('Lazy Check: Failed to validate org access', { error: err.message });
        return NextResponse.json({ valid: true, error: err.message });
    }
}
