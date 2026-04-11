import { NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider/service';
import { prisma } from '../../../../lib/prisma';
import { getPaidTokensNaturalExpiryGraceHours } from '../../../../lib/settings';
import { getOrganizationPlanContext, getSubscriptionScopeFilter } from '../../../../lib/user-plan-context';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await authService.getSession();
  const userId = session.userId;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const activeOrgId = typeof session.orgId === 'string' && session.orgId.trim().length > 0 ? session.orgId : null;
  const organizationContext = activeOrgId ? await getOrganizationPlanContext(userId, activeOrgId) : null;
  const workspaceOrganizationId = organizationContext?.organization.id ?? null;
  const workspaceOwnerUserId = organizationContext?.organization.ownerUserId ?? null;
  const workspaceScope = !!workspaceOrganizationId;
  const scopedUserId = workspaceScope ? (workspaceOwnerUserId ?? userId) : userId;
  const scopeFilter = getSubscriptionScopeFilter(workspaceScope ? 'WORKSPACE' : 'PERSONAL');
  const organizationFilter = workspaceOrganizationId ? { organizationId: workspaceOrganizationId } : {};

  const graceHours = await getPaidTokensNaturalExpiryGraceHours();
  const now = new Date();
  const graceCutoff = new Date(now.getTime() - graceHours * 60 * 60 * 1000);

  // Grace is scoped to the active workspace context.
  const hasValid = await prisma.subscription.findFirst({
    where: {
      userId: scopedUserId,
      ...organizationFilter,
      ...scopeFilter,
      status: { not: 'EXPIRED' },
      expiresAt: { gt: now },
    },
    select: { id: true },
  });

  if (hasValid) {
    return NextResponse.json({ inGrace: false });
  }

  // Grace applies after wall-clock expiry (expiresAt <= now) for ended subscriptions
  // (EXPIRED or CANCELLED) within the configured window.
  const latestEndedWithinGrace = await prisma.subscription.findFirst({
    where: {
      userId: scopedUserId,
      ...organizationFilter,
      ...scopeFilter,
      status: { in: ['EXPIRED', 'CANCELLED'] },
      expiresAt: { gt: graceCutoff, lte: now },
    },
    orderBy: { expiresAt: 'desc' },
    select: {
      id: true,
      expiresAt: true,
      plan: { select: { supportsOrganizations: true, autoRenew: true, name: true } },
    },
  });

  if (!latestEndedWithinGrace?.expiresAt || !latestEndedWithinGrace.id) {
    return NextResponse.json({ inGrace: false });
  }

  const adminActionLog = (prisma as unknown as {
    adminActionLog?: {
      findFirst: (args: Record<string, unknown>) => Promise<{ id: string } | null>;
    };
  }).adminActionLog;

  if (adminActionLog) {
    const immediateAdminTermination = await adminActionLog.findFirst({
      where: {
        targetUserId: scopedUserId,
        createdAt: { gte: graceCutoff },
        OR: [
          {
            action: { in: ['subscriptions.forceCancel', 'subscriptions.expire', 'purchases.expireSubscription'] },
            details: { contains: `"subscriptionId":"${latestEndedWithinGrace.id}"` },
          },
          {
            action: 'payments.refund',
            AND: [
              {
                details: {
                  contains: `"subscriptionId":"${latestEndedWithinGrace.id}"`,
                },
              },
              {
                details: {
                  contains: '"localCancelMode":"immediate"',
                },
              },
            ],
          },
        ],
      },
      select: { id: true },
    });

    if (immediateAdminTermination) {
      return NextResponse.json({ inGrace: false });
    }
  }

  const expiresAt = latestEndedWithinGrace.expiresAt;
  const graceEndsAt = new Date(expiresAt.getTime() + graceHours * 60 * 60 * 1000);

  return NextResponse.json({
    inGrace: true,
    scope: workspaceScope ? 'WORKSPACE' : 'PERSONAL',
    graceHours,
    expiresAt: expiresAt.toISOString(),
    graceEndsAt: graceEndsAt.toISOString(),
    workspace: workspaceOrganizationId
      ? {
          id: workspaceOrganizationId,
          name: organizationContext?.organization.name ?? null,
          role: organizationContext?.role ?? null,
        }
      : null,
    plan: {
      name: latestEndedWithinGrace.plan?.name ?? null,
      supportsOrganizations: Boolean(latestEndedWithinGrace.plan?.supportsOrganizations),
      autoRenew: Boolean(latestEndedWithinGrace.plan?.autoRenew),
    },
  });
}
