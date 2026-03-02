import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { requireAdminSectionAccess } from '../../../../../../lib/route-guards';
import { adminRateLimit } from '../../../../../../lib/rateLimit';
import { Logger } from '../../../../../../lib/logger';
import { recordAdminAction } from '../../../../../../lib/admin-actions';
import { toError } from '../../../../../../lib/runtime-guards';
import { clerkClient } from '@clerk/nextjs/server';

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ orgId: string }> }
) {
    let orgId: string | undefined;
    try {
        orgId = (await context.params).orgId;
        const actor = await requireAdminSectionAccess('organizations');
        const rl = await adminRateLimit(actor.userId, request, 'admin-orgs:delete', { limit: 60, windowMs: 120_000 });

        if (!rl.success && !rl.allowed) {
            Logger.error('Rate limiter unavailable for delete org', { actorId: actor.userId, error: rl.error });
            return NextResponse.json({ error: 'Service temporarily unavailable.' }, { status: 503 });
        }

        if (!rl.allowed) {
            const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } }
            );
        }
        // Check if organization exists
        const organization = await prisma.organization.findUnique({
            where: { id: orgId },
            select: {
                id: true,
                name: true,
                slug: true,
                clerkOrganizationId: true,
                _count: {
                    select: {
                        memberships: true,
                        invites: true
                    }
                }
            }
        });

        if (!organization) {
            return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
        }

        // If the organization has a Clerk backing record, attempt to delete it first.
        const clerkDeletion = { attempted: false, success: false, error: null as string | null };
        if (organization.clerkOrganizationId) {
            clerkDeletion.attempted = true;
            try {
                const client = await clerkClient();
                await client.organizations.deleteOrganization(organization.clerkOrganizationId);
                clerkDeletion.success = true;
            } catch (err: unknown) {
                const e = toError(err);
                // If Clerk reports not found, it's safe to continue; log other errors.
                Logger.error('Failed to delete Clerk organization for admin deletion', {
                    orgId,
                    clerkOrganizationId: organization.clerkOrganizationId,
                    error: e.message,
                });
                clerkDeletion.error = e.message ?? String(err);
            }
        }

        // Detach historical references before deletion; otherwise FK constraints can
        // prevent local deletion (payments/subscriptions may outlive the org).
        try {
            await prisma.subscription.updateMany({
                where: { organizationId: orgId },
                data: { organizationId: null },
            });
        } catch (err: unknown) {
            Logger.warn('Admin delete org: failed to detach subscriptions', {
                orgId,
                error: toError(err).message,
            });
        }

        try {
            await prisma.payment.updateMany({
                where: { organizationId: orgId },
                data: { organizationId: null },
            });
        } catch (err: unknown) {
            Logger.warn('Admin delete org: failed to detach payments', {
                orgId,
                error: toError(err).message,
            });
        }

        // Delete the organization locally (cascade handles memberships/invites)
        await prisma.organization.delete({
            where: { id: orgId }
        });

        await recordAdminAction({
            actorId: actor.userId,
            actorRole: actor.role,
            action: 'organizations.delete',
            targetType: 'ORGANIZATION',
            details: {
                orgId,
                orgName: organization.name,
                orgSlug: organization.slug,
                memberCount: organization._count.memberships,
                inviteCount: organization._count.invites,
                clerkDeletion
            }
        });

        return NextResponse.json({ success: true, message: 'Organization deleted successfully' });
    } catch (error) {
        const err = toError(error);
        Logger.error('Failed to delete organization', { error: err.message, orgId });
        return NextResponse.json({ error: 'Failed to delete organization' }, { status: 500 });
    }
}
