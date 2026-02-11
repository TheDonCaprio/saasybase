import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { paymentService } from '@/lib/payment/service';
import { toError } from '@/lib/runtime-guards';
import { Logger } from '@/lib/logger';
import { adminRateLimit } from '@/lib/rateLimit';
import { persistEnvValue } from '@/lib/env-files';
import { findPlanSeedByName } from '@/lib/plans';
import { getProviderCurrency } from '@/lib/payment/registry';

function getPlanId(context: unknown): string | null {
  const params = (context as { params?: { planId?: string } } | undefined)?.params;
  return params?.planId ?? null;
}

export async function POST(request: NextRequest, context: unknown) {
  try {
    const adminId = await requireAdmin();
    const planId = getPlanId(context);

    if (!planId) {
      return NextResponse.json({ error: 'Missing planId' }, { status: 400 });
    }

    // Rate limit
    const rl = await adminRateLimit(adminId, request, 'admin-plans:createPrice', {
      limit: 20,
      windowMs: 120_000
    });

    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for plan price creation', {
        actorId: adminId,
        error: rl.error
      });
      return NextResponse.json(
        { error: 'Service temporarily unavailable. Please retry shortly.' },
        { status: 503 }
      );
    }

    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': retryAfterSeconds.toString() }
        }
      );
    }

    // Validate environment
    if (!process.env.STRIPE_SECRET_KEY && !process.env.PAYMENT_PROVIDER) {
      return NextResponse.json(
        { error: 'Payment provider not configured' },
        { status: 400 }
      );
    }

    if (process.env.STRIPE_AUTO_CREATE !== '1' && process.env.PAYMENT_AUTO_CREATE !== '1') {
      return NextResponse.json(
        { error: 'Auto-creation is disabled' },
        { status: 400 }
      );
    }

    // Get the plan
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      include: {
        _count: {
          select: {
            subscriptions: {
              where: {
                status: 'ACTIVE',
                expiresAt: { gt: new Date() }
              }
            }
          }
        }
      }
    });

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Validate plan state
    if (!plan.priceCents || plan.priceCents <= 0) {
      return NextResponse.json(
        { error: 'Plan must have a valid price greater than 0' },
        { status: 400 }
      );
    }

    // Check for existing price with same amount (idempotency)
    if (plan.externalPriceId) {
      try {
        const existingPrice = await paymentService.provider.verifyPrice(plan.externalPriceId);
        if (existingPrice.unitAmount === plan.priceCents) {
          Logger.info('Price already exists with same amount', {
            planId,
            externalPriceId: plan.externalPriceId,
            amount: plan.priceCents
          });
          return NextResponse.json({
            success: true,
            message: 'Price already exists with current amount',
            plan,
            externalPriceId: plan.externalPriceId,
            activeSubscriptions: plan._count.subscriptions
          });
        }
      } catch (error) {
        // If we can't retrieve the existing price, proceed with creation
        Logger.warn('Could not retrieve existing price, proceeding with creation', {
          planId,
          externalPriceId: plan.externalPriceId,
          error: toError(error).message
        });
      }
    }

    // Create Product (if needed) and Price
    let productId: string;

    try {
      // Try to find existing product by searching for one with the plan name
      const existingProductId = await paymentService.provider.findProduct(plan.name);

      if (existingProductId) {
        productId = existingProductId;
        Logger.info('Using existing product', { planId, productId, productName: plan.name });
      } else {
        // Create new product
        productId = await paymentService.provider.createProduct({
          name: plan.name,
          description: plan.shortDescription || undefined,
          metadata: {
            planId: plan.id,
            createdByAdmin: adminId,
            createdAt: new Date().toISOString()
          }
        });
        Logger.info('Created new product', { planId, productId, productName: plan.name });
      }

      // Create the price
      const price = await paymentService.provider.createPrice({
        unitAmount: plan.priceCents,
        currency: getProviderCurrency(paymentService.provider.name),
        productId: productId,
        metadata: {
          planId: plan.id,
          createdByAdmin: adminId,
          createdAt: new Date().toISOString()
        },
        recurring: (plan.autoRenew && plan.recurringInterval) ? {
          interval: plan.recurringInterval as 'day' | 'week' | 'month' | 'year',
          intervalCount: plan.recurringIntervalCount ?? 1,
        } : undefined
      });

      // Update plan with new external price ID
      const updatedPlan = await prisma.plan.update({
        where: { id: planId },
        data: { externalPriceId: price.id }
      });

      // Persist to env files if this matches a plan seed
      const seed = findPlanSeedByName(plan.name);
      if (seed) {
        try {
          await persistEnvValue(seed.externalPriceEnv, price.id);
          Logger.info('Persisted price to env file', {
            planId,
            externalPriceId: price.id,
            envKey: seed.externalPriceEnv
          });
        } catch (envError) {
          Logger.warn('Failed to persist price to env file', {
            planId,
            externalPriceId: price.id,
            envKey: seed.externalPriceEnv,
            error: toError(envError).message
          });
        }
      }

      Logger.info('Successfully created price for plan', {
        planId,
        externalPriceId: price.id,
        amount: plan.priceCents,
        currency: price.currency,
        recurring: !!price.recurring,
        createdByAdmin: adminId,
        activeSubscriptions: plan._count.subscriptions
      });

      return NextResponse.json({
        success: true,
        message: 'Price created successfully',
        plan: updatedPlan,
        price: {
          id: price.id,
          amount: price.unitAmount,
          currency: price.currency,
          recurring: price.recurring ? {
            interval: price.recurring.interval,
            interval_count: price.recurring.intervalCount
          } : null
        },
        product: {
          id: productId,
          name: plan.name
        },
        activeSubscriptions: plan._count.subscriptions,
        warning: plan._count.subscriptions > 0
          ? `${plan._count.subscriptions} active subscriptions will continue using the previous price. Manual migration required if desired.`
          : null
      });

    } catch (providerError) {
      const error = toError(providerError);
      Logger.error('Failed to create price', {
        planId,
        error: error.message,
        stack: error.stack,
        createdByAdmin: adminId
      });

      return NextResponse.json(
        {
          error: 'Failed to create price',
          details: error.message
        },
        { status: 500 }
      );
    }

  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    const planId = getPlanId(context);
    Logger.error('Create price error', {
      planId,
      error: err.message,
      stack: err.stack
    });

    return NextResponse.json(
      { error: 'Failed to create price' },
      { status: 500 }
    );
  }
}

