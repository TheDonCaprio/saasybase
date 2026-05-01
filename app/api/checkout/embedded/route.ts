import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { authService } from '@/lib/auth-provider';
import type { Prisma } from '@/lib/prisma-client';
import { prisma } from '../../../../lib/prisma';
import { paymentService } from '../../../../lib/payment/service';
import { Logger } from '../../../../lib/logger';
import { toError, asRecord } from '../../../../lib/runtime-guards';
import { PLAN_DEFINITIONS, resolveSeededPlanPriceForProvider, syncPlanExternalPriceIds } from '../../../../lib/plans';
import { getEnv } from '../../../../lib/env';
import { setIdByProvider, getCurrentProviderKey, getIdByProvider } from '../../../../lib/utils/provider-ids';
import { rateLimit, getClientIP } from '../../../../lib/rateLimit';
import { getDefaultTokenLabel } from '../../../../lib/settings';
import { PaymentError } from '../../../../lib/payment/errors';
import { formatCurrency } from '../../../../lib/utils/currency';
import {
    calculateCouponDiscountCents,
    ensureProviderCoupon,
    extractRazorpayOfferId,
    isCouponCurrentlyActive,
    isCouponValidForCurrency,
    normalizeCouponCode,
} from '../../../../lib/coupons';
import { getProviderCurrency, getProviderDefaultCurrency } from '../../../../lib/payment/registry';
import {
    buildDiscountedSubscriptionPriceCacheKey,
    clearDiscountedSubscriptionPriceKey,
    getCachedDiscountedSubscriptionPriceId,
    setCachedDiscountedSubscriptionPriceId,
    tryAcquireDiscountedSubscriptionPriceKey,
} from '../../../../lib/payment/discountedSubscriptionPriceCache';
import { resolveCheckoutWorkspaceContext } from '../../../../lib/checkout-workspace-context';
import { workspaceService } from '../../../../lib/workspace-service';

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
        { redirectTo: '/dashboard/plan' },
    );
}

function personalWorkspacePurchaseRequiredResponse() {
    return jsonError(
        'Personal plans can only be purchased from your personal workspace. Switch out of the active organization workspace and try again.',
        409,
        'PERSONAL_PLAN_BLOCKED_IN_WORKSPACE',
        { redirectTo: '/pricing' },
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

function unwrapPaymentError(err: unknown): { messages: string[]; root: unknown } {
    const messages: string[] = [];
    let cur: unknown = err;

    for (let i = 0; i < 6; i += 1) {
        if (cur instanceof Error) messages.push(cur.message);
        if (cur instanceof PaymentError && cur.originalError != null) {
            cur = cur.originalError;
            continue;
        }
        break;
    }

    return { messages: Array.from(new Set(messages)).filter(Boolean), root: cur };
}

async function handleEmbeddedCheckout(req: NextRequest) {
    const { userId, orgId: activeClerkOrgId } = await authService.getSession();
    if (!userId) {
        return jsonError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    // Rate limiting - match main checkout route
    const clientIp = getClientIP(req);
    const userAgent = req.headers.get('user-agent');
    const limiterKey = `embedded-checkout:user:${userId}`;
    const rateLimitResult = await rateLimit(limiterKey, { limit: 10, windowMs: 60000 }, {
        actorId: userId,
        ip: clientIp,
        userAgent,
        route: '/api/checkout/embedded',
        method: req.method
    });
    if (!rateLimitResult.success && !rateLimitResult.allowed) {
        Logger.warn('Embedded checkout rate limit exceeded', { userId, ip: clientIp });
        return jsonError('Too many requests. Please try again later.', 429, 'RATE_LIMITED');
    }

    // Support both POST (body JSON) and GET (query params) callers
    let payload: Record<string, unknown> = {};
    const contentType = req.headers.get('content-type') || '';
    if (req.method === 'POST' && contentType.includes('application/json')) {
        payload = await req.json().catch(() => ({}));
    } else {
        const params = req.nextUrl.searchParams;
        payload = {
            amount: params.get('amount') || undefined,
            currency: params.get('currency') || undefined,
            planId: params.get('planId') || undefined,
            priceId: params.get('priceId') || undefined,
            mode: params.get('mode') || undefined,
            dedupeKey: params.get('dedupeKey') || undefined,
            couponCode: params.get('couponCode') || undefined,
            activeOrganizationId: params.get('activeOrganizationId') || undefined,
            organizationId: params.get('organizationId') || undefined,
            localOrganizationId: params.get('localOrganizationId') || undefined,
            skipProrationCheck: params.get('skipProrationCheck') || undefined,
            prorationFallbackReason: params.get('prorationFallbackReason') || undefined,
        };
    }

    try {
        const amount = typeof payload.amount === 'number'
            ? payload.amount
            : typeof payload.amount === 'string'
                ? Number(payload.amount)
                : undefined;
        const currency = typeof payload.currency === 'string' ? payload.currency : undefined;
        const planId = typeof payload.planId === 'string' ? payload.planId : undefined;
        let { priceId, mode = 'payment' } = payload as { priceId?: string; mode?: string };
        const requestedActiveOrganizationId = resolveExplicitActiveOrganizationId(payload)
            || req.nextUrl.searchParams.get('activeOrganizationId')
            || req.nextUrl.searchParams.get('organizationId')
            || req.nextUrl.searchParams.get('localOrganizationId')
            || null;
        const rawCouponCode = typeof (payload as { couponCode?: unknown })?.couponCode === 'string' ? String((payload as { couponCode?: unknown }).couponCode) : '';
        const couponCode = rawCouponCode.trim() || null;
        const skipProrationCheck = (payload as { skipProrationCheck?: unknown })?.skipProrationCheck === true
            || String((payload as { skipProrationCheck?: unknown })?.skipProrationCheck || '').toLowerCase() === 'true';
        const prorationFallbackReasonRaw = typeof (payload as { prorationFallbackReason?: unknown })?.prorationFallbackReason === 'string'
            ? String((payload as { prorationFallbackReason?: unknown }).prorationFallbackReason)
            : '';
        const prorationFallbackReason = prorationFallbackReasonRaw.trim().slice(0, 100) || null;
        const rawDedupeKey = typeof payload?.dedupeKey === 'string' ? payload.dedupeKey.trim() : '';
        const dedupeKey = rawDedupeKey || randomUUID();

        // Hoist shared state for plan resolution so we can use it later (amount fallback, etc.)
        let resolvedPlanSeed: (typeof PLAN_DEFINITIONS)[number] | undefined;
        let dbPlanRecord: Record<string, unknown> | null = null;
        let targetPlanId: string | null = null;
        let targetPlanName: string | null = null;

        // Plan resolution logic
        if (planId) {
            const planSeed = PLAN_DEFINITIONS.find(p => p.id === planId);
            resolvedPlanSeed = planSeed;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let plan: any = planSeed
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

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let dbPlan: any = null;

            if (plan) {
                dbPlan = await prisma.plan.findFirst({ where: { name: plan.name } });
                if (!dbPlan) {
                    return jsonError('Plan config missing', 500, 'PLAN_CONFIG_MISSING');
                }
                dbPlanRecord = asRecord(dbPlan);
                targetPlanId = typeof dbPlanRecord?.['id'] === 'string' ? String(dbPlanRecord['id']) : null;
                targetPlanName = typeof dbPlanRecord?.['name'] === 'string' ? String(dbPlanRecord['name']) : null;
            } else {
                dbPlan = await prisma.plan.findUnique({ where: { id: planId } });
                if (!dbPlan) {
                    return jsonError('Plan not found', 404, 'PLAN_NOT_FOUND');
                }
                dbPlanRecord = asRecord(dbPlan);
                targetPlanId = planId;
                targetPlanName = dbPlanRecord && typeof dbPlanRecord['name'] === 'string' ? String(dbPlanRecord['name']) : null;
                const planName = dbPlanRecord && typeof dbPlanRecord['name'] === 'string' ? dbPlanRecord['name'] : '';
                const matchingSeed = PLAN_DEFINITIONS.find(p => p.name === planName);

                if (!matchingSeed) {
                    const externalPriceId = dbPlanRecord && typeof dbPlanRecord['externalPriceId'] === 'string' ? dbPlanRecord['externalPriceId'] : null;

                    if (!externalPriceId) {
                        return jsonError('Plan not configured for checkout', 400, 'PLAN_PRICE_MISSING');
                    }
                    plan = {
                        id: String(planId),
                        name: planName || `Plan ${planId}`,
                        priceMode: dbPlanRecord?.['autoRenew'] === true ? 'subscription' : 'payment',
                    };
                }

                if (!plan && matchingSeed) {
                    plan = { ...matchingSeed };
                    resolvedPlanSeed = matchingSeed;
                }
            }

            if (!dbPlanRecord) dbPlanRecord = asRecord(dbPlan);

            // Resolve Price ID
            const usingPlanSeed = Boolean(resolvedPlanSeed);
            if (usingPlanSeed) {
                const currentProviderKey = getCurrentProviderKey();
                const resolved = resolvedPlanSeed
                    ? resolveSeededPlanPriceForProvider(resolvedPlanSeed, {
                        providerKey: currentProviderKey,
                        externalPriceIds: dbPlanRecord?.['externalPriceIds'],
                        legacyExternalPriceId: dbPlanRecord && typeof dbPlanRecord['externalPriceId'] === 'string'
                            ? String(dbPlanRecord['externalPriceId'])
                            : null,
                    })
                    : { priceId: undefined, envKey: undefined, isLegacy: false, source: 'missing' as const };
                priceId = resolved.priceId;
                if (!priceId) {
                    const allowsRazorpayOneTimeAmountCheckout = currentProviderKey === 'razorpay' && resolvedPlanSeed?.priceMode === 'payment';
                    if (!allowsRazorpayOneTimeAmountCheckout) {
                        return jsonError(`Price not configured for plan ${planId}`, 500, 'PLAN_PRICE_MISSING');
                    }
                }
            } else {
                // Custom plan - use provider-aware lookup from externalPriceIds map
                const providerKey = getCurrentProviderKey();
                const priceIdsMap = dbPlanRecord?.['externalPriceIds'];
                const legacyPriceId = dbPlanRecord && typeof dbPlanRecord['externalPriceId'] === 'string' 
                    ? String(dbPlanRecord['externalPriceId']) : undefined;
                
                priceId = getIdByProvider(priceIdsMap, providerKey, legacyPriceId);

                if (!priceId) {
                    Logger.error('Embedded checkout: plan missing price for provider', { userId, provider: providerKey, planId });
                    return jsonError('Plan not configured for checkout', 400, 'PLAN_PRICE_MISSING');
                }
            }

            // Sync if needed
            const dbPlanExternalId = typeof dbPlanRecord?.['externalPriceId'] === 'string' ? String(dbPlanRecord['externalPriceId']) : null;
            if (usingPlanSeed && typeof priceId === 'string' && dbPlanExternalId !== priceId) {
                await syncPlanExternalPriceIds();
            }

            // Determine mode
            mode = dbPlanRecord && dbPlanRecord['autoRenew'] === true ? 'subscription' : 'payment';

            const selectedPlanIsTeam = dbPlanRecord?.['supportsOrganizations'] === true;
            const requestedOrganizationRef = requestedActiveOrganizationId ?? activeClerkOrgId ?? null;
            const checkoutWorkspaceContext = requestedOrganizationRef
                ? await resolveCheckoutWorkspaceContext(userId, requestedOrganizationRef)
                : null;
            const hasActiveWorkspace = Boolean(activeClerkOrgId) || Boolean(checkoutWorkspaceContext);

            if (!selectedPlanIsTeam && hasActiveWorkspace) {
                return personalWorkspacePurchaseRequiredResponse();
            }

            if (selectedPlanIsTeam && checkoutWorkspaceContext?.role === 'MEMBER') {
                return teamWorkspaceOwnerRequiredResponse();
            }

            // If using Paystack but we don't have a Paystack plan code, fall back to one-time payment
            // This avoids plan-code errors when a user with Stripe history tries to pay via Paystack.
            const providerName = paymentService.provider.name;
            if (providerName === 'paystack' && mode === 'subscription') {
                const looksLikeStripePrice = typeof priceId === 'string' && priceId.startsWith('price_');
                const hasPaystackPlan = typeof priceId === 'string' && !looksLikeStripePrice;
                if (!hasPaystackPlan) {
                    mode = 'payment';
                }
            }

            // Razorpay subscriptions require a Razorpay plan id (plan_...).
            // If the plan only has Stripe/Paystack IDs, fail fast with a clear error.
            if (providerName === 'razorpay' && mode === 'subscription') {
                const hasRazorpayPlan = typeof priceId === 'string' && priceId.startsWith('plan_');
                if (!hasRazorpayPlan) {
                    return jsonError(
                        'Plan not configured for Razorpay subscription checkout (missing Razorpay plan_id)',
                        400,
                        'PLAN_PRICE_MISSING',
                    );
                }
            }

            // Paddle requires a Paddle catalog price id (pri_...) for both one-time and subscription checkouts.
            // If the plan only has Stripe/Paystack IDs, fail fast with a clear error.
            if (providerName === 'paddle') {
                const hasPaddlePrice = typeof priceId === 'string' && priceId.startsWith('pri_');
                if (!hasPaddlePrice) {
                    return jsonError('Plan not configured for Paddle checkout', 400, 'PLAN_PRICE_MISSING');
                }
            }
        }

        // Resolve final amount (fallback to plan price if not provided)
        let resolvedAmount = amount;
        if (resolvedAmount == null) {
            const dbAmount = typeof dbPlanRecord?.['priceCents'] === 'number' ? dbPlanRecord['priceCents'] : undefined;
            const seedAmount = resolvedPlanSeed && typeof resolvedPlanSeed.priceCents === 'number' ? resolvedPlanSeed.priceCents : undefined;
            resolvedAmount = dbAmount ?? seedAmount;
        }

        if (resolvedAmount == null || Number.isNaN(resolvedAmount) || resolvedAmount <= 0) {
            return jsonError('Invalid amount for checkout', 400, 'CHECKOUT_AMOUNT_INVALID');
        }

        // Ensure integer in smallest unit
        resolvedAmount = Math.round(resolvedAmount);

        // Keep the original plan amount for UI + receipts.
        const originalAmountCents = resolvedAmount;

        const providerName = paymentService.provider.name;
        const activeProviderKey = getCurrentProviderKey();
        const checkoutMode: 'payment' | 'subscription' = mode === 'subscription' ? 'subscription' : 'payment';

        // Coupon handling (parity with /api/checkout for embedded flow)
        // For one-time checkouts we can reduce the checkout amount directly.
        // For subscription checkouts on some providers (e.g. Razorpay), discounts may be
        // implemented by swapping to a discounted provider plan id, without subtracting from amount.
        let inAppDiscountCents = 0;
        let discountCentsApplied = 0;
        let couponSummaryDiscountCents = 0;
        let razorpayOfferId: string | null = null;
        let subscriptionDiscountApplied = false;
        let originalPriceIdForMetadata: string | null = null;
        let discountedPriceIdForMetadata: string | null = null;
        let providerPromotionCodeId: string | null = null;
        let couponRedemptionId: string | undefined;
        let appliedCoupon: { id: string; code: string } | null = null;

        if (couponCode) {
            if (!planId) {
                return jsonError('Coupon requires a planId', 400, 'COUPON_PLAN_REQUIRED');
            }

            const normalized = normalizeCouponCode(couponCode);
            const coupon = (await prisma.coupon.findUnique({
                where: { code: normalized },
                include: couponWithPlansInclude,
            })) as CouponWithPlans | null;

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
            if (!coupon.active) return jsonError('Coupon is no longer active', 400, 'COUPON_INACTIVE');
            if (coupon.startsAt && coupon.startsAt > now) return jsonError('Coupon is not active yet', 400, 'COUPON_NOT_STARTED');
            if (coupon.endsAt && coupon.endsAt < now) return jsonError('Coupon has expired', 400, 'COUPON_EXPIRED');
            if (!isCouponCurrentlyActive(coupon)) return jsonError('Coupon is not available right now', 400, 'COUPON_UNAVAILABLE');

            if (coupon.duration === 'repeating') {
                const months = typeof coupon.durationInMonths === 'number' ? coupon.durationInMonths : null;
                if (!months || months <= 0) {
                    return jsonError('Repeating coupons require durationInMonths.', 400, 'COUPON_DURATION_MONTHS_INVALID');
                }
            }

            const checkoutCurrency = getProviderCurrency(activeProviderKey);
            if (!isCouponValidForCurrency(coupon, checkoutCurrency)) {
                const couponCurrency = coupon.currency?.toUpperCase() || 'UNKNOWN';
                return jsonError(`This coupon is only valid for ${couponCurrency} transactions`, 400, 'COUPON_CURRENCY_INVALID');
            }

            const minimumPurchaseCents = typeof coupon.minimumPurchaseCents === 'number' ? coupon.minimumPurchaseCents : null;
            if (minimumPurchaseCents != null && minimumPurchaseCents > 0 && resolvedAmount < minimumPurchaseCents) {
                const minimumLabel = formatCurrency(minimumPurchaseCents, checkoutCurrency, { showCode: true });
                return jsonError(`This coupon requires a minimum purchase of ${minimumLabel}.`, 400, 'COUPON_MINIMUM_PURCHASE');
            }

            // Ensure provider artifacts when supported (Stripe, etc.). For providers that don't support
            // native coupons, we apply a best-effort discount in-app (one-time) or require a provider offer (subscription).
            const couponResult = await ensureProviderCoupon(coupon);
            providerPromotionCodeId = couponResult.promotionCodeId;

            // Razorpay: subscriptions have fixed plan pricing and do not support arbitrary
            // amount overrides at subscription creation. To keep this region/currency agnostic,
            // we implement subscription discounts by dynamically creating a discounted plan.
            // This is only correct for "forever" coupons (lifetime discount).
            if ((activeProviderKey === 'razorpay' || activeProviderKey === 'paystack') && checkoutMode === 'subscription') {
                const couponDuration = typeof coupon.duration === 'string' ? coupon.duration : 'once';
                if (couponDuration !== 'forever') {
                    return jsonError(
                        `This coupon cannot be applied to ${activeProviderKey} subscriptions unless it is a FOREVER coupon. Use a one-time plan, or switch to a provider with native subscription discounts.`,
                        400,
                        'COUPON_DURATION_UNSUPPORTED',
                    );
                }

                const discountCents = calculateCouponDiscountCents(coupon, resolvedAmount);
                const discountedAmount = Math.max(0, resolvedAmount - discountCents);
                if (discountedAmount <= 0) {
                    return jsonError('Final checkout amount must be greater than 0', 400, 'CHECKOUT_AMOUNT_INVALID');
                }

                const basePriceId = typeof priceId === 'string' ? priceId : '';

                const intervalRaw = typeof dbPlanRecord?.['recurringInterval'] === 'string' ? String(dbPlanRecord['recurringInterval']) : 'month';
                const intervalCount = typeof dbPlanRecord?.['recurringIntervalCount'] === 'number'
                    ? Math.max(1, Math.floor(dbPlanRecord['recurringIntervalCount']))
                    : 1;
                type RecurringInterval = 'day' | 'week' | 'month' | 'year';
                const isRecurringInterval = (value: string): value is RecurringInterval =>
                    value === 'day' || value === 'week' || value === 'month' || value === 'year';
                const interval: RecurringInterval = isRecurringInterval(intervalRaw) ? intervalRaw : 'month';

                const planCurrency = getProviderCurrency(activeProviderKey);
                const cacheKey = buildDiscountedSubscriptionPriceCacheKey({
                    provider: activeProviderKey,
                    basePriceId,
                    planId,
                    couponId: coupon.id,
                    couponUpdatedAtMs: coupon.updatedAt ? new Date(coupon.updatedAt).getTime() : null,
                    currency: planCurrency,
                    interval,
                    intervalCount,
                    originalAmountCents: resolvedAmount,
                    discountedAmountCents: discountedAmount,
                });

                let discountedProviderPriceId: string | null = await getCachedDiscountedSubscriptionPriceId(cacheKey);
                if (!discountedProviderPriceId) {
                    const acquired = await tryAcquireDiscountedSubscriptionPriceKey(cacheKey);
                    if (!acquired) {
                        for (let i = 0; i < 8; i++) {
                            await new Promise((r) => setTimeout(r, 200));
                            const appeared = await getCachedDiscountedSubscriptionPriceId(cacheKey);
                            if (appeared) {
                                discountedProviderPriceId = appeared;
                                break;
                            }
                        }
                    }

                    if (!discountedProviderPriceId) {
                        try {
                            // Resolve product id for plan creation.
                            const legacyProductId = typeof dbPlanRecord?.['externalProductId'] === 'string' ? String(dbPlanRecord['externalProductId']) : undefined;
                            const productIdFromMap = getIdByProvider(dbPlanRecord?.['externalProductIds'], activeProviderKey, legacyProductId);
                            const productId = productIdFromMap || (await paymentService.provider.createProduct({
                                name: targetPlanName || resolvedPlanSeed?.name || 'Plan',
                                description: targetPlanName || resolvedPlanSeed?.name || 'Plan',
                            }));

                            const priceOpts = {
                                productId,
                                unitAmount: discountedAmount,
                                currency: planCurrency,
                                recurring: { interval, intervalCount },
                                metadata: {
                                    name: `${(targetPlanName || resolvedPlanSeed?.name || 'Plan').slice(0, 80)} (${coupon.code})`,
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

                            discountedProviderPriceId = created.id;
                            await setCachedDiscountedSubscriptionPriceId(cacheKey, activeProviderKey, created.id);
                        } catch (err) {
                            await clearDiscountedSubscriptionPriceKey(cacheKey);
                            throw err;
                        }
                    }
                }

                // Swap to the discounted provider plan id for subscription checkout.
                originalPriceIdForMetadata = typeof priceId === 'string' ? priceId : null;
                discountedPriceIdForMetadata = discountedProviderPriceId;
                priceId = discountedProviderPriceId;
                resolvedAmount = discountedAmount;
                discountCentsApplied = discountCents;
                // IMPORTANT: do not subtract from resolvedAmount again below.
                inAppDiscountCents = 0;
                subscriptionDiscountApplied = true;
            }

            // For one-time payments: try Razorpay offer mapping first (if enabled), else in-app amount reduction.
            if (activeProviderKey === 'razorpay' && checkoutMode === 'payment' && process.env.RAZORPAY_ENABLE_OFFERS === 'true') {
                const extracted = extractRazorpayOfferId(coupon);
                if (extracted) {
                    razorpayOfferId = extracted;
                    inAppDiscountCents = 0;
                }
            }

            if (!razorpayOfferId && !subscriptionDiscountApplied) {
                if (checkoutMode === 'subscription') {
                    // Stripe + Paddle support provider-native subscription discounts.
                    // For other providers, require an offer-based or plan-swap mechanism.
                    if (!providerPromotionCodeId) {
                        return jsonError(
                            `Coupons are not supported for subscription checkouts with ${activeProviderKey}.`,
                            400,
                            'COUPON_SUBSCRIPTION_UNSUPPORTED',
                        );
                    }
                    // Provider-native subscription discounts: we do not adjust `resolvedAmount` here,
                    // but we can still return a summary value for display.
                    couponSummaryDiscountCents = calculateCouponDiscountCents(coupon, resolvedAmount);
                } else {
                    inAppDiscountCents = calculateCouponDiscountCents(coupon, resolvedAmount);
                    discountCentsApplied = inAppDiscountCents;
                    couponSummaryDiscountCents = discountCentsApplied;
                }
            }

            couponRedemptionId = redemption.id;
            appliedCoupon = { id: coupon.id, code: coupon.code };
        }

        // For subscription plan-swap discounts we already set the final amount; prefer that discount value.
        if (subscriptionDiscountApplied && discountCentsApplied > 0) {
            couponSummaryDiscountCents = discountCentsApplied;
        }

        if (inAppDiscountCents > 0) {
            resolvedAmount = Math.max(0, resolvedAmount - inAppDiscountCents);
        }

        if (resolvedAmount <= 0) {
            return jsonError('Final checkout amount must be greater than 0', 400, 'CHECKOUT_AMOUNT_INVALID');
        }

        // Resolve customer
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return jsonError('User not found', 404, 'USER_NOT_FOUND');
        }

        // Resolve provider-specific customer IDs. Prefer the provider map; fall back to the legacy single-value field.
        const providerKey = getCurrentProviderKey();
        let customerId = getIdByProvider(user.externalCustomerIds, providerKey, user.externalCustomerId) ?? undefined;

        // Razorpay checkout.js (orders/subscriptions) does not require creating/updating a Razorpay Customer.
        // Skipping customer sync avoids failures like:
        // - updateCustomer transient 5xx
        // - createCustomer 400 "Customer already exists for the merchant"
        const shouldManageCustomer = providerName !== 'razorpay';

        // If we switched providers, the stored ID might belong to another provider. Clear it to avoid 404s.
        if (providerName === 'paystack' && customerId && !customerId.toUpperCase().startsWith('CUS')) {
            customerId = undefined;
        }
        if (providerName === 'stripe' && customerId && !customerId.startsWith('cus_')) {
            customerId = undefined;
        }
        if (providerName === 'paddle' && customerId && !customerId.startsWith('ctm_')) {
            customerId = undefined;
        }
        if (providerName === 'razorpay' && customerId && !customerId.startsWith('cust_')) {
            customerId = undefined;
        }

        // Sync or recreate customer if stale
        let needsPersist = false;
        if (shouldManageCustomer && customerId && (user.name || user.email)) {
            try {
                await paymentService.provider.updateCustomer(customerId, {
                    name: user.name || undefined,
                    email: user.email || undefined,
                });
            } catch (err) {
                // If provider rejects (e.g., customer deleted/not found), recreate
                Logger.warn('Provider customer sync failed; recreating', { error: toError(err).message, userId, customerId, providerName });
                customerId = undefined;
            }
        }

        if (shouldManageCustomer && !customerId && user.email) {
            customerId = await paymentService.provider.createCustomer(userId, user.email, user.name || undefined);
            needsPersist = true;
        }

        if (needsPersist && customerId) {
            const user = await prisma.user.findUnique({ where: { id: userId }, select: { externalCustomerIds: true } });
            await prisma.user.update({
                where: { id: userId },
                data: {
                    externalCustomerId: customerId,
                    externalCustomerIds: setIdByProvider(user?.externalCustomerIds, providerKey, customerId)
                }
            });
        }

        if (shouldManageCustomer && !customerId) {
            return jsonError('Could not create customer (missing email)', 400, 'CUSTOMER_EMAIL_REQUIRED');
        }

        const base = getEnv().NEXT_PUBLIC_APP_URL;
        const metadata: Record<string, string> = { userId };
        const requestedOrganizationRef = requestedActiveOrganizationId ?? activeClerkOrgId ?? null;
        const checkoutWorkspaceContext = requestedOrganizationRef
            ? await resolveCheckoutWorkspaceContext(userId, requestedOrganizationRef)
            : null;
        if (checkoutWorkspaceContext?.organizationId) {
            metadata.activeOrganizationId = checkoutWorkspaceContext.organizationId;
            metadata.organizationId = checkoutWorkspaceContext.organizationId;
        }
        const resolvedProviderOrganizationId = workspaceService.usesExternalProviderOrganizations
            ? (activeClerkOrgId ?? checkoutWorkspaceContext?.providerOrganizationId ?? null)
            : null;
        if (resolvedProviderOrganizationId) {
            metadata.activeClerkOrgId = resolvedProviderOrganizationId;
            metadata.clerkOrgId = resolvedProviderOrganizationId;
            metadata.orgId = resolvedProviderOrganizationId;
        }
        if (typeof planId === 'string') metadata.planId = planId;
        if (typeof priceId === 'string') metadata.priceId = priceId;
        metadata.checkoutMode = mode === 'subscription' ? 'subscription' : 'payment';

        if (originalPriceIdForMetadata && discountedPriceIdForMetadata) {
            metadata.originalPriceId = originalPriceIdForMetadata;
            metadata.discountedPriceId = discountedPriceIdForMetadata;
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
        if (discountCentsApplied > 0) {
            metadata.inAppDiscountCents = String(discountCentsApplied);
            metadata.originalPriceCents = String(originalAmountCents);
        }
        if (razorpayOfferId) {
            metadata.razorpayOfferId = razorpayOfferId;
            metadata.originalPriceCents = String(originalAmountCents);
        }

        // Some providers (including Razorpay checkout.js) redirect back through a provider callback.
        // Use a lightweight return page to finalize confirmation and avoid duplicate dashboard loads.
        const successUrl = providerName === 'razorpay'
            ? `${base}/checkout/razorpay/callback?provider=razorpay`
            : `${base}/dashboard?purchase=success&payment_intent=${encodeURIComponent(dedupeKey)}&provider=${paymentService.provider.name}`;

        const cancelUrl = providerName === 'razorpay'
            ? `${base}/dashboard?purchase=cancelled&provider=razorpay&status=cancelled`
            : `${base}/pricing?canceled=1`;

        const opts = {
            userId,
            priceId,
            amount: resolvedAmount,
            currency,
            mode,
            customerId,
            customerEmail: user.email || undefined,
            promotionCodeId: providerPromotionCodeId || undefined,
            metadata,
            subscriptionMetadata: metadata,
            successUrl,
            cancelUrl,
            dedupeKey,
        };

        const normalizedMode: 'payment' | 'subscription' = mode === 'subscription' ? 'subscription' : 'payment';
        const typedOpts = { ...opts, mode: normalizedMode } as const;
        const resolvedCheckoutCurrency = (
            typeof currency === 'string' && currency.trim().length > 0
                ? currency
                : getProviderCurrency(getCurrentProviderKey())
        ).toUpperCase();

        // Get plan name for display
        const planName = resolvedPlanSeed?.name 
            || (dbPlanRecord?.['name'] as string | undefined) 
            || undefined;
        
        // Get plan token information
        const dbTokenLimit = typeof dbPlanRecord?.['tokenLimit'] === 'number' ? dbPlanRecord['tokenLimit'] : null;
        const tokenLimit = dbTokenLimit; // Will be null if unlimited or not set
        const planTokenName = typeof dbPlanRecord?.['tokenName'] === 'string' ? dbPlanRecord['tokenName'] : null;
        const tokenName = planTokenName || await getDefaultTokenLabel();
        const durationHours = typeof dbPlanRecord?.['durationHours'] === 'number'
            ? dbPlanRecord['durationHours']
            : resolvedPlanSeed?.durationHours || null;
        // Prefer shortDescription for compact display in embedded flows
        const shortDescription = typeof dbPlanRecord?.['shortDescription'] === 'string'
            ? dbPlanRecord['shortDescription']
            : (resolvedPlanSeed?.description || null);

        // Paddle integration is redirect-only (no embedded Elements/clientSecret flow).
        if (providerName === 'paddle') {
            const session = await paymentService.provider.createCheckoutSession(typedOpts);
            return NextResponse.json({
                redirect: true,
                url: session.url,
                sessionId: session.id,
                provider: providerName,
                amount: resolvedAmount,
                originalAmount: originalAmountCents,
                discountCents: couponSummaryDiscountCents,
                couponCode: appliedCoupon?.code ?? null,
                currency: resolvedCheckoutCurrency,
                planName,
                email: user.email,
                metadata,
                tokenLimit,
                tokenName,
                durationHours,
                shortDescription,
            });
        }

        // For Paystack subscriptions, use hosted checkout page (redirect flow) instead of embedded
        // Paystack only creates subscriptions properly via /transaction/initialize with redirect
        // Embedded checkout doesn't produce reusable authorizations needed for subscriptions
        if (providerName === 'paystack' && normalizedMode === 'subscription') {
            const session = await paymentService.provider.createCheckoutSession(typedOpts);
            return NextResponse.json({
                redirect: true,
                url: session.url,
                sessionId: session.id,
                provider: providerName,
                amount: resolvedAmount,
                originalAmount: originalAmountCents,
                discountCents: couponSummaryDiscountCents,
                couponCode: appliedCoupon?.code ?? null,
                currency: resolvedCheckoutCurrency,
                planName,
                email: user.email,
                metadata,
                tokenLimit,
                tokenName,
                durationHours,
                shortDescription,
            });
        }

        let result;
        if (normalizedMode === 'subscription') {
            result = await paymentService.createSubscriptionIntent(typedOpts);
        } else {
            result = await paymentService.createPaymentIntent(typedOpts);
        }

        return NextResponse.json({
            ...result,
            provider: paymentService.provider.name,
            amount: resolvedAmount,
            originalAmount: originalAmountCents,
            discountCents: couponSummaryDiscountCents,
            couponCode: appliedCoupon?.code ?? null,
            email: user.email,
            currency: resolvedCheckoutCurrency,
            planName,
            metadata,
            paymentIntentId: (result as { paymentIntentId?: string; subscriptionId?: string }).paymentIntentId
                || (result as { subscriptionId?: string }).subscriptionId
                || dedupeKey,
        });
    } catch (err) {
        const error = toError(err);
        const unwrapped = unwrapPaymentError(err);
        const providerName = paymentService.provider.name;
        const rootRecord = asRecord(unwrapped.root);
        const providerError = rootRecord ? asRecord(rootRecord.error) : null;
        const providerErrorCode = providerError && typeof providerError.code === 'string' ? providerError.code : null;
		const providerRootBody = rootRecord ? asRecord(rootRecord.body) : null;
		const razorpayErr = providerRootBody ? asRecord(providerRootBody.error) : null;
		const razorpayDesc = razorpayErr && typeof razorpayErr.description === 'string' ? razorpayErr.description : null;

        Logger.error('Elements checkout error', {
            error: error.message,
            provider: providerName,
            providerMessages: unwrapped.messages,
            providerRoot: unwrapped.root,
        });

        // Paddle account misconfiguration: cannot generate checkout URLs without a default payment link.
        if (providerName === 'paddle' && providerErrorCode === 'transaction_default_checkout_url_not_set') {
            return jsonError(
                'Paddle checkout is not configured. Set a Default Payment Link in your Paddle Dashboard (Checkout settings), then retry.',
                503,
                'PADDLE_CHECKOUT_NOT_CONFIGURED',
            );
        }

        // Razorpay common config issue: subscription plan_id doesn't exist in this Razorpay account.
        // Convert to a clear 400 instead of a generic 500.
        if (providerName === 'razorpay' && razorpayDesc && /id provided does not exist/i.test(razorpayDesc)) {
            return jsonError(
                'Plan not configured for Razorpay (the configured plan_id does not exist in this Razorpay account)',
                400,
                'PLAN_PRICE_MISSING',
            );
        }

        return jsonError(error.message || 'Embedded checkout failed', 500, 'CHECKOUT_EMBEDDED_FAILED');
    }
}

export async function POST(req: NextRequest) {
    return handleEmbeddedCheckout(req);
}

export async function GET(req: NextRequest) {
    return handleEmbeddedCheckout(req);
}
