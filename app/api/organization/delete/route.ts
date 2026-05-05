import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider/service';
import { prisma } from '@/lib/prisma';
import { Logger } from '@/lib/logger';
import { toError } from '@/lib/runtime-guards';
import { deleteOrganizationByProviderId, getOrganizationActiveTeamPlans } from '@/lib/teams';

export async function DELETE(request: NextRequest) {
	const { userId } = await authService.getSession();
	if (!userId) {
		return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
	}

	let organizationId: string | null = null;
	try {
		const body = (await request.json()) as { organizationId?: string | null };
		organizationId = typeof body?.organizationId === 'string' && body.organizationId.trim().length > 0
			? body.organizationId.trim()
			: null;
	} catch {
		organizationId = null;
	}

	if (!organizationId) {
		return NextResponse.json({ ok: false, error: 'Organization is required' }, { status: 400 });
	}

	try {
		const organization = await prisma.organization.findFirst({
			where: {
				id: organizationId,
				ownerUserId: userId,
			},
			select: {
				id: true,
				name: true,
				slug: true,
				providerOrganizationId: true,
			},
		});

		if (!organization) {
			return NextResponse.json({ ok: false, error: 'Organization not found' }, { status: 404 });
		}

		const activeTeamPlans = await getOrganizationActiveTeamPlans(organization.id);
		if (activeTeamPlans && activeTeamPlans.length > 0) {
			return NextResponse.json({
				ok: false,
				error: 'Cancel the team plan before deleting this organization.',
				hasActivePlans: true,
				planNames: activeTeamPlans.map((plan) => plan.plan.name),
			}, { status: 409 });
		}

		if (organization.providerOrganizationId) {
			const deleted = await deleteOrganizationByProviderId(organization.providerOrganizationId);
			if (!deleted) {
				return NextResponse.json({ ok: false, error: 'Failed to delete organization' }, { status: 500 });
			}
		} else {
			await prisma.subscription.updateMany({
				where: { organizationId: organization.id },
				data: { organizationId: null },
			});

			await prisma.payment.updateMany({
				where: { organizationId: organization.id },
				data: { organizationId: null },
			});

			await prisma.organization.delete({ where: { id: organization.id } });
		}

		return NextResponse.json({ ok: true, deletedOrganizationId: organization.id });
	} catch (error: unknown) {
		const err = toError(error);
		Logger.error('organization delete failed', { userId, organizationId, error: err.message });
		return NextResponse.json({ ok: false, error: 'Failed to delete organization' }, { status: 500 });
	}
}