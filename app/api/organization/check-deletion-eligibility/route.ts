import { authService } from '@/lib/auth-provider/service';
import { handleApiError } from '@/lib/api-error';
import { getOrganizationActiveTeamPlans } from '@/lib/teams';
import { NextResponse } from 'next/server';

/**
 * GET /api/organization/check-deletion-eligibility
 *
 * Check if the current active organization can be deleted.
 * Returns whether it has active team plans that would prevent deletion.
 */
export async function GET() {
	try {
		const { orgId } = await authService.getSession();

		// No org context = personal workspace, no team plan to worry about
		if (!orgId) {
			return NextResponse.json({ canDelete: true, hasActivePlans: false });
		}

		const activeTeamPlans = await getOrganizationActiveTeamPlans(orgId);
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
