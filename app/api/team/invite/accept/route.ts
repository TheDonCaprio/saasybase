import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../../../lib/prisma';
import { ensureUserExists } from '../../../../../lib/user-helpers';
import { addOrConfirmClerkMembership } from '../../../../../lib/clerk-memberships';
import { markInviteAccepted, syncOrganizationMembership } from '../../../../../lib/teams';
import { Logger } from '../../../../../lib/logger';
import { toError } from '../../../../../lib/runtime-guards';

function normalizeEmail(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

export async function POST(request: NextRequest) {
  const { userId } = await authService.getSession();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Sign in to accept this invite.' }, { status: 401 });
  }

  let token: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    const rawToken = (body as Record<string, unknown>).token;
    if (typeof rawToken === 'string' && rawToken.trim().length > 0) {
      token = rawToken.trim();
    }
  } catch (err) {
    Logger.warn('team invite accept: failed to parse request body', { error: String(err) });
  }

  if (!token) {
    return NextResponse.json({ ok: false, error: 'Invitation token missing.' }, { status: 400 });
  }

  try {
    const viewer = await ensureUserExists({ userId });
    let viewerEmail = normalizeEmail(viewer?.email ?? null);
    if (!viewerEmail) {
      try {
        const clerkUser = await authService.getUser(userId);
        if (clerkUser?.email) {
          viewerEmail = normalizeEmail(clerkUser.email);
        }
      } catch (err) {
        Logger.warn('team invite accept: failed to fetch user email', { userId, error: toError(err).message });
      }
    }

    const invite = await prisma.organizationInvite.findUnique({
      where: { token },
      include: {
        organization: {
          include: {
            plan: {
              select: {
                organizationSeatLimit: true,
              },
            },
          },
        },
      },
    });

    if (!invite || !invite.organization) {
      return NextResponse.json({ ok: false, error: 'Invitation not found.' }, { status: 404 });
    }

    const providerOrganizationId = invite.organization.clerkOrganizationId ?? invite.organizationId;

    const inviteEmail = normalizeEmail(invite.email);
    if (inviteEmail) {
      if (!viewerEmail) {
        return NextResponse.json({ ok: false, error: 'Verify your email before accepting this invite.' }, { status: 403 });
      }
      if (inviteEmail !== viewerEmail) {
        return NextResponse.json({ ok: false, error: 'This invite is for a different email address.' }, { status: 403 });
      }
    }

    if (invite.status === 'EXPIRED') {
      return NextResponse.json({ ok: false, error: 'This invite has expired. Ask the owner to send a new one.' }, { status: 400 });
    }

    if (invite.status === 'ACCEPTED') {
      return NextResponse.json({ ok: true, alreadyAccepted: true });
    }

    const seats = invite.organization.seatLimit ?? invite.organization.plan?.organizationSeatLimit ?? null;
    if (typeof seats === 'number') {
      const activeMembers = await prisma.organizationMembership.count({ where: { organizationId: invite.organizationId, status: 'ACTIVE' } });
      if (activeMembers >= seats) {
        return NextResponse.json({ ok: false, error: 'No seats remaining in this workspace.' }, { status: 400 });
      }
    }

    const existingMembership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invite.organizationId,
          userId,
        },
      },
    });

    if (!existingMembership) {
      const resolvedRole = invite.role?.toUpperCase() === 'ADMIN' ? 'org:admin' : 'org:member';
      await addOrConfirmClerkMembership({
        organizationId: providerOrganizationId,
        userId,
        role: resolvedRole,
      });
    }

    await syncOrganizationMembership({
      userId,
      organizationId: invite.organizationId,
      clerkOrganizationId: invite.organization.clerkOrganizationId,
      role: invite.role ?? 'MEMBER',
      status: 'ACTIVE',
    });

    // Provision member entitlements for the workspace (tokens, feature flags, etc.).
    // This is intentionally lightweight for now; implement business rules in `provisionMemberEntitlements`.
    try {
      // lazy import to avoid cycles
      const teams = await import('../../../../../lib/teams');
      if (typeof teams.provisionMemberEntitlements === 'function') {
        // pass local organization id so implementation can make DB changes
        await teams.provisionMemberEntitlements(userId, invite.organizationId);
      }
    } catch (err) {
      Logger.info('member provisioning skipped/failed (non-fatal)', { userId, token, error: String(err) });
    }

    await markInviteAccepted(token, userId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const error = toError(err);
    Logger.error('team invite accept failed', { userId, error: error.message });
    return NextResponse.json({ ok: false, error: error.message || 'Unable to accept invite.' }, { status: 400 });
  }
}
