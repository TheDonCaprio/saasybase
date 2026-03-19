import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrModerator, toAuthGuardErrorResponse, type UserRole } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { toError } from '../../../../../../lib/runtime-guards';
import { Logger } from '../../../../../../lib/logger';
import { recordAdminAction } from '../../../../../../lib/admin-actions';
import { adminRateLimit } from '../../../../../../lib/rateLimit';
import { paymentService } from '../../../../../../lib/payment/service';
import { syncOrganizationEligibilityForUser } from '../../../../../../lib/organization-access';
import { isProviderSubscriptionActiveStatus } from '../../../../../../lib/payment/subscription-webhook-state';
import type { SubscriptionDetails } from '../../../../../../lib/payment/types';

type EditableSubscriptionStatus = 'ACTIVE' | 'EXPIRED';

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeProviderStatus(status: string | null | undefined): string {
  return (status || '').trim().toLowerCase();
}

function isTerminalProviderStatus(status: string | null | undefined): boolean {
  const normalized = normalizeProviderStatus(status);
  return normalized === 'canceled' || normalized === 'cancelled' || normalized === 'completed' || normalized === 'ended' || normalized === 'expired';
}

function sameMomentWithinMinute(left: Date | null | undefined, right: Date | null | undefined): boolean {
  if (!(left instanceof Date) || !(right instanceof Date)) return false;
  return Math.abs(left.getTime() - right.getTime()) < 60_000;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  let actorId: string;
  let actorRole: UserRole;
  try {
    const ctx = await requireAdminOrModerator('subscriptions');
    actorId = ctx.userId;
    actorRole = ctx.role;
  } catch (err: unknown) {
    const guard = toAuthGuardErrorResponse(err);
    if (guard) return guard;
    const e = toError(err);
    Logger.error('Admin subscription edit auth error', e);
    return NextResponse.json({ ok: false, error: e.message || 'Error' }, { status: 500 });
  }

  const rateLimitResult = await adminRateLimit(actorId, req, 'admin-subscriptions:edit', {
    limit: 60,
    windowMs: 120_000,
  });

  if (!rateLimitResult.success && !rateLimitResult.allowed) {
    Logger.error('Admin subscription edit rate limiter unavailable', { actorId, error: rateLimitResult.error });
    return NextResponse.json({ ok: false, error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
  }

  if (!rateLimitResult.allowed) {
    const retryAfterSeconds = Math.max(0, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
    Logger.warn('Admin subscription edit rate limit exceeded', { actorId, remaining: rateLimitResult.remaining });
    return NextResponse.json({ ok: false, error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
  }

  const params = await context.params;
  const subscriptionId = params.id;

  let desiredStatus: EditableSubscriptionStatus | null = null;
  let desiredExpiresAt: Date | null = null;
  let allowLocalOverride = false;
  let clearScheduledCancellation = false;

  try {
    const body = await req.json().catch(() => ({}));
    desiredStatus = body?.status === 'ACTIVE' || body?.status === 'EXPIRED' ? body.status : null;
    desiredExpiresAt = parseIsoDate(body?.expiresAt);
    if (body?.expiresAt && !desiredExpiresAt) {
      return NextResponse.json({ ok: false, error: 'Invalid billing date supplied.' }, { status: 400 });
    }
    allowLocalOverride = body?.allowLocalOverride === true;
    clearScheduledCancellation = body?.clearScheduledCancellation === true;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  if (!desiredStatus && !desiredExpiresAt && !clearScheduledCancellation) {
    return NextResponse.json({ ok: false, error: 'No subscription changes were supplied.' }, { status: 400 });
  }

  try {
    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            autoRenew: true,
          },
        },
      },
    });

    if (!sub) {
      return NextResponse.json({ ok: false, error: 'Subscription not found' }, { status: 404 });
    }

    const providerSubscriptionId = sub.externalSubscriptionId?.trim() || null;
    const provider = paymentService.getProviderForRecord(sub.paymentProvider);
    const warnings: string[] = [];
    let providerSnapshot: SubscriptionDetails | null = null;
    let providerFetchError: string | null = null;

    if (providerSubscriptionId) {
      try {
        providerSnapshot = await provider.getSubscription(providerSubscriptionId);
      } catch (err: unknown) {
        providerFetchError = toError(err).message;
        Logger.warn('Admin subscription edit could not fetch provider subscription', {
          actorId,
          subscriptionId,
          providerSubscriptionId,
          providerName: provider.name,
          error: providerFetchError,
        });
      }
    }

    if (providerSubscriptionId && providerFetchError && !allowLocalOverride) {
      return NextResponse.json({
        ok: false,
        error: `Unable to verify the current ${provider.name} subscription state. Retry later or enable local override.`,
      }, { status: 502 });
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {};
    let providerUndoApplied = false;

    const providerHasScheduledCancellation = providerSnapshot?.cancelAtPeriodEnd === true;
    const shouldAttemptUndo = Boolean(providerSubscriptionId)
      && (clearScheduledCancellation || desiredStatus === 'ACTIVE')
      && providerHasScheduledCancellation;

    if (shouldAttemptUndo && providerSubscriptionId) {
      try {
        const undoResult = await provider.undoCancelSubscription(providerSubscriptionId);
        providerUndoApplied = true;
        providerSnapshot = providerSnapshot
          ? {
              ...providerSnapshot,
              status: undoResult.status || providerSnapshot.status,
              currentPeriodEnd: undoResult.currentPeriodEnd ?? undoResult.expiresAt ?? providerSnapshot.currentPeriodEnd,
              cancelAtPeriodEnd: false,
              canceledAt: undoResult.canceledAt ?? null,
            }
          : null;
      } catch (err: unknown) {
        const error = toError(err);
        if (!allowLocalOverride) {
          return NextResponse.json({
            ok: false,
            error: `Unable to clear the scheduled cancellation at ${provider.name}: ${error.message}`,
          }, { status: 409 });
        }
        warnings.push(`Provider cancellation flag could not be cleared at ${provider.name}; applying a local override only.`);
      }
    }

    if (clearScheduledCancellation) {
      updateData.cancelAtPeriodEnd = false;
      updateData.canceledAt = null;
    }

    if (desiredStatus === 'ACTIVE') {
      if (providerSnapshot && isTerminalProviderStatus(providerSnapshot.status)) {
        return NextResponse.json({
          ok: false,
          error: `${provider.name} reports this subscription as terminal (${providerSnapshot.status}). Create a new subscription instead of reactivating this one.`,
        }, { status: 409 });
      }

      const providerPeriodEnd = providerSnapshot?.currentPeriodEnd ?? null;
      const effectiveExpiresAt = desiredExpiresAt ?? providerPeriodEnd ?? sub.expiresAt;

      if (!(effectiveExpiresAt instanceof Date) || effectiveExpiresAt.getTime() <= now.getTime()) {
        return NextResponse.json({
          ok: false,
          error: 'Reactivating a subscription requires a future billing date.',
        }, { status: 409 });
      }

      if (providerSnapshot && desiredExpiresAt && !sameMomentWithinMinute(desiredExpiresAt, providerPeriodEnd) && !allowLocalOverride) {
        return NextResponse.json({
          ok: false,
          error: `The requested billing date differs from ${provider.name}'s current period end. Enable local override to save a local-only date.` ,
        }, { status: 409 });
      }

      if (providerSnapshot && desiredExpiresAt && !sameMomentWithinMinute(desiredExpiresAt, providerPeriodEnd) && allowLocalOverride) {
        warnings.push(`Saved a local billing date that differs from ${provider.name}'s current period end.`);
      }

      if (providerFetchError && allowLocalOverride && providerSubscriptionId) {
        warnings.push(`Provider state could not be verified at ${provider.name}; local reactivation was applied.`);
      }

      updateData.status = 'ACTIVE';
      updateData.expiresAt = effectiveExpiresAt;
      if (clearScheduledCancellation || providerUndoApplied || providerSnapshot?.cancelAtPeriodEnd !== true) {
        updateData.cancelAtPeriodEnd = false;
        updateData.canceledAt = null;
      }
    }

    if (desiredStatus === 'EXPIRED') {
      if (providerSnapshot && isProviderSubscriptionActiveStatus(providerSnapshot.status) && !allowLocalOverride) {
        return NextResponse.json({
          ok: false,
          error: `${provider.name} still reports this subscription as active. Use force cancel, schedule cancel, or enable local override to expire it locally.`,
        }, { status: 409 });
      }

      if (providerSnapshot && isProviderSubscriptionActiveStatus(providerSnapshot.status) && allowLocalOverride) {
        warnings.push(`Expired locally while ${provider.name} still reports the subscription as active.`);
      }

      const effectiveExpiry = desiredExpiresAt && desiredExpiresAt.getTime() <= now.getTime()
        ? desiredExpiresAt
        : (sub.expiresAt && sub.expiresAt.getTime() <= now.getTime() ? sub.expiresAt : now);

      updateData.status = 'EXPIRED';
      updateData.expiresAt = effectiveExpiry;
      updateData.canceledAt = sub.canceledAt ?? now;
      updateData.cancelAtPeriodEnd = false;
    }

    if (!desiredStatus && desiredExpiresAt) {
      const providerPeriodEnd = providerSnapshot?.currentPeriodEnd ?? null;
      if (providerSnapshot && !sameMomentWithinMinute(desiredExpiresAt, providerPeriodEnd) && !allowLocalOverride) {
        return NextResponse.json({
          ok: false,
          error: `The requested billing date differs from ${provider.name}'s current period end. Enable local override to save a local-only date.`,
        }, { status: 409 });
      }

      if (providerSnapshot && !sameMomentWithinMinute(desiredExpiresAt, providerPeriodEnd) && allowLocalOverride) {
        warnings.push(`Saved a local billing date that differs from ${provider.name}'s current period end.`);
      }

      updateData.expiresAt = desiredExpiresAt;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ ok: true, unchanged: true, warning: warnings.join(' ') || null });
    }

    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: updateData,
      select: {
        id: true,
        status: true,
        expiresAt: true,
        canceledAt: true,
        cancelAtPeriodEnd: true,
        userId: true,
      },
    });

    try {
      await syncOrganizationEligibilityForUser(sub.userId, { ignoreGrace: desiredStatus === 'EXPIRED' });
    } catch (err: unknown) {
      const error = toError(err);
      warnings.push('Subscription updated, but organization access could not be synchronized immediately.');
      Logger.warn('Failed to sync organization eligibility after admin subscription edit', {
        actorId,
        subscriptionId,
        userId: sub.userId,
        error: error.message,
      });
    }

    await recordAdminAction({
      actorId,
      actorRole,
      action: 'subscriptions.edit',
      targetUserId: sub.userId,
      targetType: 'subscription',
      details: {
        subscriptionId: sub.id,
        providerName: sub.paymentProvider || provider.name,
        providerSubscriptionId,
        previousStatus: sub.status,
        previousExpiresAt: sub.expiresAt?.toISOString() ?? null,
        previousCanceledAt: sub.canceledAt?.toISOString() ?? null,
        previousCancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        requestedStatus: desiredStatus,
        requestedExpiresAt: desiredExpiresAt?.toISOString() ?? null,
        clearScheduledCancellation,
        allowLocalOverride,
        providerStatus: providerSnapshot?.status ?? null,
        providerPeriodEnd: providerSnapshot?.currentPeriodEnd?.toISOString() ?? null,
        newStatus: updated.status,
        newExpiresAt: updated.expiresAt?.toISOString() ?? null,
        newCanceledAt: updated.canceledAt?.toISOString() ?? null,
        newCancelAtPeriodEnd: updated.cancelAtPeriodEnd,
        warnings,
      },
    });

    Logger.info('Admin edited subscription', {
      actorId,
      subscriptionId,
      desiredStatus,
      allowLocalOverride,
      warnings,
    });

    return NextResponse.json({
      ok: true,
      warning: warnings.join(' ') || null,
      subscription: {
        id: updated.id,
        status: updated.status,
        expiresAt: updated.expiresAt?.toISOString() ?? null,
        canceledAt: updated.canceledAt?.toISOString() ?? null,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      },
    });
  } catch (err: unknown) {
    const error = toError(err);
    Logger.error('Admin subscription edit error', {
      subscriptionId,
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json({ ok: false, error: error.message || 'Failed to update subscription' }, { status: 500 });
  }
}