import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { Logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { toError } from '@/lib/runtime-guards';
import { findPlanSeedByName } from '@/lib/plans';
import { persistEnvValue } from '@/lib/env-files';
import { apiSchemas, withValidation } from '@/lib/validation';
import { adminRateLimit } from '@/lib/rateLimit';
import { providerSupportsOneTimePrices, setIdByProvider } from '@/lib/utils/provider-ids';
import { PaymentProviderFactory } from '@/lib/payment/factory';
import { getProviderCurrency } from '@/lib/payment/registry';
import { sanitizeRichText } from '@/lib/htmlSanitizer';
import { PaymentError } from '@/lib/payment/errors';

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


export async function GET(request: NextRequest) {
  try {
    const adminId = await requireAdmin();
    const rateLimitResult = await adminRateLimit(adminId, request, 'admin-plans:list', { limit: 240, windowMs: 120_000 });

    if (!rateLimitResult.success && !rateLimitResult.allowed) {
      Logger.error('Admin plans GET rate limiter unavailable', {
        actorId: adminId,
        error: rateLimitResult.error
      });
      return NextResponse.json(
        { error: 'Service temporarily unavailable. Please retry shortly.' },
        { status: 503 }
      );
    }

    if (!rateLimitResult.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
      Logger.warn('Admin plans GET rate limit exceeded', {
        actorId: adminId,
        remaining: rateLimitResult.remaining
      });
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfterSeconds.toString()
          }
        }
      );
    }

    const plans = await prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } });
    // Map to a safe serializable shape to avoid leaking internal fields
    const mapped = plans.map(p => ({
      id: p.id,
      name: p.name,
      shortDescription: p.shortDescription,
      description: p.description,
      priceCents: p.priceCents,
      durationHours: p.durationHours,
      active: p.active,
      stripePriceId: p.stripePriceId,
      externalPriceId: p.externalPriceId,
      externalPriceIds: p.externalPriceIds,
      externalProductIds: p.externalProductIds,
      autoRenew: p.autoRenew,
      recurringInterval: p.recurringInterval,
      recurringIntervalCount: p.recurringIntervalCount,
      sortOrder: p.sortOrder,
      tokenLimit: p.tokenLimit,
      tokenName: p.tokenName,
      supportsOrganizations: p.supportsOrganizations,
      organizationSeatLimit: p.organizationSeatLimit,
      organizationTokenPoolStrategy: p.organizationTokenPoolStrategy,
    }));
    return NextResponse.json(mapped);
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Get plans error', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 });
  }
}

export const POST = withValidation(apiSchemas.adminPlanCreate, async (request, payload) => {
  try {
    const adminId = await requireAdmin();
    const rateLimitResult = await adminRateLimit(adminId, request, 'admin-plans:create', { limit: 60, windowMs: 120_000 });

    if (!rateLimitResult.success && !rateLimitResult.allowed) {
      Logger.error('Admin plans POST rate limiter unavailable', {
        actorId: adminId,
        error: rateLimitResult.error
      });
      return NextResponse.json(
        { error: 'Service temporarily unavailable. Please retry shortly.' },
        { status: 503 }
      );
    }

    if (!rateLimitResult.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
      Logger.warn('Admin plans POST rate limit exceeded', {
        actorId: adminId,
        remaining: rateLimitResult.remaining
      });
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfterSeconds.toString()
          }
        }
      );
    }

    const {
      name,
      shortDescription,
      description,
      durationHours,
      priceCents,
      active,
      sortOrder,
      stripePriceId,
      autoRenew,
      recurringInterval,
      recurringIntervalCount,
      tokenLimit,
      tokenName,
      supportsOrganizations,
      organizationSeatLimit,
      organizationTokenPoolStrategy,
    } = payload;

    const shortDescriptionValue = typeof shortDescription === 'string' ? shortDescription : shortDescription ?? null;
    const rawDescriptionValue = typeof description === 'string' ? description : description ?? null;
    const descriptionValue = typeof rawDescriptionValue === 'string' && rawDescriptionValue.trim().length > 0
      ? await sanitizeRichText(rawDescriptionValue)
      : null;
    const autoCreate = process.env.STRIPE_AUTO_CREATE === '1';
    let stripePriceIdToSave = typeof stripePriceId === 'string' ? stripePriceId : undefined;
    let externalPriceIdsToSave: string | null = null;
    let externalProductIdsToSave: string | null = null;

    // Sync plan to ALL configured payment providers (not just the active one)
    if (!stripePriceIdToSave && autoCreate) {
      const configuredProviders = PaymentProviderFactory.getAllConfiguredProviders();
      
      for (const { name: providerName, provider } of configuredProviders) {
        let providerCurrency: string | null = null;
        try {
          // Paystack doesn't support one-time prices; only create for subscriptions or providers that support one-time
          const shouldCreatePrice = autoRenew || providerSupportsOneTimePrices(providerName);

          if (!shouldCreatePrice) {
            Logger.info('Skipping price creation for one-time plan (provider does not support one-time prices)', {
              planName: name,
              provider: providerName,
            });
            continue;
          }

          // Razorpay catalog modeling differs: a Razorpay "Plan" includes an embedded "item" with amount+currency.
          // Creating standalone Items via createProduct() can fail because our CreateProductOptions does not carry
          // currency/amount. For Razorpay, let createPrice() create/link the item and return productId.
          const productId = providerName === 'razorpay'
            ? ''
            : await provider.createProduct({
                name,
                description: shortDescriptionValue || undefined
              });

          // Use provider-specific currency (Paystack doesn't support USD)
          providerCurrency = getProviderCurrency(providerName);

          const price = await provider.createPrice({
            unitAmount: priceCents,
            currency: providerCurrency,
            productId: productId,
            recurring: autoRenew
              ? {
                  interval: recurringInterval as 'day' | 'week' | 'month' | 'year',
                  intervalCount: recurringIntervalCount,
                }
              : undefined,
            metadata: { name } // Pass plan name for Paystack
          });

          // Update provider maps
          externalPriceIdsToSave = setIdByProvider(externalPriceIdsToSave, providerName, price.id);
          const productIdToSave = providerName === 'razorpay'
            ? (price.productId || null)
            : productId;

          if (productIdToSave) {
            externalProductIdsToSave = setIdByProvider(externalProductIdsToSave, providerName, productIdToSave);
          }

          // Use first created price as the legacy stripePriceId (for backward compatibility)
          if (!stripePriceIdToSave) {
            stripePriceIdToSave = price.id;
          }

          Logger.info('Created price on provider', {
            planName: name,
            provider: providerName,
            priceId: price.id,
            productId,
          });

        } catch (e: unknown) {
      // Include provider root error details when available (e.g. Razorpay error body)
      const unwrapped = unwrapPaymentError(e);
      Logger.error('Auto-create price failed on provider', {
      provider: providerName,
      planName: name,
      currency: providerCurrency,
      razorpayCurrencyOverride: providerName === 'razorpay' ? (process.env.RAZORPAY_CURRENCY || null) : null,
      error: toError(e).message,
      providerMessages: unwrapped.messages,
      providerRoot: unwrapped.root,
      });
        }
      }

      // Persist env value for matching plan seed (use first/primary price ID)
      if (stripePriceIdToSave) {
        const seed = findPlanSeedByName(name);
        if (seed) {
          await persistEnvValue(seed.externalPriceEnv, stripePriceIdToSave);
        } else {
          Logger.info('Auto-created prices without matching plan seed; env sync skipped', {
            planName: name,
            stripePriceId: stripePriceIdToSave,
          });
        }
      }
    }

    const plan = await prisma.plan.create({
      data: {
        name,
        shortDescription: shortDescriptionValue,
        description: descriptionValue,
        durationHours,
        priceCents,
        active,
        sortOrder,
        stripePriceId: stripePriceIdToSave ?? null,
        externalPriceId: stripePriceIdToSave ?? null,
        externalPriceIds: externalPriceIdsToSave,
        externalProductIds: externalProductIdsToSave,
        autoRenew,
        recurringInterval,
        recurringIntervalCount,
        tokenLimit: tokenLimit ?? null,
        tokenName: tokenName ?? null,
        supportsOrganizations: Boolean(supportsOrganizations),
        organizationSeatLimit: supportsOrganizations ? (organizationSeatLimit ?? null) : null,
        organizationTokenPoolStrategy: supportsOrganizations ? (organizationTokenPoolStrategy ?? 'SHARED_FOR_ORG') : null,
        scope: supportsOrganizations ? 'TEAM' : 'INDIVIDUAL',
      },
    });

    return NextResponse.json({ success: true, plan });
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Create plan error', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
  }
});
