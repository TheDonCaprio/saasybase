import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { paymentService } from '../../../../lib/payment/service';
import { prisma } from '../../../../lib/prisma';
import { Logger } from '../../../../lib/logger';
import { getEnv } from '../../../../lib/env';
import { rateLimit, getClientIP } from '../../../../lib/rateLimit';
import { toError } from '../../../../lib/runtime-guards';
import { parseProviderIdMap, mergeProviderIdMap } from '../../../../lib/utils/provider-ids';
import { PaymentError } from '../../../../lib/payment/errors';

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let userId: string | null = null;

  try {
    const { userId: authUserId } = await authService.getSession();
    userId = authUserId;
    const clientIp = getClientIP(request);
    const limiterKey = userId ? `billing-portal:user:${userId}` : `billing-portal:ip:${clientIp}`;
    const rateLimitResult = await rateLimit(limiterKey, { limit: 5, windowMs: 60000 }, {
      actorId: userId,
      ip: clientIp,
      userAgent: request.headers.get('user-agent'),
      route: '/api/billing/customer-portal',
      method: request.method
    });

    if (!rateLimitResult.success && !rateLimitResult.allowed) {
      Logger.error('Billing portal rate limiter unavailable', {
        key: limiterKey,
        error: rateLimitResult.error
      });
      return jsonError('Service temporarily unavailable. Please retry shortly.', 503, 'RATE_LIMIT_UNAVAILABLE');
    }

    if (!rateLimitResult.allowed) {
      Logger.warn('Billing portal rate limit exceeded', {
        remaining: rateLimitResult.remaining,
        actorId: userId ?? undefined,
        key: limiterKey
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

    if (!userId) {
      Logger.warn('Billing portal access attempt without authentication');
      return jsonError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    // Include the origin header to reduce unused-param noise and aid debugging
    const origin = request.headers.get('origin') ?? getEnv().NEXT_PUBLIC_APP_URL;
    Logger.info('Customer portal session requested', { userId, origin });

    const provider = paymentService.provider;

    // Determine the provider for this user's current billing relationship.
    // Prefer the active/most-recent subscription's provider, then user.paymentProvider,
    // then fall back to the configured active provider.

    // First check if user already has any customer IDs stored
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        externalCustomerId: true,
        externalCustomerIds: true,
        paymentProvider: true,
        email: true,
        name: true,
      }
    });

    const activeSub = await prisma.subscription.findFirst({
      where: {
        userId,
        paymentProvider: { not: null },
        status: { in: ['ACTIVE', 'PAST_DUE', 'PENDING'] },
      },
      orderBy: { expiresAt: 'desc' },
      select: { paymentProvider: true }
    });

    const providerKey = (activeSub?.paymentProvider || user?.paymentProvider || provider.name) as string;
    const providerForUser = paymentService.getProviderForRecord(providerKey);

    const idMap = parseProviderIdMap(user?.externalCustomerIds);
    let customerId: string | null = idMap[providerForUser.name] || null;

    if (!customerId && user?.externalCustomerId && user?.paymentProvider === providerForUser.name) {
      customerId = user.externalCustomerId;
    }

    if (customerId) {
      Logger.info('Found existing provider customer id for portal', { userId, provider: providerForUser.name });
    } else {
      Logger.info('Creating provider customer for portal', { userId, provider: providerForUser.name });
      try {
        customerId = await providerForUser.createCustomer(userId, user?.email || '', user?.name || undefined);

        const merged = mergeProviderIdMap(user?.externalCustomerIds, providerForUser.name, customerId);
        await prisma.user.update({
          where: { id: userId },
          data: {
            externalCustomerIds: merged ?? user?.externalCustomerIds,
            paymentProvider: providerForUser.name,
          }
        });
      } catch (err) {
        Logger.error('Failed to create provider customer for portal', {
          error: toError(err).message,
          userId,
          provider: providerForUser.name,
        });
        throw err;
      }
    }

    if (!customerId) {
      throw new Error('Failed to get or create provider customer ID');
    }

    Logger.info('Creating billing portal session', { userId });
    try {
      const base = getEnv().NEXT_PUBLIC_APP_URL;
      const returnUrl = `${base}/dashboard/billing`;
      const supported = providerForUser.supportsFeature('customer_portal');

      if (!supported) {
        return NextResponse.json({
          url: returnUrl,
          provider: providerForUser.name,
          supported: false,
          message: 'Your payment provider does not support a hosted billing portal. If you need to update your payment method, please contact support.'
        });
      }

      // Paystack's hosted management page is per-subscription (not per-customer).
      // If the user's active provider is Paystack, prefer the active Paystack subscription code.
      let portalTargetId = customerId;
      if (providerForUser.name === 'paystack') {
        const paystackSub = await prisma.subscription.findFirst({
          where: {
            userId,
            paymentProvider: 'paystack',
            status: { in: ['ACTIVE', 'PAST_DUE', 'PENDING'] },
          },
          orderBy: { expiresAt: 'desc' },
          select: { externalSubscriptionId: true },
        });

        const subCode = paystackSub?.externalSubscriptionId || null;
        if (!subCode) {
          return NextResponse.json({
            url: returnUrl,
            provider: providerForUser.name,
            supported: false,
            message: 'No active Paystack subscription found to manage. If you need to update your card for a Paystack subscription, please contact support.'
          });
        }

        portalTargetId = subCode;
      }

    // Razorpay's best-effort "manage" UX is subscription-scoped via subscription.short_url.
    // Prefer the user's active Razorpay subscription id.
    if (providerForUser.name === 'razorpay') {
      const razorpaySub = await prisma.subscription.findFirst({
        where: {
          userId,
          paymentProvider: 'razorpay',
          status: { in: ['ACTIVE', 'PAST_DUE', 'PENDING'] },
        },
        orderBy: { expiresAt: 'desc' },
        select: { externalSubscriptionId: true },
      });

      const subId = razorpaySub?.externalSubscriptionId || null;
      if (!subId) {
        return NextResponse.json({
          url: returnUrl,
          provider: providerForUser.name,
          supported: false,
          message: 'No active Razorpay subscription found to manage. If you need to update your payment method, please contact support.'
        });
      }

      portalTargetId = subId;
    }

      let url: string;
      try {
        url = await providerForUser.createCustomerPortalSession(portalTargetId, returnUrl);
      } catch (err) {
        const originalError = err instanceof PaymentError ? err.originalError : undefined;
        Logger.warn('Provider customer portal session creation failed', {
          userId,
          provider: providerForUser.name,
          error: toError(err).message,
          providerError: originalError ? toError(originalError).message : undefined,
        });
        return NextResponse.json({
          url: returnUrl,
          provider: providerForUser.name,
          supported: false,
          message: 'Unable to open the billing portal for your payment provider. Please contact support if you need to update your payment method.'
        });
      }

      Logger.info('Portal session created successfully', {
        userId,
        sessionCreated: true
      });

      // Log API performance
      Logger.apiRequest('POST', '/api/billing/customer-portal', userId, Date.now() - startTime);

      return NextResponse.json({
        url,
        provider: providerForUser.name,
        supported: true,
      });
    } catch (stripeError: unknown) {
      const e = toError(stripeError);
      Logger.error('Billing portal error', { error: e.message, stack: e.stack, userId });

      // Check if it's a billing portal configuration issue
      if (e.message.includes('billing portal')) {
        return jsonError(
          'Billing portal not configured. Please set up the customer portal in your Stripe dashboard.',
          500,
          'BILLING_PORTAL_NOT_CONFIGURED',
        );
      }

      throw e;
    }

  } catch (error: unknown) {
    const e = toError(error);
    Logger.error('Error creating customer portal session', { error: e.message, stack: e.stack, userId: userId || undefined });
    return jsonError('Failed to create customer portal session', 500, 'BILLING_PORTAL_FAILED');
  }
}
