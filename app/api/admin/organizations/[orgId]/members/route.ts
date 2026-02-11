import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { requireAdminSectionAccess } from '../../../../../../lib/route-guards';
import { adminRateLimit } from '../../../../../../lib/rateLimit';
import { Logger } from '../../../../../../lib/logger';

export async function GET(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { userId: actorId } = await requireAdminSectionAccess('organizations');
    const params = await context.params;
    const rl = await adminRateLimit(actorId, request, 'admin-orgs:members', { limit: 240, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for org member list', { actorId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: params.orgId },
      select: {
        id: true,
        name: true,
        tokenBalance: true,
        memberTokenCap: true,
        memberCapStrategy: true,
        memberCapResetIntervalHours: true,
        memberships: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } }
          },
          orderBy: { createdAt: 'desc' }
        },
        invites: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const poolBalance = Math.max(0, Number(organization.tokenBalance ?? 0));
    const capResetHours =
      typeof organization.memberCapResetIntervalHours === 'number' ? organization.memberCapResetIntervalHours : null;

    const normalizedStrategy = (organization.memberCapStrategy || 'SOFT').toString().toUpperCase();
    const capStrategy = normalizedStrategy === 'DISABLED' || normalizedStrategy === 'HARD' ? normalizedStrategy : 'SOFT';

    const nowMs = Date.now();

    const members = organization.memberships.map((membership) => {
      const overrideCap = typeof membership.memberTokenCapOverride === 'number' ? membership.memberTokenCapOverride : null;
      const orgCap = typeof organization.memberTokenCap === 'number' ? organization.memberTokenCap : null;
      const effectiveCap = capStrategy === 'DISABLED' ? null : overrideCap ?? orgCap;

      const windowStartMs = membership.memberTokenUsageWindowStart ? membership.memberTokenUsageWindowStart.getTime() : null;
      const windowExpired =
        capResetHours != null && (windowStartMs == null || nowMs - windowStartMs >= capResetHours * 60 * 60 * 1000);

      const usage = windowExpired ? 0 : Math.max(0, Number(membership.memberTokenUsage ?? 0));
      const remaining = effectiveCap == null ? poolBalance : Math.max(0, effectiveCap - usage);
      const sharedTokenBalance = Math.min(poolBalance, remaining);

      return {
        id: membership.id,
        userId: membership.userId,
        role: membership.role,
        status: membership.status,
        sharedTokenBalance,
        memberTokenCapOverride: overrideCap,
        memberTokenUsage: usage,
        memberTokenUsageWindowStart: windowExpired
          ? null
          : membership.memberTokenUsageWindowStart
            ? membership.memberTokenUsageWindowStart.toISOString()
            : null,
        user: membership.user
          ? {
              id: membership.user.id,
              name: membership.user.name,
              email: membership.user.email,
              role: membership.user.role,
            }
          : null,
        createdAt: membership.createdAt.toISOString(),
        updatedAt: membership.updatedAt.toISOString(),
      };
    });

    const invites = organization.invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
      createdAt: invite.createdAt.toISOString(),
    }));

    return NextResponse.json({ organization: { id: organization.id, name: organization.name }, members, invites });
  } catch (error) {
    Logger.error('Failed to load organization members', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to load organization members' }, { status: 500 });
  }
}
