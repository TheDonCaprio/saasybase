import {
  buildDiscountedSubscriptionPriceCacheKey,
  clearDiscountedSubscriptionPriceKey,
  getCachedDiscountedSubscriptionPriceId,
  setCachedDiscountedSubscriptionPriceId,
  tryAcquireDiscountedSubscriptionPriceKey,
} from '@/lib/payment/discountedSubscriptionPriceCache';
import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { PLAN_DEFINITIONS, resolveSeededPlanPriceForProvider, syncPlanExternalPriceIds } from '../../../lib/plans';
import type { Prisma } from '@/lib/prisma-client';
import { prisma } from '../../../lib/prisma';
import { paymentService } from '../../../lib/payment/service';
import { Logger } from '../../../lib/logger';
import { getEnv } from '../../../lib/env';
import { rateLimit, createRateLimitKey, getClientIP } from '../../../lib/rateLimit';
import { validateInput, apiSchemas } from '../../../lib/validation';
import { asRecord, toError } from '../../../lib/runtime-guards';
import { ensureProviderCoupon, isCouponCurrentlyActive, normalizeCouponCode, calculateCouponDiscountCents, isCouponValidForCurrency, extractRazorpayOfferId } from '../../../lib/coupons';
import { isRecurringProrationEnabled } from '../../../lib/settings';
import { getIdByProvider, getCurrentProviderKey } from '../../../lib/utils/provider-ids';
import { getProviderCurrency, getProviderDefaultCurrency } from '../../../lib/payment/registry';
import { formatCurrency } from '../../../lib/utils/currency';
import { getOrganizationPlanContext } from '../../../lib/user-plan-context';
import { canUseLocalhostDevBypass } from '../../../lib/dev-admin-bypass';
import { resolveCheckoutWorkspaceContext } from '../../../lib/checkout-workspace-context';

const couponWithPlansInclude = {
  applicablePlans: {
    include: {
      plan: {
        select: { id: true, name: true },
      },
    },
  },
} satisfies Prisma.CouponInclude;

type CouponWithPlans = Prisma.CouponGetPayload<{
  include: typeof couponWithPlansInclude;
}>;

function jsonError(message: string, status: number, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, code, ...(extra || {}) }, { status });
}

function teamWorkspaceOwnerRequiredResponse() {
  return jsonError(
    'Only the workspace owner can purchase or change team plans for this workspace.',
    403,
    'WORKSPACE_BILLING_OWNER_REQUIRED',
    { redirectTo: '/dashboard/plan' }
  );
}

function personalWorkspacePurchaseRequiredResponse() {
  return jsonError(
    'Personal plans can only be purchased from your personal workspace. Switch out of the active organization workspace and try again.',
    409,
    'PERSONAL_PLAN_BLOCKED_IN_WORKSPACE',
    { redirectTo: '/pricing' }
  );
}

function resolveExplicitActiveOrganizationId(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload) return null;

  const candidates = [
    payload.activeOrganizationId,
    payload.organizationId,
    payload.localOrganizationId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  let userId: string | null = null;

  try {
    const clientIp = getClientIP(req);
    const userAgent = req.headers.get('user-agent');
    const { userId: clerkUserId, orgId: activeClerkOrgId } = await authService.getSession();
    userId = clerkUserId as string | null;

    const limiterKey = userId ? `checkout:user:${userId}` : createRateLimitKey(req, 'checkout');
    const rateLimitResult = await rateLimit(limiterKey, { limit: 10, windowMs: 60000 }, {
      actorId: userId,
      ip: clientIp,
      userAgent,
      route: '/api/checkout',
      method: req.method
    });
    if (!rateLimitResult.success && !rateLimitResult.allowed) {
      Logger.error('Checkout rate limiter unavailable', { key: limiterKey, error: rateLimitResult.error });
      return jsonError('Service temporarily unavailable. Please retry shortly.', 503, 'RATE_LIMIT_UNAVAILABLE');
    }

    if (!rateLimitResult.allowed) {
      Logger.warn('Checkout rate limit exceeded', {
        remaining: rateLimitResult.remaining,
        key: limiterKey,
        actorId: userId ?? undefined
      });
      const retryAfterSeconds = Math.max(0, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfterSeconds.toString()
          }
        }
      );
    }

    if (!userId && canUseLocalhostDevBypass(req.nextUrl.hostname)) {
      // Localhost-only dev fallback: use DEV_ADMIN_ID or first ADMIN user
      if (process.env.DEV_ADMIN_ID) {
        userId = process.env.DEV_ADMIN_ID;
      } else {
        const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        if (admin) userId = admin.id;
      }
    }

    if (!userId) {
      Logger.warn('Unauthorized checkout attempt');
      return jsonError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    // Quiet linter if createCheckoutSession isn't used in some branches
    // void createCheckoutSession;

    // Validate and extract planId
    let planId = '';
    let couponCode: string | null = null;
    let skipProrationCheck = false;
    let prorationFallbackReason: string | null = null;
    let requestedActiveOrganizationId: string | null = null;
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json();
      const bodyRecord = asRecord(body);
      requestedActiveOrganizationId = resolveExplicitActiveOrganizationId(bodyRecord)
        ?? req.nextUrl.searchParams.get('activeOrganizationId')
        ?? req.nextUrl.searchParams.get('organizationId')
        ?? req.nextUrl.searchParams.get('localOrganizationId');

      const validation = validateInput(apiSchemas.checkout, body);
      if (!validation.success) {
        Logger.warn('Invalid checkout request body', {
          userId,
          error: validation.error
        });
        return jsonError('Invalid request data', 400, 'INVALID_REQUEST');
      }
      // Narrow validated data safely
      const validatedRecord = asRecord(validation.data);
      planId = validatedRecord && typeof validatedRecord['planId'] === 'string' ? String(validatedRecord['planId']) : '';
      couponCode = validatedRecord && typeof validatedRecord['couponCode'] === 'string' ? String(validatedRecord['couponCode']) : null;
      skipProrationCheck = validatedRecord?.['skipProrationCheck'] === true;
      if (skipProrationCheck && typeof validatedRecord?.['prorationFallbackReason'] === 'string') {
        const trimmed = validatedRecord['prorationFallbackReason'].trim().slice(0, 100);
        prorationFallbackReason = trimmed.length > 0 ? trimmed : null;
      }
    } else {
      const form = await req.formData();
      planId = String(form.get('planId') || '');
      const rawCoupon = form.get('couponCode');
      couponCode = rawCoupon ? String(rawCoupon) : null;
      requestedActiveOrganizationId = resolveExplicitActiveOrganizationId({
        activeOrganizationId: form.get('activeOrganizationId'),
        organizationId: form.get('organizationId'),
        localOrganizationId: form.get('localOrganizationId'),
      })
        ?? req.nextUrl.searchParams.get('activeOrganizationId')
        ?? req.nextUrl.searchParams.get('organizationId')
        ?? req.nextUrl.searchParams.get('localOrganizationId');
    }

    if (couponCode) {
      couponCode = couponCode.trim();
      if (couponCode.length === 0) {
        couponCode = null;
      }
    }

    Logger.info('Checkout requested', { userId, planId, couponCode: couponCode || undefined });

    // First try to find by PLAN_DEFINITIONS id (legacy format like '24H', '7D')
    // Allow a runtime plan shape for custom DB-backed plans where `id` is a UUID string
    type RuntimePlan = {
      id: string;
      name: string;
      durationHours: number;
      priceCents: number;
      externalPriceEnv: string | null;
      legacyExternalPriceEnv?: string;
      sortOrder: number;
      autoRenew?: boolean;
      priceMode?: 'payment' | 'subscription';
    };
    const planSeed = PLAN_DEFINITIONS.find(p => p.id === planId);
    let resolvedPlanSeed = planSeed;
    let plan: RuntimePlan | undefined = planSeed
      ? {
        id: planSeed.id,
        name: planSeed.name,
        durationHours: planSeed.durationHours,
        priceCents: planSeed.priceCents,
        externalPriceEnv: planSeed.externalPriceEnv,
        legacyExternalPriceEnv: planSeed.legacyExternalPriceEnv,
        sortOrder: planSeed.sortOrder,
        priceMode: planSeed.priceMode,
      }
      : undefined;
    let dbPlan: unknown = null;
    let dbPlanRecord: Record<string, unknown> | null = null;
    let targetPlanId: string | null = null;
    let targetPlanName: string | null = null;

    if (plan) {
      // Legacy format - map plan to DB plan row
      dbPlan = await prisma.plan.findFirst({ where: { name: plan.name } });
      if (!dbPlan) {
        Logger.error('Plan config missing in database', { userId });
        return jsonError('Plan config missing', 500, 'PLAN_CONFIG_MISSING');
      }
      dbPlanRecord = asRecord(dbPlan);
      if (dbPlanRecord && typeof dbPlanRecord['name'] === 'string') {
        targetPlanName = dbPlanRecord['name'];
      }
    } else {
      // New format - planId is the database UUID
      dbPlan = await prisma.plan.findUnique({ where: { id: planId } });
      if (!dbPlan) {
        Logger.warn('Plan not found in database', { userId, planId });
        return jsonError('Plan not found', 404, 'PLAN_NOT_FOUND');
      }

      dbPlanRecord = asRecord(dbPlan);
      // Find matching plan definition by name
      const planName = dbPlanRecord && typeof dbPlanRecord['name'] === 'string' ? dbPlanRecord['name'] : '';
      const matchingSeed = PLAN_DEFINITIONS.find(p => p.name === planName);
      if (!matchingSeed) {
        // For custom plans without matching definition, check if they have a externalPriceId
        const externalPriceId = dbPlanRecord && typeof dbPlanRecord['externalPriceId'] === 'string' ? dbPlanRecord['externalPriceId'] : null;
        if (!externalPriceId) {
          Logger.warn('Plan has no payment provider configuration', { userId, planId, planName });
          return jsonError('This plan is not configured for checkout. Please contact support.', 400, 'PLAN_PRICE_MISSING');
        }
        // Create a temporary plan object for custom plans
        plan = {
          id: String(planId),
          name: planName || `Plan ${planId}`,
          durationHours: dbPlanRecord && typeof dbPlanRecord['durationHours'] === 'number' ? dbPlanRecord['durationHours'] : Number(dbPlanRecord?.['durationHours'] ?? 0),
          priceCents: dbPlanRecord && typeof dbPlanRecord['priceCents'] === 'number' ? dbPlanRecord['priceCents'] : Number(dbPlanRecord?.['priceCents'] ?? 0),
          externalPriceEnv: null,
          sortOrder: dbPlanRecord && typeof dbPlanRecord['sortOrder'] === 'number' ? dbPlanRecord['sortOrder'] : Number(dbPlanRecord?.['sortOrder'] ?? 0),
          autoRenew: dbPlanRecord?.['autoRenew'] === true,
          priceMode: dbPlanRecord?.['autoRenew'] === true ? 'subscription' : 'payment',
        };
      }
      if (!plan && matchingSeed) {
        plan = {
          id: matchingSeed.id,
          name: matchingSeed.name,
          durationHours: matchingSeed.durationHours,
          priceCents: matchingSeed.priceCents,
          externalPriceEnv: matchingSeed.externalPriceEnv,
          legacyExternalPriceEnv: matchingSeed.legacyExternalPriceEnv,
          sortOrder: matchingSeed.sortOrder,
          priceMode: matchingSeed.priceMode,
        };
        resolvedPlanSeed = matchingSeed;
      }
      targetPlanName = plan?.name ?? planName ?? null;
    }

    if (!dbPlanRecord) {
      dbPlanRecord = asRecord(dbPlan);
    }
    if (dbPlanRecord && typeof dbPlanRecord['id'] === 'string') {
      targetPlanId = dbPlanRecord['id'];
    }
    if (!targetPlanName && dbPlanRecord && typeof dbPlanRecord['name'] === 'string') {
      targetPlanName = dbPlanRecord['name'];
    }

    const prorationEnabled = await isRecurringProrationEnabled();
    if (
      prorationEnabled &&
      !skipProrationCheck &&
      dbPlanRecord?.['autoRenew'] === true &&
      targetPlanId
    ) {
      const activeRecurring = await prisma.subscription.findFirst({
        where: {
          userId: userId!,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
          plan: { autoRenew: true },
        },
        select: { planId: true },
      });
      if (activeRecurring && activeRecurring.planId !== targetPlanId) {
        return NextResponse.json({
          error: 'Recurring subscription changes must be confirmed through proration.',
          code: 'PRORATION_REQUIRED',
          prorationRequired: true,
        }, { status: 409 });
      }
    } else if (skipProrationCheck) {
      Logger.info('Checkout proration guard bypassed via fallback override', {
        userId,
        planId,
        reason: prorationFallbackReason ?? undefined,
      });
    }

    const selectedPlanIsTeam = dbPlanRecord?.['supportsOrganizations'] === true;
    const requestedOrganizationRef = requestedActiveOrganizationId ?? activeClerkOrgId ?? null;
    const checkoutWorkspaceContext = requestedOrganizationRef
      ? await resolveCheckoutWorkspaceContext(userId!, requestedOrganizationRef)
      : null;
    const hasActiveWorkspace = Boolean(activeClerkOrgId) || Boolean(checkoutWorkspaceContext);

    if (!selectedPlanIsTeam && hasActiveWorkspace) {
      return personalWorkspacePurchaseRequiredResponse();
    }

    const user = await prisma.user.findUnique({ where: { id: userId! } });
    if (!user || !user.email) {
      return jsonError('User email is required for checkout', 400, 'USER_EMAIL_REQUIRED');
    }

    const activeOrganizationContext = selectedPlanIsTeam && checkoutWorkspaceContext?.role === 'OWNER'
      ? await getOrganizationPlanContext(userId!, checkoutWorkspaceContext.organizationId)
      : null;

    if (selectedPlanIsTeam && checkoutWorkspaceContext?.role === 'MEMBER') {
      return teamWorkspaceOwnerRequiredResponse();
    }

    // Get priceId either from environment (predefined plans) or directly from DB (custom plans)
    let priceId: string | undefined;
    const usingPlanSeed = Boolean(resolvedPlanSeed);
    if (usingPlanSeed) {
      const resolved = resolvedPlanSeed
        ? resolveSeededPlanPriceForProvider(resolvedPlanSeed, {
            providerKey: getCurrentProviderKey(),
            externalPriceIds: dbPlanRecord?.['externalPriceIds'],
            legacyExternalPriceId: dbPlanRecord && typeof dbPlanRecord['externalPriceId'] === 'string'
              ? String(dbPlanRecord['externalPriceId'])
              : null,
          })
        : { priceId: undefined, envKey: undefined, isLegacy: false, source: 'missing' as const };
      priceId = resolved.priceId;
      if (!priceId) {
        Logger.error('Checkout error: missing price configuration', { userId, envTried: resolvedPlanSeed?.externalPriceEnv });
        return NextResponse.json({
          error: `Price not configured for plan ${planId}`
        }, { status: 500 });
      }
      if (resolved.isLegacy) {
        Logger.warn('Checkout resolved price via legacy env var. Rename to new contract name.', {
          planId,
          envKey: resolved.envKey,
          expectedEnv: resolvedPlanSeed?.externalPriceEnv,
        });
      }
    } else {
      // Custom plan - get from database using provider-aware lookup
      const providerKey = getCurrentProviderKey();
      const priceIdsMap = dbPlanRecord?.['externalPriceIds'];
      const legacyPriceId = dbPlanRecord && typeof dbPlanRecord['externalPriceId'] === 'string' 
        ? String(dbPlanRecord['externalPriceId']) : undefined;
      
      priceId = getIdByProvider(priceIdsMap, providerKey, legacyPriceId);
      
      if (!priceId) {
        Logger.error('Checkout error: plan missing price for provider', { userId, provider: providerKey, planId });
        return jsonError('This plan is not configured for checkout. Please contact support.', 400, 'PLAN_PRICE_MISSING');
      }
    }

    let promotionCodeId: string | undefined;
    let couponRedemptionId: string | undefined;
    let appliedCoupon: { id: string; code: string; percentOff: number | null; amountOffCents: number | null } | null = null;
    let inAppDiscountCents = 0; // For providers that don't support native coupons
    let razorpayOfferId: string | null = null;
    let discountedSubscriptionPriceId: string | null = null;
    let subscriptionDiscountCentsApplied = 0;

    const checkoutMode = dbPlanRecord && dbPlanRecord['autoRenew'] === true ? 'subscription' : 'payment';

    if (couponCode) {
      const normalized = normalizeCouponCode(couponCode);
      const coupon = await prisma.coupon.findUnique({
        where: { code: normalized },
        include: couponWithPlansInclude,
      }) as CouponWithPlans | null;
      if (!coupon) {
        return jsonError('Coupon code is invalid', 400, 'COUPON_INVALID');
      }

      const allowedPlanIds = coupon.applicablePlans.map((entry) => entry.planId);
      if (allowedPlanIds.length > 0) {
        if (!targetPlanId || !allowedPlanIds.includes(targetPlanId)) {
          const allowedNames = coupon.applicablePlans
            .map((entry) => entry.plan?.name)
            .filter((value): value is string => typeof value === 'string' && value.length > 0);
          const allowedLabel = allowedNames.length > 0 ? allowedNames.join(', ') : 'the eligible plans';
          const planLabel = targetPlanName ?? 'this plan';
          return jsonError(
            `Coupon is only valid for ${allowedLabel}. The selected plan (${planLabel}) is not eligible.`,
            400,
            'COUPON_PLAN_INELIGIBLE',
          );
        }
      }

      const redemption = await prisma.couponRedemption.findUnique({
        where: {
          couponId_userId: {
            couponId: coupon.id,
            userId: userId!,
          },
        },
      });

      if (!redemption) {
        return jsonError('You must redeem this coupon from your dashboard before using it', 400, 'COUPON_NOT_REDEEMED');
      }

      if (redemption.consumedAt) {
        return jsonError('This coupon has already been used', 400, 'COUPON_ALREADY_USED');
      }

      const now = new Date();
      if (!coupon.active) {
        return jsonError('Coupon is no longer active', 400, 'COUPON_INACTIVE');
      }
      if (coupon.startsAt && coupon.startsAt > now) {
        return jsonError('Coupon is not active yet', 400, 'COUPON_NOT_STARTED');
      }
      if (coupon.endsAt && coupon.endsAt < now) {
        return jsonError('Coupon has expired', 400, 'COUPON_EXPIRED');
      }
      if (!isCouponCurrentlyActive(coupon)) {
        return jsonError('Coupon is not available right now', 400, 'COUPON_UNAVAILABLE');
      }

      if (coupon.duration === 'repeating') {
        const months = typeof coupon.durationInMonths === 'number' ? coupon.durationInMonths : null;
        if (!months || months <= 0) {
          return jsonError('Repeating coupons require durationInMonths.', 400, 'COUPON_DURATION_MONTHS_INVALID');
        }
      }

      // Validate coupon currency compatibility for amount-off coupons
      const activeProviderKey = getCurrentProviderKey();
      const checkoutCurrency = getProviderCurrency(activeProviderKey);
      if (!isCouponValidForCurrency(coupon, checkoutCurrency)) {
        const couponCurrency = coupon.currency?.toUpperCase() || 'UNKNOWN';
        return jsonError(`This coupon is only valid for ${couponCurrency} transactions`, 400, 'COUPON_CURRENCY_INVALID');
      }

      const minimumPurchaseCents = typeof coupon.minimumPurchaseCents === 'number' ? coupon.minimumPurchaseCents : null;
      const preDiscountAmountCents = plan?.priceCents ?? 0;
      if (minimumPurchaseCents != null && minimumPurchaseCents > 0 && preDiscountAmountCents < minimumPurchaseCents) {
        const minimumLabel = formatCurrency(minimumPurchaseCents, checkoutCurrency, { showCode: true });
        return jsonError(`This coupon requires a minimum purchase of ${minimumLabel}.`, 400, 'COUPON_MINIMUM_PURCHASE');
      }

      const couponResult = await ensureProviderCoupon(coupon);
      
      if (couponResult.providerSupportsCoupons) {
        // Provider supports native coupons - use promotion code
        if (!couponResult.promotionCodeId) {
          return jsonError('Coupon is not configured for checkout. Please try again later.', 400, 'COUPON_PROVIDER_CONFIG_MISSING');
        }
        promotionCodeId = couponResult.promotionCodeId;
      } else {
        // We do NOT support applying in-app discounts to subscription checkouts.
        // For providers that lack native coupon support, recurring plan discounts must be handled by
        // provider-side constructs (discounted plans) or a different checkout UX.
        if (checkoutMode === 'subscription') {
          // Razorpay: implement subscription discounts by creating a discounted plan_id dynamically.
          // This is only correct for FOREVER coupons (lifetime discount), because plan-based subscriptions have fixed pricing.
          // We implement subscription discounts by dynamically creating a discounted plan on providers that support plan creation.
          if (activeProviderKey === 'razorpay' || activeProviderKey === 'paystack') {
            const couponDuration = typeof coupon.duration === 'string' ? coupon.duration : 'once';
            if (couponDuration !== 'forever') {
              return jsonError(
                `This coupon cannot be applied to ${activeProviderKey} subscriptions unless it is a FOREVER coupon. Use a one-time plan, or switch to a provider with native subscription discounts.`,
                400,
                'COUPON_DURATION_UNSUPPORTED',
              );
            }

            const planPriceCents = plan?.priceCents ?? 0;
            const discountCents = calculateCouponDiscountCents(coupon, planPriceCents);
            const discountedAmount = Math.max(0, planPriceCents - discountCents);
            if (discountedAmount <= 0) {
              return jsonError('Final checkout amount must be greater than 0', 400, 'CHECKOUT_AMOUNT_INVALID');
            }

            const intervalRaw = dbPlanRecord && typeof dbPlanRecord['recurringInterval'] === 'string'
              ? String(dbPlanRecord['recurringInterval'])
              : 'month';
            const intervalCount = dbPlanRecord && typeof dbPlanRecord['recurringIntervalCount'] === 'number'
              ? Math.max(1, Math.floor(dbPlanRecord['recurringIntervalCount']))
              : 1;
            type RecurringInterval = 'day' | 'week' | 'month' | 'year';
            const isRecurringInterval = (value: string): value is RecurringInterval =>
              value === 'day' || value === 'week' || value === 'month' || value === 'year';
            const interval: RecurringInterval = isRecurringInterval(intervalRaw) ? intervalRaw : 'month';

            const planCurrency = getProviderCurrency(activeProviderKey);
            const basePriceId = String(priceId || '');
            const cacheKey = buildDiscountedSubscriptionPriceCacheKey({
              provider: activeProviderKey,
              basePriceId,
              planId: planId,
              couponId: coupon.id,
              couponUpdatedAtMs: coupon.updatedAt ? new Date(coupon.updatedAt).getTime() : null,
              currency: planCurrency,
              interval,
              intervalCount,
              originalAmountCents: planPriceCents,
              discountedAmountCents: discountedAmount,
            });

            const cached = await getCachedDiscountedSubscriptionPriceId(cacheKey);
            if (cached) {
              discountedSubscriptionPriceId = cached;
              subscriptionDiscountCentsApplied = discountCents;
              Logger.info('Reusing cached discounted subscription price', {
                provider: activeProviderKey,
                planId,
                couponId: coupon.id,
                basePriceId,
                discountedPriceId: cached,
              });
            } else {
              const acquired = await tryAcquireDiscountedSubscriptionPriceKey(cacheKey);
              if (!acquired) {
                for (let i = 0; i < 8; i++) {
                  await new Promise((r) => setTimeout(r, 200));
                  const appeared = await getCachedDiscountedSubscriptionPriceId(cacheKey);
                  if (appeared) {
                    discountedSubscriptionPriceId = appeared;
                    subscriptionDiscountCentsApplied = discountCents;
                    Logger.info('Reusing cached discounted subscription price (after wait)', {
                      provider: activeProviderKey,
                      planId,
                      couponId: coupon.id,
                      basePriceId,
                      discountedPriceId: appeared,
                    });
                    break;
                  }
                }
              }

              if (!discountedSubscriptionPriceId) {
                try {
                  const legacyProductId = dbPlanRecord && typeof dbPlanRecord['externalProductId'] === 'string'
                    ? String(dbPlanRecord['externalProductId'])
                    : undefined;
                  const productIdFromMap = getIdByProvider(dbPlanRecord?.['externalProductIds'], activeProviderKey, legacyProductId);
                  const productId = productIdFromMap || (await paymentService.provider.createProduct({
                    name: targetPlanName || plan?.name || 'Plan',
                    description: targetPlanName || plan?.name || 'Plan',
                  }));

                  const priceOpts = {
                    productId,
                    unitAmount: discountedAmount,
                    currency: planCurrency,
                    recurring: { interval, intervalCount },
                    metadata: {
                      name: `${(targetPlanName || plan?.name || 'Plan').slice(0, 80)} (${coupon.code})`,
                      description: `Discounted plan for coupon ${coupon.code}`,
                      couponCode: coupon.code,
                      planId: planId,
                    },
                  };

                  let created;
                  try {
                    created = await paymentService.provider.createPrice(priceOpts);
                  } catch (priceErr) {
                    // If the provider rejected the currency, fall back to its default currency.
                    const errMsg = priceErr instanceof Error ? priceErr.message : '';
                    const fallbackCurrency = getProviderDefaultCurrency(activeProviderKey);
                    if (/not a supported currency|unsupported currency/i.test(errMsg) && fallbackCurrency.toUpperCase() !== planCurrency.toUpperCase()) {
                      Logger.warn('Provider rejected currency; retrying with default', { planCurrency, fallbackCurrency, provider: activeProviderKey });
                      created = await paymentService.provider.createPrice({ ...priceOpts, currency: fallbackCurrency });
                    } else {
                      throw priceErr;
                    }
                  }

                  discountedSubscriptionPriceId = created.id;
                  subscriptionDiscountCentsApplied = discountCents;
                  await setCachedDiscountedSubscriptionPriceId(cacheKey, activeProviderKey, created.id);
                } catch (err) {
                  await clearDiscountedSubscriptionPriceKey(cacheKey);
                  throw err;
                }
              }
            }
          } else {
            return NextResponse.json(
              {
                error: `Coupons are not supported for subscription checkouts with ${activeProviderKey}. Please choose a one-time plan or contact support.`,
              },
              { status: 400 }
            );
          }
        }

        // Optional Razorpay-native offers mapping for one-time checkouts.
        // If enabled and the coupon description contains a Razorpay offer id, prefer the offer over in-app discounts.
        if (activeProviderKey === 'razorpay' && process.env.RAZORPAY_ENABLE_OFFERS === 'true') {
          const extracted = extractRazorpayOfferId(coupon);
          if (extracted) {
            razorpayOfferId = extracted;
            inAppDiscountCents = 0;
            Logger.info('Coupon mapped to Razorpay offer_id (one-time checkout)', {
              couponId: coupon.id,
              couponCode: coupon.code,
              offerId: razorpayOfferId,
            });
          }
        }

        // Provider doesn't support native coupons - calculate discount to apply in-app
        // (Skip if we already applied a subscription discount via a discounted provider plan.)
        if (!razorpayOfferId && !discountedSubscriptionPriceId) {
          const planPriceCents = plan?.priceCents ?? 0;
          inAppDiscountCents = calculateCouponDiscountCents(coupon, planPriceCents);
          Logger.info('Applying in-app discount (provider does not support native coupons)', {
            couponId: coupon.id,
            couponCode: coupon.code,
            originalPriceCents: planPriceCents,
            discountCents: inAppDiscountCents,
          });
        }
      }

      couponRedemptionId = redemption.id;
      appliedCoupon = { 
        id: couponResult.coupon.id, 
        code: couponResult.coupon.code,
        percentOff: coupon.percentOff,
        amountOffCents: coupon.amountOffCents,
      };
    }

    const dbPlanExternalId = typeof dbPlanRecord?.['externalPriceId'] === 'string' ? String(dbPlanRecord['externalPriceId']) : null;
    const needsSync = usingPlanSeed && typeof priceId === 'string' && dbPlanExternalId !== priceId;
    if (needsSync) {
      await syncPlanExternalPriceIds();
    }

    try {
      const mode = checkoutMode;
      if (resolvedPlanSeed && resolvedPlanSeed.priceMode !== checkoutMode) {
        Logger.warn('Plan checkout mode differs from seeded price contract. Verify env price type.', {
          planId,
          planName: targetPlanName,
          seedMode: resolvedPlanSeed.priceMode,
          resolvedMode: checkoutMode,
        });
      }
      const base = getEnv().NEXT_PUBLIC_APP_URL;
      const metadata: Record<string, string> = { planId };
      const resolvedLocalOrganizationId = checkoutWorkspaceContext?.organizationId
        ?? activeOrganizationContext?.organization.id
        ?? null;
      if (resolvedLocalOrganizationId) {
        metadata.activeOrganizationId = resolvedLocalOrganizationId;
        metadata.organizationId = resolvedLocalOrganizationId;
      }
      const resolvedProviderOrganizationId = authService.providerName === 'clerk'
        ? (activeClerkOrgId ?? checkoutWorkspaceContext?.providerOrganizationId ?? null)
        : null;
      if (resolvedProviderOrganizationId) {
        metadata.activeProviderOrganizationId = resolvedProviderOrganizationId;
        metadata.activeClerkOrgId = resolvedProviderOrganizationId;
        metadata.clerkOrgId = resolvedProviderOrganizationId;
        metadata.orgId = resolvedProviderOrganizationId;
      }
      if (priceId) {
        metadata.priceId = priceId;
        metadata.planPriceId = priceId;
      }
      if (appliedCoupon) {
        metadata.couponId = appliedCoupon.id;
        metadata.couponCode = appliedCoupon.code;
      }
      if (couponRedemptionId) {
        metadata.couponRedemptionId = couponRedemptionId;
      }
      if (skipProrationCheck) {
        metadata.prorationOverride = 'true';
        if (prorationFallbackReason) {
          metadata.prorationFallbackReason = prorationFallbackReason;
        }
      }

      if (razorpayOfferId) {
        metadata.razorpayOfferId = razorpayOfferId;
        if (plan?.priceCents != null) {
          metadata.originalPriceCents = String(plan.priceCents);
        }
      }

      if (discountedSubscriptionPriceId) {
        metadata.originalPriceId = String(priceId || '');
        metadata.discountedPriceId = discountedSubscriptionPriceId;
        if (subscriptionDiscountCentsApplied > 0) {
          metadata.inAppDiscountCents = String(subscriptionDiscountCentsApplied);
          if (plan?.priceCents != null) metadata.originalPriceCents = String(plan.priceCents);
        }
      }

      // Calculate final amount (apply in-app discount if provider doesn't support native coupons)
      let checkoutAmount = plan?.priceCents;
      if (inAppDiscountCents > 0 && checkoutAmount && plan) {
        checkoutAmount = Math.max(0, checkoutAmount - inAppDiscountCents);
        metadata.inAppDiscountCents = String(inAppDiscountCents);
        metadata.originalPriceCents = String(plan.priceCents);
        Logger.info('Checkout with in-app discount applied', {
          userId,
          originalPriceCents: plan.priceCents,
          discountCents: inAppDiscountCents,
          finalPriceCents: checkoutAmount,
          couponCode: appliedCoupon?.code,
        });
      }

      const providerName = paymentService.provider.name;
      const successSince = Date.now();
      const successUrl = providerName === 'stripe'
        ? `${base}/dashboard?purchase=success&provider=${encodeURIComponent(providerName)}&session_id={CHECKOUT_SESSION_ID}`
        : providerName === 'razorpay'
          ? `${base}/checkout/razorpay/callback?provider=razorpay`
          : `${base}/checkout/return?provider=${encodeURIComponent(providerName)}&status=success&since=${encodeURIComponent(String(successSince))}`;
      const cancelUrl = `${base}/pricing?canceled=1`;

      const checkoutPriceId = discountedSubscriptionPriceId || priceId;
      const typedMode: 'payment' | 'subscription' = mode === 'subscription' ? 'subscription' : 'payment';
      const checkoutCurrency = getProviderCurrency(getCurrentProviderKey());
      const session = await paymentService.provider.createCheckoutSession({
        userId,
        priceId: checkoutPriceId,
        amount: typedMode === 'payment' ? checkoutAmount : undefined,
        currency: typedMode === 'payment' ? checkoutCurrency : undefined,
        mode: typedMode,
        successUrl,
        cancelUrl,
        promotionCodeId,
        customerEmail: user.email,
        metadata,
        subscriptionMetadata: typedMode === 'subscription' ? metadata : undefined,
      });

      if (!session.url) {
        return jsonError('Payment provider did not return a checkout URL', 500, 'CHECKOUT_URL_MISSING');
      }

      return NextResponse.json({ url: session.url });
    } catch (err: unknown) {
      const e = toError(err);
      Logger.error('Payment provider session creation failed', { error: e.message, stack: e.stack, userId });

      // Check for specific error messages from the provider
      if (e.message.includes('Price must be recurring')) {
        return jsonError('Selected price is not configured as a recurring price. Please contact support.', 400, 'PRICE_NOT_RECURRING');
      }
      if (e.message.includes('Price must be one-time')) {
        return jsonError('Selected price is recurring but this plan expects a one-time payment price. Please contact support.', 400, 'PRICE_MODE_MISMATCH');
      }
      return jsonError('Payment session creation failed', 500, 'CHECKOUT_SESSION_FAILED');
    }

  } catch (e: unknown) {
    const err = toError(e);
    Logger.error('Checkout route fatal error', { error: err.message, stack: err.stack, userId: userId || undefined });
    return jsonError(err.message || 'Internal error', 500, 'CHECKOUT_FATAL_ERROR');
  }
}
