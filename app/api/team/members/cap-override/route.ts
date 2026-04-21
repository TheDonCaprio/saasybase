import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../../../lib/prisma';
import { fetchTeamDashboardState } from '../../../../../lib/team-dashboard';
import { Logger } from '../../../../../lib/logger';
import { getOrganizationReferenceWhere as getOrganizationReferenceMatches } from '../../../../../lib/organization-reference';

function getOrganizationReferenceWhere(userId: string, orgId?: string | null) {
  return orgId
    ? { ownerUserId: userId, OR: getOrganizationReferenceMatches(orgId) }
    : { ownerUserId: userId };
}

export async function PATCH(request: NextRequest) {
  const { userId, orgId } = await authService.getSession();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let targetUserId: string | null = null;
  let capOverride: number | null | undefined = undefined;

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const candidateUser = body.userId;
    if (typeof candidateUser === 'string') targetUserId = candidateUser;

    // capOverride can be a positive integer (set), or null / 0 (clear)
    const candidateCap = body.capOverride;
    if (candidateCap === null || candidateCap === 0) {
      capOverride = null;
    } else if (typeof candidateCap === 'number' && candidateCap > 0 && Number.isFinite(candidateCap)) {
      capOverride = Math.round(candidateCap);
    }
  } catch (err) {
    Logger.warn('team member cap-override parse error', { error: String(err) });
  }

  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: 'Member userId is required.' }, { status: 400 });
  }

  if (capOverride === undefined) {
    return NextResponse.json({ ok: false, error: 'capOverride must be a positive integer or null to clear.' }, { status: 400 });
  }

  // Only the organization owner can change per-member overrides
  const organization = await prisma.organization.findFirst({
    where: getOrganizationReferenceWhere(userId, orgId),
    select: { id: true },
  });

  if (!organization) {
    return NextResponse.json({ ok: false, error: 'No organization found or you are not the owner.' }, { status: 403 });
  }

  // Verify the target user is a member of that organization
  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId: organization.id, userId: targetUserId },
    select: { id: true },
  });

  if (!membership) {
    return NextResponse.json({ ok: false, error: 'User is not a member of this organization.' }, { status: 404 });
  }

  await prisma.organizationMembership.update({
    where: { id: membership.id },
    data: { memberTokenCapOverride: capOverride },
  });

  const state = await fetchTeamDashboardState(userId, {
    forceSync: false,
    activeOrganizationId: orgId ?? null,
  });

  return NextResponse.json({ ok: true, ...state });
}
