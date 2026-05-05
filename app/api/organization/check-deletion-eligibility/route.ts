import { authService } from '@/lib/auth-provider/service';
import { handleApiError } from '@/lib/api-error';
import { prisma } from '@/lib/prisma';
import { getOrganizationActiveTeamPlans } from '@/lib/teams';
import { NextResponse } from 'next/server';

/**
 * GET /api/organization/check-deletion-eligibility
 *
 * Check if the current active organization can be deleted.
 * Returns whether it has active team plans that would prevent deletion.
 */
export async function GET(request: Request) {
	try {
		const { userId, orgId } = await authService.getSession();
		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const requestedOrganizationId = new URL(request.url).searchParams.get('organizationId') || orgId;

		// No org context = personal workspace, no team plan to worry about
		if (!requestedOrganizationId) {
			return NextResponse.json({ canDelete: true, hasActivePlans: false });
		}

		const organization = await prisma.organization.findFirst({
			where: {
				id: requestedOrganizationId,
				OR: [
					{ ownerUserId: userId },
					{ memberships: { some: { userId, status: 'ACTIVE' } } },
				],
			},
			select: { id: true },
		});

		if (!organization) {
			return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
		}

		const activeTeamPlans = await getOrganizationActiveTeamPlans(organization.id);
		const hasActivePlans = activeTeamPlans && activeTeamPlans.length > 0;

		return NextResponse.json({
			canDelete: !hasActivePlans,
			hasActivePlans,
			planNames: hasActivePlans ? activeTeamPlans?.map((p) => p.plan.name) : [],
		});
	} catch (error) {
		return handleApiError(error);
	}
}
