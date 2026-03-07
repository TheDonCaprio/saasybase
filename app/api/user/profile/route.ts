import { NextResponse } from 'next/server';
import { requireUser, getAuthSafe } from '../../../../lib/auth';
import { fetchModeratorPermissions, buildAdminLikePermissions } from '../../../../lib/moderator';
import { prisma } from '../../../../lib/prisma';
import { getDefaultTokenLabel, getPaidTokensNaturalExpiryGraceHours } from '../../../../lib/settings';
import { formatDateServer } from '../../../../lib/formatDate.server';
import {
  getEffectiveMemberTokenCap,
  getMemberCapStrategy,
  getMemberSharedTokenBalance,
  getOrganizationPlanContext,
} from '../../../../lib/user-plan-context';

export async function GET() {
  try {
    const { userId, orgId } = await getAuthSafe();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const defaultTokenLabel = await getDefaultTokenLabel();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tokenBalance: true,
        freeTokenBalance: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get active subscription
    const subscription = await prisma.subscription.findFirst({
    where: {
      userId: user.id,
      status: 'ACTIVE',
      expiresAt: {
        gt: new Date()
      }
    },
    include: {
      plan: {
        select: {
          name: true,
          tokenLimit: true,
          tokenName: true,
          durationHours: true,
          supportsOrganizations: true,
        }
      }
    }
  });

  const ownedOrganizationCount = await prisma.organization.count({
    where: { ownerUserId: user.id },
  });

  // Get user token balances
  const paidTokenBalance = typeof user.tokenBalance === 'number' ? user.tokenBalance : 0;
  const freeTokenBalance = typeof user.freeTokenBalance === 'number' ? user.freeTokenBalance : 0;
  const organizationContext = await getOrganizationPlanContext(user.id, orgId);
  const sharedTokenBalance = getMemberSharedTokenBalance(organizationContext);
  const memberTokenCap = getEffectiveMemberTokenCap(organizationContext);
  const memberCapStrategy = getMemberCapStrategy(organizationContext);
  const organizationTokenName = organizationContext?.organization.plan?.tokenName?.trim() || defaultTokenLabel;
  const planSource = organizationContext ? 'ORGANIZATION' : subscription ? 'PERSONAL' : 'FREE';
  const canCreateOrganization = (subscription?.plan?.supportsOrganizations === true) && ownedOrganizationCount === 0;

    // For provisioned workspace members, surface the workspace plan expiry.
    // The workspace plan is billed on the owner's subscription, not the member.
    let organizationExpiresAt: string | null = null;
    if (organizationContext?.organization?.ownerUserId) {
      const now = new Date();
      const graceHours = await getPaidTokensNaturalExpiryGraceHours();
      const graceCutoff = new Date(now.getTime() - graceHours * 60 * 60 * 1000);
      const ownerSub = await prisma.subscription.findFirst({
        where: {
          userId: organizationContext.organization.ownerUserId,
          plan: { supportsOrganizations: true },
          OR: [
            { status: { not: 'EXPIRED' }, expiresAt: { gt: now } },
            { status: 'EXPIRED', expiresAt: { gt: graceCutoff, lte: now } },
          ],
        },
        orderBy: { expiresAt: 'desc' },
        select: { expiresAt: true },
      });

      organizationExpiresAt = ownerSub?.expiresAt ? await formatDateServer(ownerSub.expiresAt) : null;
    }

    const paidTokenName = subscription?.plan?.tokenName?.trim() || defaultTokenLabel;

    return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    },
      // Include moderator permissions for admins/moderators so client
      // components can filter admin navigation appropriately.
      permissions:
        user.role === 'ADMIN'
          ? buildAdminLikePermissions()
          : user.role === 'MODERATOR'
          ? await fetchModeratorPermissions()
          : undefined,
    paidTokens: {
      tokenName: paidTokenName,
      remaining: paidTokenBalance,
    },
    subscription: subscription
      ? {
          planName: subscription.plan?.name || 'Pro',
          expiresAt: await formatDateServer(subscription.expiresAt),
          tokenName: paidTokenName,
          tokens: {
            // If tokenLimit is null, it's unlimited (show as high number or handle in UI)
            total: subscription.plan?.tokenLimit ?? 999999,
            used: subscription.plan?.tokenLimit ? Math.max(0, subscription.plan.tokenLimit - paidTokenBalance) : 0,
            remaining: paidTokenBalance,
          },
        }
      : null,
    organization: organizationContext
      ? {
          id: organizationContext.organization.id,
          name: organizationContext.organization.name,
          role: organizationContext.role,
          planName: organizationContext.organization.plan?.name || 'Workspace Plan',
          tokenName: organizationTokenName,
          expiresAt: organizationExpiresAt,
          tokenPoolStrategy: organizationContext.organization.tokenPoolStrategy,
          memberTokenCap: organizationContext.organization.memberTokenCap,
          memberCapStrategy: organizationContext.organization.memberCapStrategy,
          memberCapResetIntervalHours: organizationContext.organization.memberCapResetIntervalHours,
        }
      : null,
    sharedTokens:
      sharedTokenBalance != null
        ? {
            tokenName: organizationTokenName,
            remaining: sharedTokenBalance,
            cap: memberTokenCap,
            strategy: memberCapStrategy,
          }
        : null,
    freeTokens: {
      tokenName: defaultTokenLabel,
      total: null as number | null, // callers should lookup free plan settings to format
      remaining: freeTokenBalance,
    },
    planSource,
    canCreateOrganization,
  });
  } catch (error: unknown) {
    // If the error is an auth guard error (no session), return 401 so static export
    // or other non-authenticated callers can continue gracefully.
    try {
      const err = error as { code?: string; status?: number; message?: string };
      if (err && (err.code === 'UNAUTHENTICATED' || err.status === 401)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } catch {
      // fall through to generic handling
    }

    console.error('Profile fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
