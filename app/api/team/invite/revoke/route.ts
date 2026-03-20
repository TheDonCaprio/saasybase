import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../../../lib/prisma';
import { expireOrganizationInvite } from '../../../../../lib/teams';
import { fetchTeamDashboardState } from '../../../../../lib/team-dashboard';
import { Logger } from '../../../../../lib/logger';
import { toError } from '../../../../../lib/runtime-guards';

export async function POST(request: NextRequest) {
  const { userId, orgId } = await authService.getSession();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let token: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    const candidate = (body as Record<string, unknown>).token ?? (body as Record<string, unknown>).invitationId;
    if (typeof candidate === 'string') {
      token = candidate;
    }
  } catch (err) {
    Logger.warn('team invite revoke parse error', { error: String(err) });
  }

  if (!token) {
    return NextResponse.json({ ok: false, error: 'Invitation token is required.' }, { status: 400 });
  }

  const organization = await prisma.organization.findFirst({
    where: orgId
      ? {
          ownerUserId: userId,
          OR: [{ id: orgId }, { clerkOrganizationId: orgId }],
        }
      : { ownerUserId: userId },
    select: { id: true, clerkOrganizationId: true },
  });

  if (!organization) {
    return NextResponse.json({ ok: false, error: 'No organization found.' }, { status: 400 });
  }

  const providerOrganizationId = organization.clerkOrganizationId ?? organization.id;

  // Attempt provider-specific invitation revocation when supported.
  if (authService.supportsFeature('organization_invites')) {
    try {
      await authService.revokeOrganizationInvitation({
        organizationId: providerOrganizationId,
        invitationId: token,
        requestingUserId: userId,
      });
    } catch (err: unknown) {
      const error = toError(err);
      // If Clerk already revoked it, continue
      if (!error.message.toLowerCase().includes('not found')) {
        Logger.warn('team invite revoke failed', { userId, error: error.message });
        return NextResponse.json({ ok: false, error: error.message || 'Unable to revoke invite' }, { status: 400 });
      }
    }
  }

  await expireOrganizationInvite(token);
  const state = await fetchTeamDashboardState(userId, {
    forceSync: true,
    activeOrganizationId: orgId ?? null,
  });
  return NextResponse.json({ ok: true, ...state });
}
