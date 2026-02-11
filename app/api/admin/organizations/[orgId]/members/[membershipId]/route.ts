import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../../lib/prisma';
import { requireAdminSectionAccess } from '../../../../../../../lib/route-guards';
import { adminRateLimit } from '../../../../../../../lib/rateLimit';
import { Logger } from '../../../../../../../lib/logger';
import { recordAdminAction } from '../../../../../../../lib/admin-actions';
import { toError } from '../../../../../../../lib/runtime-guards';

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ orgId: string; membershipId: string }> }
) {
    let params: { orgId: string; membershipId: string } | undefined;
    try {
        const routeParams = await context.params;
        params = routeParams;
        const actor = await requireAdminSectionAccess('organizations');
        const rl = await adminRateLimit(actor.userId, request, 'admin-orgs:remove-member', { limit: 120, windowMs: 120_000 });

        if (!rl.success && !rl.allowed) {
            Logger.error('Rate limiter unavailable for remove member', { actorId: actor.userId, error: rl.error });
            return NextResponse.json({ error: 'Service temporarily unavailable.' }, { status: 503 });
        }

        if (!rl.allowed) {
            const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } }
            );
        }

        const { orgId, membershipId } = routeParams;

        // Check if membership exists
        const membership = await prisma.organizationMembership.findUnique({
            where: { id: membershipId },
            include: {
                organization: {
                    include: {
                        owner: {
                            select: { id: true }
                        }
                    }
                },
                user: { select: { id: true, name: true, email: true } }
            }
        });

        if (!membership) {
            return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
        }

        if (membership.organizationId !== orgId) {
            return NextResponse.json({ error: 'Membership does not belong to this organization' }, { status: 400 });
        }

        // Prevent removing the owner
        if (membership.userId === membership.organization.owner?.id) {
            return NextResponse.json({ error: 'Cannot remove the organization owner' }, { status: 400 });
        }

        // Delete the membership
        await prisma.organizationMembership.delete({
            where: { id: membershipId }
        });

        await recordAdminAction({
            actorId: actor.userId,
            actorRole: actor.role,
            action: 'organizations.remove_member',
            targetType: 'ORGANIZATION_MEMBERSHIP',
            details: {
                orgId,
                membershipId,
                userId: membership.userId,
                userName: membership.user?.name,
                userEmail: membership.user?.email,
                orgName: membership.organization.name
            }
        });

        return NextResponse.json({ success: true, message: 'Member removed successfully' });
    } catch (error) {
        const err = toError(error);
        Logger.error('Failed to remove organization member', { error: err.message, params });
        return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
    }
}
