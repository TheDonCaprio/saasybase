import { NextResponse } from 'next/server';
import { getAuthSafe } from '../../../../lib/auth';
import { fetchModeratorPermissions, buildAdminLikePermissions } from '../../../../lib/moderator';
import { prisma } from '../../../../lib/prisma';
import { authService } from '../../../../lib/auth-provider';
import { validateAndFormatPersonName } from '../../../../lib/name-validation';
import { sendNextAuthEmailChangeVerification, sendNextAuthVerificationEmail } from '../../../../lib/nextauth-email-verification';
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
          priceCents: true,
          tokenLimit: true,
          tokenName: true,
          durationHours: true,
          supportsOrganizations: true,
        }
      }
    }
  });

  const ownedOrganizationCount = prisma.organization?.count
    ? await prisma.organization.count({
        where: { ownerUserId: user.id },
      })
    : 0;
  const pendingTeamInviteCount = user.email && prisma.organizationInvite?.count
    ? await prisma.organizationInvite.count({
        where: {
          email: user.email,
          status: 'PENDING',
        },
      })
    : 0;

  // Get user token balances
  const paidTokenBalance = typeof user.tokenBalance === 'number' ? user.tokenBalance : 0;
  const freeTokenBalance = typeof user.freeTokenBalance === 'number' ? user.freeTokenBalance : 0;
  const organizationContext = await getOrganizationPlanContext(user.id, orgId);
  const organizationPlan = organizationContext?.effectivePlan ?? organizationContext?.organization.plan ?? null;
  const sharedTokenBalance = getMemberSharedTokenBalance(organizationContext);
  const memberTokenCap = getEffectiveMemberTokenCap(organizationContext);
  const memberCapStrategy = getMemberCapStrategy(organizationContext);
  const organizationTokenName = organizationPlan?.tokenName?.trim() || defaultTokenLabel;
  const planSource = organizationContext ? 'ORGANIZATION' : subscription ? 'PERSONAL' : 'FREE';
  const hasPaidOrganizationPlan = organizationContext ? Number(organizationPlan?.priceCents ?? 0) > 0 : false;
  const hasPaidPersonalPlan = subscription ? Number(subscription.plan?.priceCents ?? 0) > 0 : false;
  const planActionLabel = planSource === 'FREE'
    ? 'Upgrade'
    : planSource === 'ORGANIZATION'
      ? (hasPaidOrganizationPlan ? 'Change Plan' : 'Upgrade')
      : (hasPaidPersonalPlan ? 'Change Plan' : 'Upgrade');
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
  const hasUnlimitedPaidPlan = Boolean(subscription && subscription.plan?.tokenLimit == null);

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
      isUnlimited: hasUnlimitedPaidPlan,
      displayRemaining: hasUnlimitedPaidPlan ? 'Unlimited' : paidTokenBalance.toLocaleString(),
    },
    subscription: subscription
      ? {
          planName: subscription.plan?.name || 'Pro',
          expiresAt: await formatDateServer(subscription.expiresAt),
          tokenName: paidTokenName,
          tokens: {
            total: subscription.plan?.tokenLimit ?? null,
            used: subscription.plan?.tokenLimit != null ? Math.max(0, subscription.plan.tokenLimit - paidTokenBalance) : null,
            remaining: paidTokenBalance,
            isUnlimited: hasUnlimitedPaidPlan,
            displayRemaining: hasUnlimitedPaidPlan ? 'Unlimited' : paidTokenBalance.toLocaleString(),
          },
        }
      : null,
    organization: organizationContext
      ? {
          id: organizationContext.organization.id,
          name: organizationContext.organization.name,
          role: organizationContext.role,
          planName: organizationPlan?.name || 'Workspace Plan',
          tokenName: organizationTokenName,
          expiresAt: organizationExpiresAt,
          tokenPoolStrategy: organizationContext.organization.tokenPoolStrategy,
          memberTokenCap: organizationContext.organization.memberTokenCap,
          memberCapStrategy: organizationContext.organization.memberCapStrategy,
          memberCapResetIntervalHours: organizationContext.organization.memberCapResetIntervalHours,
          ownerExemptFromCaps: organizationContext.organization.ownerExemptFromCaps,
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
    planActionLabel,
    canCreateOrganization,
    hasPendingTeamInvites: pendingTeamInviteCount > 0,
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

// ---------------------------------------------------------------------------
// PATCH — update profile (name, email)
// ---------------------------------------------------------------------------

export async function PATCH(request: Request) {
  try {
    const { userId } = await getAuthSafe();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, firstName, lastName, email } = body as {
      name?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
    };
    const providerName = authService.providerName;

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, password: true },
    });

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data: Record<string, string> = {};
    let verificationRequired = false;
    let emailChangePending = false;
    let pendingEmail: string | null = null;

    if (typeof name === 'string' || typeof firstName === 'string' || typeof lastName === 'string') {
      const validatedName = validateAndFormatPersonName({
        fullName: typeof name === 'string' ? name : undefined,
        firstName: typeof firstName === 'string' ? firstName : undefined,
        lastName: typeof lastName === 'string' ? lastName : undefined,
      });

      if (!validatedName.ok) {
        return NextResponse.json({ error: validatedName.error || 'Invalid name' }, { status: 400 });
      }

      data.name = validatedName.fullName ?? '';
    }

    if (typeof email === 'string') {
      const trimmed = email.toLowerCase().trim();
      const emailChanged = trimmed.length > 0 && trimmed !== (currentUser.email ?? '').toLowerCase();
      // Check if another user already has this email
      const existing = await prisma.user.findFirst({
        where: { email: trimmed, NOT: { id: userId } },
      });
      if (existing) {
        return NextResponse.json({ error: 'This email is already in use by another account.' }, { status: 409 });
      }

      if (emailChanged && providerName === 'nextauth' && !currentUser.password) {
        return NextResponse.json(
          { error: 'Email changes are only supported for password-based accounts right now.' },
          { status: 400 }
        );
      }

      if (emailChanged && providerName === 'nextauth') {
        verificationRequired = true;
        emailChangePending = true;
        pendingEmail = trimmed;
      } else {
        data.email = trimmed;
      }
    }

    if (Object.keys(data).length === 0 && !emailChangePending) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const updated = Object.keys(data).length > 0
      ? await prisma.user.update({
          where: { id: userId },
          data: {
            ...(Object.prototype.hasOwnProperty.call(data, 'name') ? { name: data.name || null } : {}),
            ...(Object.prototype.hasOwnProperty.call(data, 'email') ? { email: data.email } : {}),
          },
          select: { id: true, name: true, email: true },
        })
      : {
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
        };

    if (emailChangePending && pendingEmail && currentUser.email) {
      sendNextAuthEmailChangeVerification({
        userId: updated.id,
        currentEmail: currentUser.email,
        newEmail: pendingEmail,
        name: updated.name,
      }).catch(() => {});
    } else if (verificationRequired && updated.email) {
      sendNextAuthVerificationEmail({
        userId: updated.id,
        email: updated.email,
        name: updated.name,
      }).catch(() => {});
    }

    return NextResponse.json({ user: updated, verificationRequired, emailChangePending, pendingEmail });
  } catch (error: unknown) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
