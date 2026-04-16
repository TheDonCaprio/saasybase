import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@/lib/prisma-client';
import { requireAdminOrModerator, toAuthGuardErrorResponse, type UserRole } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/prisma';
import { authService } from '@/lib/auth-provider';
import { asRecord, toError } from '../../../../../lib/runtime-guards';
import { Logger } from '../../../../../lib/logger';
import { adminRateLimit } from '../../../../../lib/rateLimit';
import { sendBillingNotification, sendAdminNotificationEmail } from '../../../../../lib/notifications';
import { getSiteName } from '../../../../../lib/email';
import { recordAdminAction } from '../../../../../lib/admin-actions';
import { getDefaultTokenLabel, SETTING_DEFAULTS, SETTING_KEYS } from '../../../../../lib/settings';
import { shouldClearPaidTokensOnExpiry } from '../../../../../lib/paidTokens';
import { syncOrganizationEligibilityForUser } from '../../../../../lib/organization-access';
import { resetOrganizationSharedTokens } from '../../../../../lib/teams';
import { getProviderCurrency } from '../../../../../lib/payment/registry';
import { getCurrentProviderKey } from '../../../../../lib/utils/provider-ids';
import { getUserSuspensionDetails } from '../../../../../lib/account-suspension';

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  const params = await ctx.params;
  try {
    let actorId: string;
    let actorRole: UserRole;
    try {
      const actor = await requireAdminOrModerator('users');
      actorId = actor.userId;
      actorRole = actor.role;
    } catch (err: unknown) {
      const guard = toAuthGuardErrorResponse(err);
      if (guard) return guard;
      const e = toError(err);
      Logger.error('Admin user action auth error', { error: e.message });
      return NextResponse.json({ error: 'Service temporarily unavailable.' }, { status: 500 });
    }
    const rl = await adminRateLimit(actorId, request, 'admin-users:action', { limit: 60, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for admin user action', { actorId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }
    const isAdmin = actorRole === 'ADMIN';

    const body = (await request.json()) as unknown;
    const bodyRec = asRecord(body) ?? {};
    const action = typeof bodyRec.action === 'string' ? bodyRec.action : undefined;
    const requestedRole = typeof bodyRec.role === 'string' ? (bodyRec.role as string) : undefined;
    const data = bodyRec.data ?? undefined;
    const dataRec = asRecord(data) ?? {};

    const actionKey = action ?? '';
    const adminOnlyActions = new Set(['updateRole']);
    if (!isAdmin && adminOnlyActions.has(actionKey)) {
      return NextResponse.json({ error: 'Only admins can perform this action' }, { status: 403 });
    }

    if (action === 'setSuspension') {
      if (params.userId === actorId) {
        return NextResponse.json({ error: 'You cannot suspend your own account.' }, { status: 400 });
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: params.userId },
        select: {
          id: true,
          role: true,
        },
      });

      if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      if (!isAdmin && targetUser.role === 'ADMIN') {
        return NextResponse.json({ error: 'Only admins can suspend admin accounts' }, { status: 403 });
      }

      const reason = typeof dataRec.reason === 'string' ? dataRec.reason.trim() : '';
      if (!reason) {
        return NextResponse.json({ error: 'A suspension reason is required' }, { status: 400 });
      }

      const permanent = dataRec.permanent === true;
      const updatedUser = await prisma.user.update({
        where: { id: params.userId },
        data: {
          suspendedAt: new Date(),
          suspensionReason: reason,
          suspensionIsPermanent: permanent,
          sessions: {
            deleteMany: {},
          },
        },
        select: {
          id: true,
          suspendedAt: true,
          suspensionReason: true,
          suspensionIsPermanent: true,
        },
      });

      await recordAdminAction({
        actorId,
        actorRole,
        action: 'users.suspend',
        targetUserId: params.userId,
        details: {
          permanent,
          reason,
        }
      });

      const suspension = await getUserSuspensionDetails(updatedUser);
      return NextResponse.json({
        success: true,
        user: {
          id: updatedUser.id,
          suspendedAt: updatedUser.suspendedAt?.toISOString() ?? null,
          suspensionReason: updatedUser.suspensionReason,
          suspensionIsPermanent: updatedUser.suspensionIsPermanent,
        },
        suspension: {
          code: suspension.code,
          message: suspension.message,
        },
      });
    }

    if (action === 'clearSuspension') {
      const targetUser = await prisma.user.findUnique({
        where: { id: params.userId },
        select: {
          id: true,
          role: true,
        },
      });

      if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      if (!isAdmin && targetUser.role === 'ADMIN') {
        return NextResponse.json({ error: 'Only admins can restore admin accounts' }, { status: 403 });
      }

      const updatedUser = await prisma.user.update({
        where: { id: params.userId },
        data: {
          suspendedAt: null,
          suspensionReason: null,
          suspensionIsPermanent: false,
        },
        select: {
          id: true,
          suspendedAt: true,
          suspensionReason: true,
          suspensionIsPermanent: true,
        },
      });

      await recordAdminAction({
        actorId,
        actorRole,
        action: 'users.unsuspend',
        targetUserId: params.userId,
      });

      return NextResponse.json({
        success: true,
        user: {
          id: updatedUser.id,
          suspendedAt: null,
          suspensionReason: null,
          suspensionIsPermanent: false,
        },
      });
    }

    if (action === 'updateProfile') {
      const firstName = typeof dataRec?.firstName === 'string' ? dataRec.firstName : undefined;
      const lastName = typeof dataRec?.lastName === 'string' ? dataRec.lastName : undefined;
      const emailRaw = typeof dataRec?.email === 'string' ? dataRec.email : undefined;
      const emailNormalized = emailRaw?.trim();
      const emailToPersist = emailRaw === undefined
        ? undefined
        : emailNormalized && emailNormalized.length > 0
          ? emailNormalized
          : null;
      const newRole = typeof dataRec?.role === 'string' ? dataRec.role : undefined;

      const targetUser = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { id: true, role: true, email: true },
      });

      if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      if (!isAdmin && targetUser.role === 'ADMIN') {
        if (emailToPersist !== undefined) {
          const originalEmail = targetUser.email ?? '';
          const requestedEmail = emailToPersist ?? '';
          if (requestedEmail !== originalEmail) {
            return NextResponse.json({ error: 'Only admins can change the email for admin accounts' }, { status: 403 });
          }
        }
      }

      try {
        // Update user in Clerk (best-effort)
        try {
          await authService.updateUser(params.userId, {
            firstName: firstName ?? undefined,
            lastName: lastName ?? undefined,
          });
        } catch (clerkError) {
          Logger.warn('Clerk update failed for admin user update', { error: toError(clerkError) });
        }

        // Update user in our database
        const updatePayload: Record<string, unknown> = {
          name: `${firstName || ''} ${lastName || ''}`.trim() || null,
        };

        if (emailToPersist !== undefined) {
          updatePayload.email = emailToPersist;
        }

        if (isAdmin && newRole) {
          updatePayload.role = newRole;
        }

        const user = await prisma.user.update({
          where: { id: params.userId },
          data: updatePayload,
          select: { id: true, email: true, name: true, role: true, createdAt: true }
        });

        await recordAdminAction({
          actorId,
          actorRole,
          action: 'users.updateProfile',
          targetUserId: params.userId,
          details: {
            firstName,
            lastName,
            email: emailToPersist,
            roleChanged: isAdmin && newRole ? newRole : undefined,
            clerkSynced: true
          }
        });

        return NextResponse.json({ success: true, user });
      } catch (clerkError) {
        Logger.warn('Clerk update error - falling back to DB-only update', { error: toError(clerkError) });
        // Still update our database even if Clerk fails
        const updatePayload: Record<string, unknown> = {
          name: `${firstName || ''} ${lastName || ''}`.trim() || null,
        };
        if (emailToPersist !== undefined) {
          updatePayload.email = emailToPersist;
        }
        if (isAdmin && newRole) {
          updatePayload.role = newRole;
        }

        const user = await prisma.user.update({
          where: { id: params.userId },
          data: updatePayload,
          select: { id: true, email: true, name: true, role: true, createdAt: true }
        });

        await recordAdminAction({
          actorId,
          actorRole,
          action: 'users.updateProfile',
          targetUserId: params.userId,
          details: {
            firstName,
            lastName,
            email: emailToPersist,
            roleChanged: isAdmin && newRole ? newRole : undefined,
            clerkSynced: false
          }
        });

        return NextResponse.json({
          success: true,
          user,
          warning: 'Updated database but Clerk update failed'
        });
      }
    }

    if (action === 'adjustTokens') {
      const amountRaw = dataRec.amount;
      const reasonRaw = dataRec.reason;
      const amount = typeof amountRaw === 'number' ? Math.trunc(amountRaw) : Number(amountRaw ?? NaN);
      if (!Number.isFinite(amount) || amount === 0) {
        return NextResponse.json({ error: 'Amount must be a non-zero integer' }, { status: 400 });
      }

      const reason = typeof reasonRaw === 'string' && reasonRaw.trim().length > 0 ? reasonRaw.trim() : undefined;

      const delta = amount;
      const { user: updatedUser, newBalance } = await prisma.$transaction(async (tx) => {
        const userBefore = await tx.user.findUnique({ where: { id: params.userId }, select: { tokenBalance: true } });
        if (!userBefore) {
          throw new Error('User not found');
        }

        const computedBalance = Math.max(userBefore.tokenBalance + delta, 0);
        const user = await tx.user.update({
          where: { id: params.userId },
          data: { tokenBalance: computedBalance }
        });

        return { user, newBalance: computedBalance };
      });

      let actorProfileName: string | null = null;
      let actorProfileEmail: string | null = null;
      try {
        const actorProfile = await prisma.user.findUnique({
          where: { id: actorId },
          select: { name: true, email: true },
        });
        actorProfileName = actorProfile?.name ?? null;
        actorProfileEmail = actorProfile?.email ?? null;
      } catch (profileError) {
        Logger.warn('Failed to load actor profile for token adjustment email', {
          actorId,
          error: toError(profileError).message,
        });
      }

      const actorDisplayName = (actorProfileName?.trim() || actorProfileEmail?.trim()) || actorId;

      // Resolve token label from user's active subscription plan or global default
      let tokenLabel = 'tokens'; // fallback
      try {
        const activeSubscription = await prisma.subscription.findFirst({
          where: {
            userId: params.userId,
            status: 'ACTIVE',
            expiresAt: { gt: new Date() }
          },
          select: { plan: { select: { tokenName: true } } },
          orderBy: { startedAt: 'desc' }
        });

        if (activeSubscription?.plan?.tokenName) {
          tokenLabel = activeSubscription.plan.tokenName;
        } else {
          tokenLabel = await getDefaultTokenLabel();
        }
      } catch (labelError) {
        Logger.warn('Failed to resolve token label for adjustment notification', {
          userId: params.userId,
          error: toError(labelError).message,
        });
        // Will use fallback 'tokens' from above
      }

      try {
        const capitalizedLabel = tokenLabel.charAt(0).toUpperCase() + tokenLabel.slice(1);
        const title = delta > 0 ? `${capitalizedLabel} Credited` : `${capitalizedLabel} Debited`;
        const message = delta > 0
          ? `${Math.abs(delta)} ${tokenLabel} were added to your account${reason ? `: ${reason}` : ''}.`
          : `${Math.abs(delta)} ${tokenLabel} were deducted from your account${reason ? `: ${reason}` : ''}.`;
        const siteName = (await getSiteName()) || process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME];
        await sendBillingNotification({
          userId: params.userId,
          title,
          message,
          templateKey: delta > 0 ? 'tokens_credited' : 'tokens_debited',
          variables: {
            tokenName: tokenLabel,
            tokenDelta: String(delta),
            tokenBalance: String(newBalance),
            reason: reason || '',
            siteName,
          }
        });
      } catch (notifyError) {
        Logger.warn('User token adjustment notification failed', { error: toError(notifyError).message, userId: params.userId });
      }

      const adminEventTitle = delta > 0 ? `Manual ${tokenLabel} credited` : `Manual ${tokenLabel} debited`;
      const adminEventSummary = reason
        ? `${actorDisplayName} ${delta > 0 ? 'credited' : 'debited'} ${Math.abs(delta)} ${tokenLabel} for user ${params.userId}. New balance: ${newBalance}. Reason: ${reason}.`
        : `${actorDisplayName} ${delta > 0 ? 'credited' : 'debited'} ${Math.abs(delta)} ${tokenLabel} for user ${params.userId}. New balance: ${newBalance}. No reason provided.`;

      try {
        await sendAdminNotificationEmail({
          userId: params.userId,
          title: adminEventTitle,
          message: adminEventSummary,
          alertType: 'other',
          templateKey: 'admin_notification',
          variables: {
            eventTitle: adminEventTitle,
            eventSummary: adminEventSummary,
            tokenName: tokenLabel,
            tokenDelta: String(delta),
            tokenBalance: String(newBalance),
            reason: reason || undefined,
            actionText: 'Review user account',
            actorName: actorProfileName ?? undefined,
            actorEmail: actorProfileEmail ?? undefined,
            actorRole,
          },
          actorId,
          actorRole,
          actorName: actorProfileName ?? actorDisplayName,
          actorEmail: actorProfileEmail ?? undefined,
        });
      } catch (adminNotifyError) {
        Logger.warn('Admin token adjustment notification failed', { error: toError(adminNotifyError).message, userId: params.userId });
      }

      await recordAdminAction({
        actorId,
        actorRole,
        action: 'users.adjustTokens',
        targetUserId: params.userId,
        details: {
          delta,
          reason: reason ?? null,
          newBalance
        }
      });

      return NextResponse.json({ success: true, user: { id: updatedUser.id, tokenBalance: newBalance } });
    }

    if (action === 'assignPlan') {
      const planId = typeof dataRec.planId === 'string' ? dataRec.planId : undefined;
      if (!planId) {
        return NextResponse.json({ error: 'planId is required' }, { status: 400 });
      }

      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + plan.durationHours * 60 * 60 * 1000);

      const result = await prisma.$transaction(async (tx) => {
        const existingActive = await tx.subscription.findFirst({
          where: { userId: params.userId, status: 'ACTIVE' },
          orderBy: { expiresAt: 'desc' }
        });

        let subscription;
        if (existingActive) {
          const base = existingActive.expiresAt > now ? existingActive.expiresAt : now;
          const extended = new Date(base.getTime() + plan.durationHours * 60 * 60 * 1000);
          subscription = await tx.subscription.update({
            where: { id: existingActive.id },
            data: {
              planId: plan.id,
              status: 'ACTIVE',
              startedAt: now,
              expiresAt: extended
            }
          });
        } else {
          subscription = await tx.subscription.create({
            data: {
              userId: params.userId,
              planId: plan.id,
              status: 'ACTIVE',
              startedAt: now,
              expiresAt
            }
          });
        }

        if (plan.tokenLimit && plan.tokenLimit > 0) {
          await tx.user.update({
            where: { id: params.userId },
            data: { tokenBalance: { increment: plan.tokenLimit } }
          });
        }

        await tx.payment.create({
          data: {
            userId: params.userId,
            subscriptionId: subscription.id,
            planId: plan.id,
            amountCents: plan.priceCents,
            status: 'SUCCEEDED',
            currency: getProviderCurrency(getCurrentProviderKey()),
            subtotalCents: plan.priceCents,
            discountCents: 0
          }
        });
        // Increment denormalized paymentsCount for this user
        await tx.user.update({ where: { id: params.userId }, data: ({ paymentsCount: { increment: 1 } } as unknown) as Prisma.UserUpdateInput });

        const updatedUser = await tx.user.findUnique({
          where: { id: params.userId },
          include: {
            subscriptions: {
              orderBy: { createdAt: 'desc' },
              include: { plan: true }
            }
          }
        });

        if (!updatedUser) throw new Error('User not found after plan assignment');

        return { updatedUser, subscription };
      });

      const assignedUser = result.updatedUser;

      const siteName = (await getSiteName()) || process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME];
      const planTokenName = typeof plan.tokenName === 'string' ? plan.tokenName.trim() : '';
      const tokenName = planTokenName || await getDefaultTokenLabel();

      await sendBillingNotification({
        userId: params.userId,
        title: 'Plan Assigned',
        message: `You have been assigned the ${plan.name} plan. Your access is active now.`,
        templateKey: 'admin_assigned_plan',
        variables: {
          planName: plan.name,
          durationHours: String(plan.durationHours),
          expiresAt: result.subscription.expiresAt.toISOString(),
          tokenName,
          tokenDelta: String(plan.tokenLimit ?? 0),
          tokenBalance: String(assignedUser.tokenBalance),
          siteName,
        }
      });

      await recordAdminAction({
        actorId,
        actorRole,
        action: 'users.assignPlan',
        targetUserId: params.userId,
        details: {
          planId: plan.id,
          planName: plan.name,
          subscriptionId: result.subscription.id,
          tokenDelta: plan.tokenLimit ?? 0
        }
      });

      return NextResponse.json({
        success: true,
        user: {
          id: assignedUser.id,
          tokenBalance: assignedUser.tokenBalance,
          subscriptions: assignedUser.subscriptions.map((s) => ({
            id: s.id,
            status: s.status,
            plan: s.plan ? { id: s.plan.id, name: s.plan.name ?? null, durationHours: s.plan.durationHours } : null,
            createdAt: s.createdAt,
            expiresAt: s.expiresAt,
          }))
        }
      });
    }

    if (action === 'updateRole') {
      if (!isAdmin) {
        return NextResponse.json({ error: 'Only admins can update roles' }, { status: 403 });
      }
      if (!requestedRole || !['USER', 'ADMIN'].includes(requestedRole)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }

      const user = await prisma.user.update({
        where: { id: params.userId },
        data: { role: requestedRole },
        select: { id: true, email: true, role: true, createdAt: true }
      });

      await recordAdminAction({
        actorId,
        actorRole,
        action: 'users.updateRole',
        targetUserId: params.userId,
        details: { role: requestedRole }
      });

      return NextResponse.json({ success: true, user });
    }

    if (action === 'expireSubscription') {
      // Allow admin to optionally control whether paid tokens are cleared when expiring user subscriptions
      const clearPaidTokensFlag = Boolean(dataRec?.clearPaidTokens === true);

      const subsToExpire = await prisma.subscription.findMany({
        where: { userId: params.userId, status: 'ACTIVE' },
        select: { organizationId: true, plan: { select: { supportsOrganizations: true } } }
      });

      const result = await prisma.subscription.updateMany({
        where: { userId: params.userId, status: 'ACTIVE' },
        data: { status: 'EXPIRED', expiresAt: new Date() }
      });

      if (result.count > 0) {
        try {
          // Evaluate centralized precedence: explicit request flag -> per-subscription intent -> per-user/global fallback
          const shouldClear = await shouldClearPaidTokensOnExpiry({ userId: params.userId, requestFlag: clearPaidTokensFlag });
          if (shouldClear) {
            await prisma.user.update({ where: { id: params.userId }, data: { tokenBalance: 0 } });

            const orgIds = subsToExpire
              .filter(s => Boolean(s.organizationId) && Boolean(s.plan?.supportsOrganizations))
              .map(s => s.organizationId)
              .filter((id): id is string => typeof id === 'string' && id.length > 0);

            if (orgIds.length > 0) {
              for (const orgId of Array.from(new Set(orgIds))) {
                await resetOrganizationSharedTokens({ organizationId: orgId });
              }
            }
          } else {
            Logger.info('Skipping paid token clear for users.expireSubscriptions (shouldClear=false)', { userId: params.userId, affected: result.count });
          }
        } catch (err: unknown) {
          Logger.warn('Failed to reset paid token balance during users.expireSubscriptions', { userId: params.userId, affected: result.count, error: String(err) });
        }

        try {
          await syncOrganizationEligibilityForUser(params.userId, { ignoreGrace: true });
        } catch (err: unknown) {
          Logger.warn('Failed to sync organization eligibility after admin expired user subscriptions', {
            userId: params.userId,
            error: String(err)
          });
        }
      }

      await recordAdminAction({
        actorId,
        actorRole,
        action: 'users.expireSubscriptions',
        targetUserId: params.userId,
        details: { affectedSubscriptions: result.count, clearPaidTokens: clearPaidTokensFlag }
      });

      return NextResponse.json({ success: true, message: 'User subscriptions expired' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    Logger.error('Admin user action error', { error: toError(error) });
    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  const params = await ctx.params;
  try {
    const actor = await requireAdminOrModerator('users');
    if (actor.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only admins can delete users' }, { status: 403 });
    }
    const actorId = actor.userId;

    // Rate limit delete operations separately
    const dl = await adminRateLimit(actorId, request, 'admin-users:delete', { limit: 10, windowMs: 120_000 });
    if (!dl.success && !dl.allowed) {
      Logger.error('Rate limiter unavailable for user delete', { actorId, error: dl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!dl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((dl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    if (params.userId === actorId) {
      return NextResponse.json({ error: 'You cannot delete the currently signed-in admin.' }, { status: 400 });
    }

    // Remove or detach dependent records before deleting the user to satisfy FK constraints.
    await prisma.$transaction(async (tx) => {
      await tx.ticketReply.updateMany({ where: { userId: params.userId }, data: { userId: null } });
      await tx.emailLog.updateMany({ where: { userId: params.userId }, data: { userId: null } });
      await tx.visitLog.updateMany({ where: { userId: params.userId }, data: { userId: null } });

      await tx.ticketReply.deleteMany({ where: { ticket: { userId: params.userId } } });
      await tx.notification.deleteMany({ where: { userId: params.userId } });
      await tx.featureUsageLog.deleteMany({ where: { userId: params.userId } });
      await tx.userSetting.deleteMany({ where: { userId: params.userId } });
      await tx.couponRedemption.deleteMany({ where: { userId: params.userId } });
      await tx.payment.deleteMany({ where: { userId: params.userId } });
      await tx.subscription.deleteMany({ where: { userId: params.userId } });
      await tx.supportTicket.deleteMany({ where: { userId: params.userId } });

      await tx.user.delete({ where: { id: params.userId } });
    });

    try {
      await authService.deleteUser(params.userId);
    } catch (clerkError) {
      Logger.warn('Failed to delete Clerk user during admin delete', { error: toError(clerkError) });
    }

    await recordAdminAction({
      actorId,
      actorRole: actor.role,
      action: 'users.delete',
      targetUserId: params.userId
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    Logger.error('Admin user delete error', { error: toError(error) });
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}

// Get user details with subscription info
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  const params = await ctx.params;
  try {
    await requireAdminOrModerator('users');

    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' }
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Narrow results for serialization safety
    const safeUser = {
      id: user.id,
      email: user.email ?? null,
      name: user.name ?? null,
      role: user.role,
      suspendedAt: user.suspendedAt?.toISOString?.() ?? null,
      suspensionReason: user.suspensionReason ?? null,
      suspensionIsPermanent: user.suspensionIsPermanent === true,
      tokenBalance: user.tokenBalance,
      createdAt: user.createdAt?.toISOString?.() ?? null,
      subscriptions: Array.isArray(user.subscriptions)
        ? user.subscriptions.map((s) => ({
          id: s.id,
          status: s.status,
          plan: s.plan ? { id: s.plan.id, name: s.plan.name ?? null } : null,
          createdAt: s.createdAt?.toISOString?.() ?? null,
        }))
        : [],
      payments: Array.isArray(user.payments)
        ? user.payments.map((p) => {
          const pRec = asRecord(p) ?? {};
          const rawAmount = pRec.amountCents;
          const amountCents = typeof rawAmount === 'number' ? rawAmount : (typeof rawAmount === 'string' && rawAmount.trim() !== '' ? Number(rawAmount) : null);
          const currency = typeof pRec.currency === 'string' ? pRec.currency : null;
          return { id: p.id, amountCents, currency, createdAt: p.createdAt?.toISOString?.() ?? null };
        })
        : []
    };

    return NextResponse.json({ user: safeUser });
  } catch (error) {
    Logger.error('Admin user details error', { error: toError(error) });
    return NextResponse.json({ error: 'Failed to fetch user details' }, { status: 500 });
  }
}
