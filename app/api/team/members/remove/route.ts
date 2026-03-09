import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../../../lib/prisma';
import { removeOrganizationMembership } from '../../../../../lib/teams';
import { fetchTeamDashboardState } from '../../../../../lib/team-dashboard';
import { Logger } from '../../../../../lib/logger';
import { toError } from '../../../../../lib/runtime-guards';

export async function POST(request: NextRequest) {
  const { userId, orgId } = await authService.getSession();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let targetUserId: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    const candidate = (body as Record<string, unknown>).userId;
    if (typeof candidate === 'string') {
      targetUserId = candidate;
    }
  } catch (err) {
    Logger.warn('team member remove parse error', { error: String(err) });
  }

  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: 'Member userId is required.' }, { status: 400 });
  }

  if (targetUserId === userId) {
    return NextResponse.json({ ok: false, error: 'Use the billing page to resign ownership.' }, { status: 400 });
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

  try {
    await authService.deleteOrganizationMembership({
      organizationId: providerOrganizationId,
      userId: targetUserId,
    });
  } catch (err: unknown) {
    const error = toError(err);
    if (!error.message.toLowerCase().includes('not found')) {
      Logger.warn('team member removal failed', { userId, targetUserId, error: error.message });
      return NextResponse.json({ ok: false, error: error.message || 'Unable to remove member' }, { status: 400 });
    }
  }

  await removeOrganizationMembership({ userId: targetUserId, organizationId: organization.id });
  const state = await fetchTeamDashboardState(userId, {
    forceSync: true,
    activeOrganizationId: orgId ?? null,
  });
  return NextResponse.json({ ok: true, ...state });
}
