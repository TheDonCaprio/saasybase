import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { CheckoutSessionDetails } from '../../../../lib/payment/types';
import { StandardizedCheckoutSession } from '../../../../lib/payment/types';
import { prisma } from '../../../../lib/prisma';
import { updateSubscriptionLastPaymentAmount } from '../../../../lib/payments';
import { toError } from '../../../../lib/runtime-guards';
import { Logger } from '../../../../lib/logger';
import { shouldClearPaidTokensOnExpiry } from '../../../../lib/paidTokens';
import { maybeClearPaidTokensAfterNaturalExpiryGrace } from '../../../../lib/paidTokenCleanup';
import { syncOrganizationEligibilityForUser } from '../../../../lib/organization-access';
import { creditOrganizationSharedTokens, resetOrganizationSharedTokens } from '../../../../lib/teams';
import { paymentService } from '../../../../lib/payment/service';
import { PaymentProviderFactory } from '../../../../lib/payment/factory';
import type { Prisma } from '@prisma/client';
import { canUseLocalhostDevBypass } from '../../../../lib/dev-admin-bypass';

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status });
}

function resolveActiveOrganizationId(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const candidates = [
    metadata.activeOrganizationId,
    metadata.organizationId,
    metadata.activeProviderOrganizationId,
    metadata.activeClerkOrgId,
    metadata.clerkOrgId,
    metadata.orgId,
    metadata.active_org_id,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

async function resolveRazorpaySessionId(paymentId: string): Promise<string | null> {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  if (!keyId || !keySecret) {
    Logger.warn('Razorpay credentials missing for session resolution', { paymentId });
    return null;
  }

  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`, 'utf8').toString('base64');
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      Logger.warn('Razorpay API returned non-OK status', { paymentId, status: res.status });
      return null;
    }
    const data = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!data || typeof data !== 'object') {
      Logger.warn('Razorpay API returned invalid data', { paymentId });
      return null;
    }
    
    Logger.debug('Razorpay payment data fetched', { 
      paymentId, 
      hasSubscriptionId: !!data.subscription_id,
      hasPaymentLinkId: !!data.payment_link_id,
      hasOrderId: !!data.order_id,
      status: data.status,
      method: data.method,
    });
    
    if (typeof data.subscription_id === 'string' && data.subscription_id) return data.subscription_id;
    if (typeof data.payment_link_id === 'string' && data.payment_link_id) return data.payment_link_id;
    if (typeof data.order_id === 'string' && data.order_id) return data.order_id;
    
    Logger.warn('Razorpay payment missing subscription_id, payment_link_id, and order_id', { 
      paymentId,
      dataKeys: Object.keys(data).slice(0, 20)
    });
    return null;
  } catch (err) {
    Logger.warn('Razorpay session resolution failed', { paymentId, error: toError(err).message });
    return null;
  }
}

export async function GET(req: NextRequest) {
  let sessionId = req.nextUrl.searchParams.get('session_id');
  const paymentId = req.nextUrl.searchParams.get('payment_id');
  const recent = req.nextUrl.searchParams.get('recent');
  const sinceParam = req.nextUrl.searchParams.get('since');
  if (!sessionId && !recent && !paymentId) return jsonError('Missing session_id', 400, 'CHECKOUT_SESSION_MISSING');

  // Determine provider hint early from payment_id prefix or session_id prefix
  const looksLikeRazorpay = (paymentId && paymentId.startsWith('pay_')) || (sessionId && (sessionId.startsWith('order_') || sessionId.startsWith('sub_') || sessionId.startsWith('plink_')));

  const { userId: clerkUserId, orgId: authOrgId } = await authService.getSession();
  let actorUserId = clerkUserId ?? null;

  if (!actorUserId && canUseLocalhostDevBypass(req.nextUrl.hostname)) {
    const devAdminId = process.env.DEV_ADMIN_ID;
    if (devAdminId) {
      const fallback = await prisma.user.findUnique({ where: { id: devAdminId }, select: { id: true } });
      if (fallback?.id) {
        actorUserId = fallback.id;
      }
    }
    if (!actorUserId) {
      const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
      if (admin?.id) {
        actorUserId = admin.id;
      }
    }
  }

  if (!actorUserId) {
    Logger.warn('Checkout confirm request without authentication', { sessionId, recent });
    return jsonError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const userId = actorUserId;
  const ownedOrganization = await prisma.organization.findFirst({
    where: { ownerUserId: userId },
    select: { id: true },
  });
  const hasOwnedOrganization = Boolean(ownedOrganization?.id);
  const setupUrl = '/dashboard/team?fromCheckout=1&provision=1';
  const setupFieldsForPlan = (supportsOrganizations?: boolean | null) =>
    supportsOrganizations === true && !hasOwnedOrganization
      ? { requiresOrganizationSetup: true, setupUrl }
      : {};

  try {
    const devLog = (...a: unknown[]) => { if (process.env.NODE_ENV !== 'production') Logger.debug?.('[checkout/confirm]', ...a); };
    devLog('incoming', { sessionId, recent });

    // Helpers to safely read nested values from unknown objects without using `any`.

    let session: CheckoutSessionDetails | null = null;
    let orgSyncNeeded = false;
    let sessionUserId: string | undefined;

    // ── Fast-path: check DB for an already-processed payment (webhook may have beaten us) ──
    // This runs for BOTH payment_id and session_id requests so we avoid expensive API calls.
    {
      const dbOr: Record<string, unknown>[] = [];
      if (paymentId) dbOr.push({ externalPaymentId: paymentId });
      if (sessionId) {
        dbOr.push({ externalSessionId: sessionId });
      }

      if (dbOr.length > 0) {
        const existing = await prisma.payment.findFirst({
          where: { userId, OR: dbOr as Prisma.PaymentWhereInput[] },
          orderBy: { createdAt: 'desc' },
          include: { plan: true, subscription: { include: { plan: true } } }
        });
        if (existing) {
          devLog('fast-path: existing payment found in DB', { paymentId: existing.id });
          const isTokenTopupPayment = !existing.subscriptionId && existing.plan && existing.plan.autoRenew === false;
          return NextResponse.json({
            ok: true,
            completed: true,
            topup: isTokenTopupPayment,
            paymentId: existing.id,
            createdAt: existing.createdAt,
            plan: existing.subscription?.plan?.name || existing.plan?.name || null,
            ...setupFieldsForPlan(existing.subscription?.plan?.supportsOrganizations ?? existing.plan?.supportsOrganizations),
          });
        }
      }

      // Second check: recent payment fallback by timestamp
      // This catches payments created by webhook before exact IDs are linked
      if (sinceParam) {
        const sinceMs = Number(sinceParam);
        if (Number.isFinite(sinceMs) && sinceMs > 0) {
          const sinceDate = new Date(sinceMs);
          const providerFilter = looksLikeRazorpay ? 'razorpay' : undefined;
          const recentPayment = await prisma.payment.findFirst({
            where: {
              userId,
              createdAt: { gte: sinceDate },
              ...(providerFilter ? { paymentProvider: providerFilter } : {}),
            },
            orderBy: { createdAt: 'desc' },
            include: { plan: true, subscription: { include: { plan: true } } }
          });

          if (recentPayment) {
            devLog('fast-path: recent payment fallback', { paymentId: recentPayment.id });
            const isTokenTopupPayment = !recentPayment.subscriptionId && recentPayment.plan && recentPayment.plan.autoRenew === false;
            return NextResponse.json({
              ok: true,
              completed: true,
              topup: isTokenTopupPayment,
              paymentId: recentPayment.id,
              createdAt: recentPayment.createdAt,
              plan: recentPayment.subscription?.plan?.name || recentPayment.plan?.name || null,
              ...setupFieldsForPlan(recentPayment.subscription?.plan?.supportsOrganizations ?? recentPayment.plan?.supportsOrganizations),
            });
          }
        }
      }
    }

    if (!sessionId && paymentId) {
      // Third check: attempt to resolve session from Razorpay API
      // (This often fails for subscription payments as they don't include subscription_id/payment_link_id)
      sessionId = await resolveRazorpaySessionId(paymentId);
      if (!sessionId) {
        Logger.warn('Checkout confirm could not resolve Razorpay session from payment_id', { paymentId });
        return NextResponse.json({ ok: true, completed: false, pending: true });
      }
    }

    const provider = looksLikeRazorpay
      ? (PaymentProviderFactory.getProviderByName('razorpay') || paymentService.provider)
      : paymentService.provider;
    const providerName = provider.name;
    const isStripeProvider = providerName === 'stripe';

    if (sessionId) {
      session = await provider.getCheckoutSession(sessionId);

      // Razorpay order_ sessions auto-created for subscriptions/payment-links often lack
      // app-set notes (no userId, no priceId).  When we also have a payment_id, try to
      // resolve a richer session (plink_ or sub_) that carries the original metadata.
      const sessionHasMetadata = Boolean(session.metadata?.userId || session.metadata?.priceId || session.lineItems?.length);
      if (!isStripeProvider && !sessionHasMetadata && paymentId && sessionId.startsWith('order_')) {
        devLog('order session lacks metadata – resolving richer session from payment_id', { sessionId, paymentId });
        const betterSessionId = await resolveRazorpaySessionId(paymentId);
        if (betterSessionId && betterSessionId !== sessionId) {
          devLog('resolved richer session', { original: sessionId, resolved: betterSessionId });
          const betterSession = await provider.getCheckoutSession(betterSessionId);
          if (betterSession.metadata?.userId || betterSession.metadata?.priceId || betterSession.lineItems?.length) {
            session = betterSession;
            sessionId = betterSessionId;
          }
        }
      }

      // Narrow and extract a few useful fields for logging / downstream logic without using `any`.
      const sessionIdStr = session.id;
      const clientRef = session.clientReferenceId;
      const metaUser = session.metadata?.userId;
      devLog('provider session', { provider: providerName, id: sessionIdStr, client_reference_id: clientRef, metadata_userId: metaUser });
      sessionUserId = clientRef || metaUser;

      // For redirect-only providers, warn when the session doesn't carry a userId marker
      // but only trust the authenticated user if we already have exact DB evidence
      // tying this provider session/payment back to that user. Otherwise, wait for
      // webhook fulfillment or a richer provider session to avoid cross-user attribution.
      if (!isStripeProvider && !sessionUserId) {
        const ownershipEvidenceOr: Prisma.PaymentWhereInput[] = [
          { externalSessionId: sessionIdStr },
        ];
        if (paymentId) {
          ownershipEvidenceOr.push({ externalPaymentId: paymentId });
        }
        if (session.paymentIntentId) {
          ownershipEvidenceOr.push({ externalPaymentId: session.paymentIntentId });
        }

        const exactOwnershipEvidence = await prisma.payment.findFirst({
          where: {
            userId,
            OR: ownershipEvidenceOr,
          },
          select: { id: true },
        });

        if (!exactOwnershipEvidence) {
          Logger.warn('Checkout confirm session has no user marker and no exact ownership evidence; returning pending', {
            provider: providerName,
            sessionId: sessionIdStr,
            paymentId,
            paymentIntentId: session.paymentIntentId,
            authenticatedUserId: userId,
          });
          return NextResponse.json({ ok: true, completed: false, pending: true });
        }

        Logger.info('Checkout confirm session has no user marker – using authenticated userId with exact DB evidence', {
          provider: providerName,
          sessionId: sessionIdStr,
          authenticatedUserId: userId,
          evidencePaymentId: exactOwnershipEvidence.id,
        });
        sessionUserId = userId;
      }

      if (sessionUserId && sessionUserId !== userId) {
        Logger.warn('Checkout confirm session ownership mismatch', {
          sessionId: sessionIdStr,
          sessionUserId,
          actorUserId: userId
        });
        return jsonError('Forbidden', 403, 'FORBIDDEN');
      }

      // If provider reports the session as not paid/active yet, return a pending response.
      const paymentStatus = (session.paymentStatus || '').toLowerCase();
      const isPaidLike = paymentStatus === 'paid' || paymentStatus === 'succeeded' || paymentStatus === 'success';
      const isActiveLike = paymentStatus === 'active';
      const isNoPaymentRequired = paymentStatus === 'no_payment_required';

      const isSessionComplete = (() => {
        // Stripe sessions typically use payment_status=paid.
        if (isStripeProvider) return isPaidLike || isNoPaymentRequired;
        // Non-Stripe redirect providers: payment links use paid; subscriptions map to active.
        return isPaidLike || isActiveLike;
      })();

      if (!isSessionComplete) {
        return NextResponse.json({ ok: true, completed: false, status: paymentStatus });
      }

      // For non-stripe providers, fulfill via PaymentService so token crediting and
      // subscription handling stay consistent with webhook processing.
      if (!isStripeProvider) {
        const activeOrganizationId = resolveActiveOrganizationId(session.metadata) ?? authOrgId ?? null;
        const standardizedMetadata = { ...(session.metadata || {}) };
        if (activeOrganizationId) {
          standardizedMetadata.activeOrganizationId = activeOrganizationId;
          standardizedMetadata.organizationId = activeOrganizationId;
          standardizedMetadata.activeProviderOrganizationId = activeOrganizationId;
          standardizedMetadata.activeClerkOrgId = activeOrganizationId;
          standardizedMetadata.clerkOrgId = activeOrganizationId;
          standardizedMetadata.orgId = activeOrganizationId;
        }

        const standardized: StandardizedCheckoutSession = {
          id: session.id,
          userId: sessionUserId || undefined,
          mode: session.subscriptionId ? 'subscription' : 'payment',
          subscriptionId: session.subscriptionId,
          paymentIntentId: session.paymentIntentId,
          amountTotal: session.amountTotal,
          amountSubtotal: session.amountSubtotal,
          currency: session.currency,
          paymentStatus: 'paid',
          metadata: standardizedMetadata,
          lineItems: session.lineItems,
        };

        await paymentService.processWebhookEvent({
          type: 'checkout.completed',
          payload: standardized,
          originalEvent: { source: 'checkout.confirm', provider: providerName },
        });

        // Broad lookup: processWebhookEvent (or a prior webhook) may have stored the
        // payment under a different column depending on the event type.  Build an OR
        // that covers every reasonable variant so we don't accidentally miss it and
        // fall through to an incomplete legacy path.
        const paymentLookupOr: Record<string, unknown>[] = [
          { externalSessionId: session.id },
        ];
        if (session.paymentIntentId) {
          paymentLookupOr.push({ externalPaymentId: session.paymentIntentId });
        }
        if (session.subscriptionId) {
          paymentLookupOr.push({ externalSessionId: session.subscriptionId });
        }
        if (paymentId) {
          paymentLookupOr.push({ externalPaymentId: paymentId });
        }

        let payment = await prisma.payment.findFirst({
          where: { userId, OR: paymentLookupOr as Prisma.PaymentWhereInput[] },
          orderBy: { createdAt: 'desc' },
          include: {
            plan: true,
            subscription: { include: { plan: true } }
          }
        });

        // Last-resort fallback: find a recent payment by this user from this provider
        // (covers webhook-created payments with IDs that don't match our session exactly)
        if (!payment && sinceParam) {
          const sinceMs = Number(sinceParam);
          if (Number.isFinite(sinceMs) && sinceMs > 0) {
            payment = await prisma.payment.findFirst({
              where: {
                userId,
                paymentProvider: providerName,
                createdAt: { gte: new Date(sinceMs) },
              },
              orderBy: { createdAt: 'desc' },
              include: { plan: true, subscription: { include: { plan: true } } }
            });
          }
        }

        if (!payment) {
          // processWebhookEvent may have been a no-op (idempotency) or still pending.
          // Return pending — the client will retry in a few seconds.
          return NextResponse.json({ ok: true, completed: false });
        }

        const isTokenTopupPayment = !payment.subscriptionId && payment.plan && payment.plan.autoRenew === false;
        return NextResponse.json({
          ok: true,
          completed: true,
          topup: isTokenTopupPayment,
          paymentId: payment.id,
          createdAt: payment.createdAt,
          plan: payment.subscription?.plan?.name || payment.plan?.name || null,
        });
      }
    }

    // Fast path: recent=1 without session_id.
    // - If `since` is provided, use it to check whether a new payment has been recorded after the given time.
    //   This is used by hosted-checkout flows that can't reliably return a session id.
    // - Otherwise, return active subscription state only.
    if (!sessionId && recent) {
      const sinceMs = sinceParam ? Number(sinceParam) : null;
      const hasValidSince = typeof sinceMs === 'number' && Number.isFinite(sinceMs) && sinceMs > 0;

      if (hasValidSince) {
        const sinceDate = new Date(sinceMs);
        const payment = await prisma.payment.findFirst({
          where: {
            userId,
            status: 'SUCCEEDED',
            createdAt: { gte: sinceDate }
          },
          orderBy: { createdAt: 'desc' },
          include: {
            plan: true,
            subscription: { include: { plan: true } }
          }
        });

        if (!payment) {
          return NextResponse.json({ ok: true, completed: false });
        }

        const isTokenTopupPayment = !payment.subscriptionId && payment.plan && payment.plan.autoRenew === false;
        return NextResponse.json({
          ok: true,
          completed: true,
          topup: isTokenTopupPayment,
          paymentId: payment.id,
          createdAt: payment.createdAt,
          plan: payment.subscription?.plan?.name || payment.plan?.name || null,
        });
      }

      const activeSub = await prisma.subscription.findFirst({ where: { userId, status: 'ACTIVE', expiresAt: { gt: new Date() } }, include: { plan: true } });
      if (!activeSub) return NextResponse.json({ ok: true, active: false });
      return NextResponse.json({ ok: true, active: true, plan: activeSub.plan.name, expiresAt: activeSub.expiresAt });
    }

    // Look for existing payment tied to this checkout session (idempotency)
    const sessionLookupId = session?.id || sessionId || undefined;
    const existingPayment = sessionLookupId
      ? await prisma.payment.findFirst({
        where: {
          userId,
          OR: [
            { externalSessionId: sessionLookupId }
          ]
        },
        include: {
          subscription: { include: { plan: true } },
          plan: true
        }
      })
      : null;
    if (existingPayment) {
      const expiresAt = existingPayment.subscription?.expiresAt;
      const active = expiresAt ? new Date(expiresAt).getTime() > Date.now() : false;
      const existingPlanName = existingPayment.subscription?.plan?.name || existingPayment.plan?.name || null;
      devLog('existing payment found', { paymentId: existingPayment.id, subscriptionId: existingPayment.subscription?.id, active, existingPlanName });

      const isTokenTopupPayment = !existingPayment.subscriptionId && existingPayment.plan && existingPayment.plan.autoRenew === false;
      if (isTokenTopupPayment) {
        const activeRecurring = await prisma.subscription.findFirst({
          where: { userId, status: 'ACTIVE', expiresAt: { gt: new Date() }, plan: { autoRenew: true } },
          include: { plan: true },
          orderBy: { expiresAt: 'desc' }
        });

        if (activeRecurring?.plan) {
          return NextResponse.json({
            ok: true,
            already: true,
            topup: true,
            active: true,
            plan: activeRecurring.plan.name,
            purchasedPlan: existingPayment.plan?.name || null,
            tokensAdded: existingPayment.plan?.tokenLimit ?? 0,
            expiresAt: activeRecurring.expiresAt
          });
        }

        return NextResponse.json({
          ok: true,
          already: true,
          topup: true,
          active,
          plan: existingPlanName,
          purchasedPlan: existingPayment.plan?.name || null,
          tokensAdded: existingPayment.plan?.tokenLimit ?? 0,
          expiresAt
        });
      }

      return NextResponse.json({ ok: true, already: true, active, plan: existingPlanName, expiresAt });
    }

    // Check if webhook already created a subscription for this specific session (webhook race condition)
    const webhookCreatedSub = sessionLookupId
      ? await prisma.subscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
          payments: {
            some: {
              OR: [
                { externalSessionId: sessionLookupId }
              ]
            }
          }
        },
        include: { plan: true }
      })
      : null;
    if (webhookCreatedSub) {
      devLog('webhook already created subscription for this session - returning existing');
      return NextResponse.json({
        ok: true,
        already: true,
        active: true,
        plan: webhookCreatedSub.plan.name,
        expiresAt: webhookCreatedSub.expiresAt,
        ...setupFieldsForPlan(webhookCreatedSub.plan?.supportsOrganizations),
      });
    }

    // Derive plan via price id
    const priceId = session?.lineItems?.[0]?.priceId || session?.metadata?.priceId;
    if (!priceId) return jsonError('Missing price id', 400, 'PRICE_ID_MISSING');
    const plan = await prisma.plan.findFirst({
      where: {
        OR: [
          { externalPriceId: priceId },
          { externalPriceIds: { contains: priceId } }
        ]
      }
    });
    if (!plan) return jsonError('Plan not found for price', 404, 'PLAN_NOT_FOUND');

    const now = new Date();
    const activeOrganizationId = resolveActiveOrganizationId(session?.metadata) ?? authOrgId ?? null;
    const activeOwnedOrganization = activeOrganizationId
      ? await prisma.organization.findFirst({
        where: {
          ownerUserId: userId,
          OR: [
            { id: activeOrganizationId },
            { clerkOrganizationId: activeOrganizationId },
          ],
        },
        select: { id: true, clerkOrganizationId: true },
      })
      : null;

    // Check for existing active subscriptions to handle stacking
    const existingActiveSubscriptions = await prisma.subscription.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        expiresAt: { gt: now }
      },
      include: { plan: true },
      orderBy: { expiresAt: 'desc' }
    });

    const providerSubscriptionId = session?.subscriptionId || session?.metadata?.subscriptionId;
    const subscriptionIdentifierData = providerSubscriptionId
      ? {
        externalSubscriptionId: providerSubscriptionId,
      }
      : {};

    let newStartDate = now;
    let newExpiresAt = new Date(now.getTime() + plan.durationHours * 3600 * 1000);
    let subscriptionStatus = 'ACTIVE';

    // If user has an existing active subscription, do NOT create a stacked PENDING row.
    // Instead:
    // - If the existing latest active subscription is for the same plan, extend its expiresAt.
    // - If the plan differs, expire prior active subs and create a fresh ACTIVE subscription for the new plan.
    let effectiveSubscriptionId: string | undefined;
    if (existingActiveSubscriptions.length > 0) {
      const latestActive = existingActiveSubscriptions[0];
      const latestExpiry = latestActive.expiresAt;
      Logger.info('User has existing active subscription(s)', { userId, latestExpiry: latestExpiry?.toISOString() });

      // If the most recent active subscription is a one-time plan (autoRenew === false),
      // extend it by the purchased plan duration regardless of whether the plans match.
      if (latestExpiry && latestExpiry > now && latestActive.plan?.autoRenew === false) {
        const extendedExpires = new Date(latestExpiry.getTime() + plan.durationHours * 3600 * 1000);
        const updated = await prisma.subscription.update({
          where: { id: latestActive.id },
          data: {
            expiresAt: extendedExpires,
            paymentProvider: providerName,
            ...(providerSubscriptionId ? subscriptionIdentifierData : {})
          }
        });
        effectiveSubscriptionId = updated.id;
        newStartDate = updated.startedAt; // keep original start
        newExpiresAt = updated.expiresAt;
        subscriptionStatus = 'ACTIVE';
        Logger.info('Extended one-time subscription', { subscriptionId: updated.id, newExpiresAt: updated.expiresAt.toISOString() });
      } else if (latestActive.plan?.autoRenew === true && plan.autoRenew === false) {
        // Token top-up: user has active recurring subscription and purchased non-recurring plan for tokens
        // The webhook handles adding tokens; here we just return success with the recurring plan still active
        Logger.info('Token top-up: user purchased non-recurring plan while on recurring subscription', {
          userId,
          recurringPlan: latestActive.plan.name,
          purchasedPlan: plan.name
        });

        // Check if webhook already created payment record
        const webhookPayment = sessionLookupId
          ? await prisma.payment.findFirst({
            where: {
              userId,
              OR: [
                { externalSessionId: sessionLookupId }
              ]
            }
          })
          : null;

        if (webhookPayment) {
          // Webhook processed it - return token top-up success
          return NextResponse.json({
            ok: true,
            topup: true,
            active: true,
            plan: latestActive.plan.name,
            purchasedPlan: plan.name,
            tokensAdded: plan.tokenLimit || 0,
            expiresAt: latestActive.expiresAt,
            ...setupFieldsForPlan(plan.supportsOrganizations),
          });
        }

        // Webhook hasn't processed yet - return pending state
        return NextResponse.json({
          ok: true,
          topup: true,
          pending: true,
          plan: latestActive.plan.name,
          purchasedPlan: plan.name,
          ...setupFieldsForPlan(plan.supportsOrganizations),
        });
      } else {
        // Either there are no active one-time subs, or the latest active is recurring.
        // Expire prior actives and create a new ACTIVE subscription immediately for this purchase.
        const priorActiveSubs = await prisma.subscription.findMany({
          where: { userId, status: 'ACTIVE', expiresAt: { gt: new Date(0) } },
          select: { organizationId: true, plan: { select: { supportsOrganizations: true } } }
        });
        const priorActive = await prisma.subscription.updateMany({ where: { userId, status: 'ACTIVE', expiresAt: { gt: new Date(0) } }, data: { status: 'EXPIRED', canceledAt: new Date() } });
        if (priorActive.count > 0) {
          // Respect operation-control setting before clearing paid tokens
          const shouldClear = await shouldClearPaidTokensOnExpiry({ userId });
          if (shouldClear) {
            await prisma.user.update({ where: { id: userId }, data: { tokenBalance: 0 } });

            const orgIds = priorActiveSubs
              .filter(s => Boolean(s.organizationId) && Boolean(s.plan?.supportsOrganizations))
              .map(s => s.organizationId)
              .filter((id): id is string => typeof id === 'string' && id.length > 0);
            if (orgIds.length > 0) {
              const uniqueOrgIds = Array.from(new Set(orgIds));
              const scopedOrgIds = activeOwnedOrganization
                ? uniqueOrgIds.filter((id) => id === activeOwnedOrganization.id)
                : uniqueOrgIds;
              const owned = scopedOrgIds.length > 0
                ? await prisma.organization.findMany({
                  where: { id: { in: scopedOrgIds }, ownerUserId: userId },
                  select: { id: true },
                })
                : [];
              for (const org of owned) {
                await resetOrganizationSharedTokens({ organizationId: org.id });
              }
            }
          }
          orgSyncNeeded = true;
        }
        newStartDate = now;
        newExpiresAt = new Date(now.getTime() + plan.durationHours * 3600 * 1000);
        subscriptionStatus = 'ACTIVE';
        // We'll create a fresh subscription below and set effectiveSubscriptionId when created
        Logger.info('Expiring prior actives and creating a new ACTIVE subscription', { userId, plan: plan.name });
      }
    }

    // If the checkout session represents a subscription, try to capture the Stripe subscription id
    // This block is now removed to avoid redeclaration error

    // Expire prior active subs that have actually expired (safety cleanup)
    const expiredCleanup = await prisma.subscription.updateMany({
      where: { userId, status: 'ACTIVE', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED', canceledAt: new Date() }
    });

    if (expiredCleanup.count > 0) {
      // Natural expiry: only clear paid tokens after the grace window.
      await maybeClearPaidTokensAfterNaturalExpiryGrace({ userId });
      orgSyncNeeded = true;
    }

    let subscription: unknown = null;
    const subscriptionOrganizationId = plan.supportsOrganizations === true
      ? activeOwnedOrganization?.id ?? null
      : null;
    if (effectiveSubscriptionId) {
      // We already updated an existing subscription to extend it
      subscription = await prisma.subscription.findUnique({ where: { id: effectiveSubscriptionId }, include: { plan: true } });
    } else {
      subscription = await prisma.subscription.create({
        data: {
          userId,
          planId: plan.id,
          organizationId: subscriptionOrganizationId,
          status: subscriptionStatus,
          startedAt: newStartDate,
          expiresAt: newExpiresAt,
          paymentProvider: providerName,
          ...(providerSubscriptionId ? subscriptionIdentifierData : {})
        },
        include: { plan: true }
      });
      // subscription is created by Prisma and should be an object; narrow safely
      if (typeof subscription === 'object' && subscription !== null && 'id' in subscription) {
        effectiveSubscriptionId = (subscription as Record<string, unknown>)['id'] as string;
      }
      orgSyncNeeded = true;
    }

    // If this purchase created a new ACTIVE one-time subscription (i.e. non-recurring)
    // and the plan includes token allocations, add those tokens to the user's balance.
    try {
      const planTokenAmount = plan.tokenLimit || 0;
      const isOneTimePlan = plan.autoRenew === false;
      if (subscriptionStatus === 'ACTIVE' && isOneTimePlan && planTokenAmount > 0) {
        if (plan.supportsOrganizations === true) {
          if (activeOwnedOrganization?.id) {
            await creditOrganizationSharedTokens({
              organizationId: activeOwnedOrganization.id,
              amount: planTokenAmount,
            });
            Logger.info('Added tokens from one-time purchase to organization pool (checkout.confirm)', {
              userId,
              organizationId: activeOwnedOrganization.id,
              tokensAdded: planTokenAmount,
              planName: plan.name,
            });
          } else {
            Logger.info('Deferred team token allocation until workspace provisioning (checkout.confirm)', {
              userId,
              tokensDeferred: planTokenAmount,
              planName: plan.name,
            });
          }
        } else {
          await prisma.user.update({ where: { id: userId }, data: { tokenBalance: { increment: planTokenAmount } } });
          Logger.info('Added tokens from one-time purchase (checkout.confirm)', { userId, tokensAdded: planTokenAmount, planName: plan.name });
        }
      }
    } catch (err) {
      Logger.warn('Failed to add tokens after checkout confirm (one-time purchase)', { error: toError(err).message });
    }

    // Try to attach the underlying PaymentIntent id when available so admin shows Stripe ids
    const paymentIntentId = session?.paymentIntentId || session?.metadata?.paymentIntentId;
    const sessIdForPayment = sessionLookupId;
    const subscriptionIdForPayment = typeof subscription === 'object' && subscription !== null ? (subscription as Record<string, unknown>)['id'] as string : effectiveSubscriptionId as string;
    const amountSubtotalCents = session?.amountSubtotal;
    const amountTotalCents = session?.amountTotal;
    const discountTotalCents = session?.amountDiscount;
    const paymentIntentAmountReceived = session?.paymentIntent?.amountReceived;
    const paymentIntentAmount = session?.paymentIntent?.amount;
    const resolvedAmountCents = paymentIntentAmountReceived ?? paymentIntentAmount ?? amountTotalCents ?? plan.priceCents;
    const resolvedSubtotalCents = amountSubtotalCents ?? (resolvedAmountCents != null && discountTotalCents != null ? resolvedAmountCents + discountTotalCents : undefined) ?? plan.priceCents;
    const resolvedDiscountCents = discountTotalCents ?? (resolvedSubtotalCents != null ? Math.max(0, resolvedSubtotalCents - resolvedAmountCents) : undefined);
    const couponCode = session?.metadata?.couponCode;

      const payment = await prisma.$transaction(async (tx) => {
        const paymentData = {
          userId,
          subscriptionId: subscriptionIdForPayment,
          planId: plan.id,
          amountCents: resolvedAmountCents ?? plan.priceCents,
          subtotalCents: resolvedSubtotalCents,
          discountCents: resolvedDiscountCents,
          couponCode: couponCode || null,
          status: 'SUCCEEDED',
          paymentProvider: providerName,
          ...(sessIdForPayment ? { externalSessionId: sessIdForPayment } : {}),
          ...(paymentIntentId ? { externalPaymentId: paymentIntentId } : {}),
        };

        const p = await tx.payment.create({
          data: paymentData
        });
      // Increment denormalized payments count for the user
      await tx.user.update({ where: { id: userId }, data: ({ paymentsCount: { increment: 1 } } as unknown) as import('@prisma/client').Prisma.UserUpdateInput });
      return p;
    });
    // Update denormalized lastPaymentAmountCents for subscription if present
    if (subscriptionIdForPayment) {
      try {
        await updateSubscriptionLastPaymentAmount(subscriptionIdForPayment);
      } catch (err: unknown) {
        const e = toError(err);
        Logger.warn('Failed to update subscription.lastPaymentAmountCents after checkout confirm', { subscriptionId: subscriptionIdForPayment, error: e.message });
      }
    }
    const loggedSubscriptionId = typeof subscription === 'object' && subscription !== null && 'id' in subscription ? (subscription as Record<string, unknown>)['id'] : effectiveSubscriptionId;
    devLog('created subscription + payment', { subscriptionId: loggedSubscriptionId, paymentId: payment.id, plan: plan.name, status: subscriptionStatus });
    if (orgSyncNeeded) {
      try {
        await syncOrganizationEligibilityForUser(userId);
      } catch (err: unknown) {
        Logger.warn('Failed to sync organization eligibility after checkout confirm subscription changes', {
          userId,
          error: toError(err).message
        });
      }
    }

    return NextResponse.json({
      ok: true,
      active: subscriptionStatus === 'ACTIVE',
      pending: subscriptionStatus === 'PENDING',
      plan: plan.name,
      expiresAt: newExpiresAt,
      ...setupFieldsForPlan(plan.supportsOrganizations),
    });
  } catch (e: unknown) {
    const err = toError(e);
    Logger.error('Confirm error', { error: err.message, stack: err.stack });
    return jsonError(err.message || 'Checkout confirm failed', 500, 'CHECKOUT_CONFIRM_FAILED');
  }
}