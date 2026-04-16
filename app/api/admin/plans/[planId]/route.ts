import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { recordAdminAction } from '@/lib/admin-actions';
import { prisma } from '@/lib/prisma';
import { toError } from '@/lib/runtime-guards';
import { Logger } from '@/lib/logger';
import { apiSchemas, withValidation } from '@/lib/validation';
import { adminRateLimit } from '@/lib/rateLimit';
import { findPlanSeedByName } from '@/lib/plans';
import { persistEnvValue } from '@/lib/env-files';
import { providerSupportsOneTimePrices, setIdByProvider, getIdByProvider, isProviderProductIdCompatible } from '@/lib/utils/provider-ids';
import { PaymentProviderFactory } from '@/lib/payment/factory';
import { isPaymentCatalogAutoCreateEnabled } from '@/lib/payment/auto-create';
import { getProviderCurrency } from '@/lib/payment/registry';
import { PAYMENT_PROVIDERS } from '@/lib/payment/provider-config';
import { PaymentError, PaymentProviderError } from '@/lib/payment/errors';
import type { Prisma } from '@/lib/prisma-client';
import { sanitizeRichText } from '@/lib/htmlSanitizer';
import type { PriceDetails } from '@/lib/payment/types';

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

function isUnsupportedCurrencyError(err: unknown): boolean {
  const unwrapped = unwrapPaymentError(err);
  const messages = unwrapped.messages.map(m => m.toLowerCase());
  return messages.some(m => m.includes('not a supported currency') || m.includes('unsupported currency'));
}

function getProviderFallbackCurrencies(providerName: string, triedCurrency: string): string[] {
  const config = PAYMENT_PROVIDERS[providerName.toLowerCase()];
  if (!config) return [];
  return config.supportedCurrencies
    .map(c => c.toUpperCase())
    .filter(c => c !== triedCurrency.toUpperCase());
}

function pushUniqueCandidate(candidates: string[], candidate: string | null | undefined) {
  if (!candidate || candidates.includes(candidate)) return;
  candidates.push(candidate);
}

function isRazorpayMissingItemError(providerName: string, error: Error | null): boolean {
  if (providerName !== 'razorpay' || !error) return false;
  return error.message.includes('BAD_REQUEST_ERROR: The id provided does not exist');
}

async function getPlanId(context: unknown): Promise<string | null> {
  const paramsOrPromise = (context as { params?: { planId?: string } | Promise<{ planId?: string }> } | undefined)?.params;
  const params = paramsOrPromise && typeof (paramsOrPromise as Promise<unknown>).then === 'function'
    ? await (paramsOrPromise as Promise<{ planId?: string }>)
    : paramsOrPromise as { planId?: string } | undefined;
  return params?.planId ?? null;
}

export const PATCH = withValidation(apiSchemas.adminPlanToggle, async (request: NextRequest, payload, context) => {
  try {
    const adminId = await requireAdmin();
    const rl = await adminRateLimit(adminId, request, 'admin-plans:toggle', { limit: 60, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for plan PATCH', { actorId: adminId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }
    const planId = await getPlanId(context);
    if (!planId) {
      return NextResponse.json({ error: 'Missing planId' }, { status: 400 });
    }

    const plan = await prisma.plan.update({
      where: { id: planId },
      data: { active: payload.active },
      select: { id: true, name: true, active: true },
    });

    await recordAdminAction({
      actorId: adminId,
      actorRole: 'ADMIN',
      action: payload.active ? 'plan.activate' : 'plan.deactivate',
      targetType: 'plan',
      details: { planId: plan.id, name: plan.name, active: plan.active },
    });

    return NextResponse.json({ success: true, plan });
  } catch (err: unknown) {
    const guard = toAuthGuardErrorResponse(err);
    if (guard) return guard;
    const planId = await getPlanId(context);
    const e = toError(err);
    Logger.error('Plan update error', { planId, error: e.message, stack: e.stack });
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
});

export const PUT = withValidation(apiSchemas.adminPlanUpdate, async (request: NextRequest, payload, context) => {
  try {
    const adminId = await requireAdmin();
    const rl = await adminRateLimit(adminId, request, 'admin-plans:update', { limit: 60, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for plan PUT', { actorId: adminId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }
    const planId = await getPlanId(context);
    if (!planId) {
      return NextResponse.json({ error: 'Missing planId' }, { status: 400 });
    }

    const existingPlan = await prisma.plan.findUnique({
      where: { id: planId },
    });
    if (!existingPlan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const nameProvided = Object.prototype.hasOwnProperty.call(payload, 'name');
    const shortDescriptionProvided = Object.prototype.hasOwnProperty.call(payload, 'shortDescription');
    const descriptionProvided = Object.prototype.hasOwnProperty.call(payload, 'description');
    const durationProvided = Object.prototype.hasOwnProperty.call(payload, 'durationHours');
    const isLifetimeProvided = Object.prototype.hasOwnProperty.call(payload, 'isLifetime');
    const priceProvided = Object.prototype.hasOwnProperty.call(payload, 'priceCents');
    const activeProvided = Object.prototype.hasOwnProperty.call(payload, 'active');
    const sortOrderProvided = Object.prototype.hasOwnProperty.call(payload, 'sortOrder');
    const externalPriceIdProvided = Object.prototype.hasOwnProperty.call(payload, 'externalPriceId');
    const legacyStripePriceIdProvided = Object.prototype.hasOwnProperty.call(payload, 'stripePriceId');
    const autoRenewProvided = Object.prototype.hasOwnProperty.call(payload, 'autoRenew');
    const recurringProvided = Object.prototype.hasOwnProperty.call(payload, 'recurringInterval');
    const recurringIntervalCountProvided = Object.prototype.hasOwnProperty.call(payload, 'recurringIntervalCount');
    const tokenLimitProvided = Object.prototype.hasOwnProperty.call(payload, 'tokenLimit');
    const tokenNameProvided = Object.prototype.hasOwnProperty.call(payload, 'tokenName');
    const supportsOrganizationsProvided = Object.prototype.hasOwnProperty.call(payload, 'supportsOrganizations');
    const organizationSeatLimitProvided = Object.prototype.hasOwnProperty.call(payload, 'organizationSeatLimit');
    const organizationTokenPoolStrategyProvided = Object.prototype.hasOwnProperty.call(payload, 'organizationTokenPoolStrategy');

    // Billing shape (type/interval/duration) is immutable after creation.
    if (autoRenewProvided && Boolean(payload.autoRenew) !== Boolean(existingPlan.autoRenew)) {
      return NextResponse.json(
        {
          error:
            'Plan type (auto-renew vs one-time) cannot be changed after creation. Duplicate or recreate the plan instead.',
        },
        { status: 400 }
      );
    }

    if (recurringProvided && (payload.recurringInterval ?? null) !== (existingPlan.recurringInterval ?? null)) {
      return NextResponse.json(
        {
          error:
            'Plan interval cannot be changed after creation. Duplicate or recreate the plan instead.',
        },
        { status: 400 }
      );
    }

    if (durationProvided && typeof payload.durationHours === 'number' && payload.durationHours !== existingPlan.durationHours) {
      return NextResponse.json(
        {
          error:
            'Plan duration cannot be changed after creation. Duplicate or recreate the plan instead.',
        },
        { status: 400 }
      );
    }

    if (isLifetimeProvided && Boolean(payload.isLifetime) !== Boolean(existingPlan.isLifetime)) {
      return NextResponse.json(
        {
          error:
            'Lifetime access cannot be changed after creation. Duplicate or recreate the plan instead.',
        },
        { status: 400 }
      );
    }

    if (
      organizationTokenPoolStrategyProvided
      && existingPlan.supportsOrganizations
      && payload.organizationTokenPoolStrategy !== existingPlan.organizationTokenPoolStrategy
    ) {
      return NextResponse.json(
        {
          error:
            'Token pool strategy cannot be changed after plan creation. Duplicate or recreate the plan instead.',
        },
        { status: 400 }
      );
    }

    const shortDescriptionValue = shortDescriptionProvided
      ? (typeof payload.shortDescription === 'string' ? payload.shortDescription : null)
      : undefined;
    const finalShortDescription = shortDescriptionProvided
      ? shortDescriptionValue ?? null
      : existingPlan.shortDescription;
    const rawDescriptionValue = descriptionProvided
      ? (typeof payload.description === 'string' ? payload.description : null)
      : undefined;
    const descriptionValue = descriptionProvided
      ? (typeof rawDescriptionValue === 'string' && rawDescriptionValue.trim().length > 0
        ? await sanitizeRichText(rawDescriptionValue)
        : null)
      : undefined;
    const finalName = nameProvided && typeof payload.name === 'string' ? payload.name : existingPlan.name;
    const finalPriceCents = priceProvided && typeof payload.priceCents === 'number'
      ? payload.priceCents
      : existingPlan.priceCents;

    const configuredProviders = PaymentProviderFactory.getAllConfiguredProviders();
    const autoCreateEnabled = isPaymentCatalogAutoCreateEnabled(
      configuredProviders.map(({ name: providerName }) => providerName)
    );
    const finalAutoRenew = autoRenewProvided ? Boolean(payload.autoRenew) : Boolean(existingPlan.autoRenew);
    const toggledAutoRenewOn = finalAutoRenew && !existingPlan.autoRenew;
    const toggledAutoRenewOff = !finalAutoRenew && existingPlan.autoRenew;

    const finalRecurringInterval = finalAutoRenew
      ? (recurringProvided ? (payload.recurringInterval ?? 'month') : existingPlan.recurringInterval ?? 'month')
      : toggledAutoRenewOff
        ? null
        : existingPlan.recurringInterval ?? null;

    const finalRecurringIntervalCount = finalAutoRenew
      ? (recurringIntervalCountProvided && typeof payload.recurringIntervalCount === 'number'
        ? payload.recurringIntervalCount
        : (existingPlan.recurringIntervalCount ?? 1))
      : 1;

    const intervalCountChanged =
      finalAutoRenew &&
      recurringIntervalCountProvided &&
      typeof payload.recurringIntervalCount === 'number' &&
      payload.recurringIntervalCount !== (existingPlan.recurringIntervalCount ?? 1);

    const existingExternalPriceId = existingPlan.externalPriceId ?? null;
    const providedExternalPriceId = externalPriceIdProvided
      ? (payload.externalPriceId ?? null)
      : legacyStripePriceIdProvided
        ? (payload.stripePriceId ?? null)
        : undefined;
    const providedExternalPriceIdString = typeof providedExternalPriceId === 'string' ? providedExternalPriceId : undefined;
    const providedMatchesExisting = (externalPriceIdProvided || legacyStripePriceIdProvided)
      && (providedExternalPriceId === existingExternalPriceId);

    let externalPriceIdToUse = providedExternalPriceId !== undefined
      ? providedExternalPriceId
      : (existingExternalPriceId ?? undefined);
    let shouldPersistExternalPriceId = externalPriceIdProvided || legacyStripePriceIdProvided;
    let envPersistValue: string | undefined;
    const updateWarnings: string[] = [];

    const createPriceWithCurrencyFallback = async (
      providerName: string,
      provider: {
        createPrice: (options: {
          unitAmount: number;
          currency: string;
          productId: string;
          recurring?: {
            interval: 'day' | 'week' | 'month' | 'year';
            intervalCount: number;
          };
          metadata?: Record<string, string>;
        }) => Promise<PriceDetails>;
      },
      options: {
        unitAmount: number;
        currency: string;
        productId: string;
        recurring?: {
          interval: 'day' | 'week' | 'month' | 'year';
          intervalCount: number;
        };
        metadata?: Record<string, string>;
      },
    ) => {
      const attemptedCurrency = options.currency;

      try {
        return await provider.createPrice(options);
      } catch (currencyErr) {
        if (!isUnsupportedCurrencyError(currencyErr)) throw currencyErr;

        const fallbacks = getProviderFallbackCurrencies(providerName, attemptedCurrency);
        if (fallbacks.length === 0) throw currencyErr;

        Logger.warn('Admin plan update: currency rejected, trying fallback currencies', {
          planId,
          provider: providerName,
          planName: finalName,
          rejectedCurrency: attemptedCurrency,
          fallbacks,
        });

        for (const fallbackCurrency of fallbacks) {
          try {
            const fallbackPrice = await provider.createPrice({
              ...options,
              currency: fallbackCurrency,
            });

            updateWarnings.push(
              `Created ${providerName} price with fallback currency ${fallbackCurrency} (requested ${attemptedCurrency}).`
            );

            Logger.info('Admin plan update: price created with fallback currency', {
              planId,
              provider: providerName,
              planName: finalName,
              currency: fallbackCurrency,
            });

            return fallbackPrice;
          } catch (fallbackErr) {
            if (!isUnsupportedCurrencyError(fallbackErr)) throw fallbackErr;
          }
        }

        throw currencyErr;
      }
    };

    const nameChanged = nameProvided && payload.name !== existingPlan.name;
    const shortDescriptionChanged = shortDescriptionProvided && payload.shortDescription !== existingPlan.shortDescription;

    // Check if price has changed
    const priceChanged = priceProvided && payload.priceCents !== existingPlan.priceCents;

    // Track new prices created across all providers
    let newExternalPriceIds: string | null = existingPlan.externalPriceIds;
    let newExternalProductIds: string | null = existingPlan.externalProductIds;
    let anyPriceCreated = false;
    let anyProductTouched = false;

    // Sync product metadata across all providers (best-effort).
    if (nameChanged || shortDescriptionChanged) {
      for (const { name: providerName, provider } of configuredProviders) {
        try {
          const productIdsToTry: string[] = [];
          const storedProductId = getIdByProvider(newExternalProductIds, providerName, null);
          const priceIdFromMap = getIdByProvider(newExternalPriceIds, providerName, null);

          if (storedProductId && isProviderProductIdCompatible(providerName, storedProductId)) {
            pushUniqueCandidate(productIdsToTry, storedProductId);
          }

          if (priceIdFromMap && providerName !== 'razorpay') {
            try {
              const verifiedPrice = await provider.verifyPrice(priceIdFromMap);
              if (verifiedPrice.productId && isProviderProductIdCompatible(providerName, verifiedPrice.productId)) {
                pushUniqueCandidate(productIdsToTry, verifiedPrice.productId);
              }
            } catch (verifyError) {
              Logger.warn('Failed to verify provider price while resolving product metadata update target', {
                planId,
                provider: providerName,
                priceId: priceIdFromMap,
                error: toError(verifyError).message,
              });
            }
          }

          if (productIdsToTry.length === 0) {
            const lookupNames = finalName === existingPlan.name ? [existingPlan.name] : [existingPlan.name, finalName];
            for (const lookupName of lookupNames) {
              const foundProductId = await provider.findProduct(lookupName);
              if (foundProductId && isProviderProductIdCompatible(providerName, foundProductId)) {
                pushUniqueCandidate(productIdsToTry, foundProductId);
              }
            }
          }

          if (productIdsToTry.length === 0) {
            Logger.warn('Skipping provider product update: no product ID available', {
              planId,
              provider: providerName,
            });
            continue;
          }

          let updatedProductId: string | null = null;
          let lastProviderError: Error | null = null;

          for (const candidateProductId of productIdsToTry) {
            try {
              await provider.updateProduct(candidateProductId, {
                name: nameChanged ? finalName : undefined,
                description: shortDescriptionChanged ? (finalShortDescription ?? undefined) : undefined,
              });
              updatedProductId = candidateProductId;
              break;
            } catch (candidateError) {
              lastProviderError = toError(candidateError);
            }
          }

          if (!updatedProductId) {
            if (isRazorpayMissingItemError(providerName, lastProviderError)) {
              Logger.warn('Skipping Razorpay product metadata update: mutable item target unavailable', {
                planId,
                provider: providerName,
                candidateProductIds: productIdsToTry,
                updatedByAdmin: adminId,
              });
              continue;
            }

            throw lastProviderError ?? new Error('No compatible product identifier succeeded');
          }

          newExternalProductIds = setIdByProvider(newExternalProductIds, providerName, updatedProductId);
          anyProductTouched = true;

          Logger.info('Updated provider product metadata', {
            planId,
            provider: providerName,
            productId: updatedProductId,
            nameChanged,
            shortDescriptionChanged,
            updatedByAdmin: adminId,
          });
        } catch (providerError) {
          const error = toError(providerError);
          Logger.error('Failed to update provider product metadata', {
            planId,
            provider: providerName,
            error: error.message,
            updatedByAdmin: adminId,
          });
        }
      }
    }

    // Handle safe auto-creation of prices when price changes OR billing interval_count changes - sync to ALL providers
    if (priceChanged || intervalCountChanged) {
      // Check for active subscriptions first
      const activeSubscriptions = await prisma.subscription.count({
        where: {
          planId: planId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() }
        }
      });

      if (intervalCountChanged && activeSubscriptions > 0) {
        return NextResponse.json(
          {
            error:
              'Cannot change billing interval count while there are active subscribers. Duplicate or recreate the plan instead.',
          },
          { status: 400 }
        );
      }

      for (const { name: providerName, provider } of configuredProviders) {
        // Skip providers that don't support one-time prices for non-subscription plans
        const supportsThisPriceType = finalAutoRenew || providerSupportsOneTimePrices(providerName);
        if (!supportsThisPriceType) {
          Logger.info('Skipping price creation for one-time plan on provider', {
            planId,
            provider: providerName,
          });
          continue;
        }

        try {
          // Prefer existing provider product mapping; otherwise resolve via price/product lookup, then create.
          let productId: string | null | undefined = getIdByProvider(newExternalProductIds, providerName, null);

          if (!productId) {
            const priceIdFromMap = getIdByProvider(newExternalPriceIds, providerName, null);
            if (priceIdFromMap) {
              const price = await provider.verifyPrice(priceIdFromMap);
              productId = price.productId;
            }
          }

          if (!productId) {
            productId = await provider.findProduct(existingPlan.name);
          }

          if (!productId && existingPlan.name !== finalName) {
            productId = await provider.findProduct(finalName);
          }

          if (!productId) {
            productId = await provider.createProduct({
              name: finalName,
              description: finalShortDescription ?? undefined,
              metadata: {
                planId: planId,
                createdByAdmin: adminId,
                createdAt: new Date().toISOString(),
              },
            });
          }

          newExternalProductIds = setIdByProvider(newExternalProductIds, providerName, productId);
          anyProductTouched = true;

          // Create the price with provider-specific currency
          const providerCurrency = getProviderCurrency(providerName);
          const price = await createPriceWithCurrencyFallback(providerName, provider, {
            unitAmount: finalPriceCents,
            currency: providerCurrency,
            productId: productId,
            metadata: {
              planId: planId,
              name: finalName,
              description: finalShortDescription ?? '',
              createdByAdmin: adminId,
              createdAt: new Date().toISOString(),
              previousPriceCents: existingPlan.priceCents.toString(),
              previousRecurringIntervalCount: String(existingPlan.recurringIntervalCount ?? 1),
            },
            recurring: (finalAutoRenew && finalRecurringInterval) ? {
              interval: finalRecurringInterval as 'day' | 'week' | 'month' | 'year',
              intervalCount: finalRecurringIntervalCount,
            } : undefined
          });

          // Update provider maps
          newExternalPriceIds = setIdByProvider(newExternalPriceIds, providerName, price.id);
          anyPriceCreated = true;

          if (!externalPriceIdToUse || externalPriceIdToUse === existingExternalPriceId) {
            externalPriceIdToUse = price.id;
            shouldPersistExternalPriceId = true;
            envPersistValue = price.id;
          }

          Logger.info('Auto-created price for plan price change on provider', {
            planId,
            provider: providerName,
            oldPriceCents: existingPlan.priceCents,
            newPriceCents: finalPriceCents,
            oldIntervalCount: existingPlan.recurringIntervalCount ?? 1,
            newIntervalCount: finalRecurringIntervalCount,
            priceId: price.id,
            productId,
            activeSubscriptions,
            createdByAdmin: adminId
          });

        } catch (providerError) {
          const error = toError(providerError);
          const providerErrorDetails = providerError instanceof PaymentProviderError ? providerError.originalError : undefined;
          Logger.error('Failed to auto-create price on provider', {
            planId,
            provider: providerName,
            oldPriceCents: existingPlan.priceCents,
            newPriceCents: finalPriceCents,
            error: error.message,
            providerErrorDetails,
            createdByAdmin: adminId
          });
          // Continue to next provider instead of failing entirely
        }
      }

      if (!anyPriceCreated) {
        return NextResponse.json({
          error: 'Failed to create new price on any provider',
        }, { status: 500 });
      }
    }

    if (toggledAutoRenewOn && (!(externalPriceIdProvided || legacyStripePriceIdProvided) || providedMatchesExisting)) {
      externalPriceIdToUse = undefined;
    }

    const manualOneTimeOverride = toggledAutoRenewOff
      && typeof providedExternalPriceIdString === 'string'
      && providedExternalPriceIdString.length > 0
      && providedExternalPriceIdString !== existingExternalPriceId;

    if (toggledAutoRenewOff) {
      if (manualOneTimeOverride) {
        externalPriceIdToUse = providedExternalPriceIdString;
        shouldPersistExternalPriceId = true;
        envPersistValue = providedExternalPriceIdString;
      } else if (autoCreateEnabled) {
        externalPriceIdToUse = undefined;
        shouldPersistExternalPriceId = true;
        envPersistValue = '';
      } else {
        if (typeof providedExternalPriceIdString !== 'string' || providedExternalPriceIdString.length === 0) {
          return NextResponse.json({
            error: 'Disabling auto-renew requires providing a one-time price ID when auto-create is disabled.',
          }, { status: 400 });
        }
        externalPriceIdToUse = providedExternalPriceIdString;
        shouldPersistExternalPriceId = true;
        envPersistValue = providedExternalPriceIdString;
      }
    }

    if (toggledAutoRenewOn && !autoCreateEnabled && (externalPriceIdToUse === undefined || externalPriceIdToUse === null || externalPriceIdToUse === '')) {
      return NextResponse.json({
        error: 'Auto-renew requires a recurring price ID when auto-create is disabled.',
      }, { status: 400 });
    }

    if (autoCreateEnabled && finalAutoRenew) {
      const needsRecurringPrice = toggledAutoRenewOn || externalPriceIdToUse === undefined || externalPriceIdToUse === null;
      if (needsRecurringPrice) {
        if (typeof finalPriceCents !== 'number' || !Number.isFinite(finalPriceCents)) {
          Logger.error('Auto-create failed', {
            planId,
            error: 'priceCents required when auto-creating recurring price',
            mode: 'recurring',
          });
        } else {
          // Create recurring prices on ALL configured providers
          const configuredProviders = PaymentProviderFactory.getAllConfiguredProviders();
          
          for (const { name: providerName, provider } of configuredProviders) {
            try {
              const productId = await provider.createProduct({
                name: finalName,
                description: finalShortDescription ?? undefined,
              });

              // Use provider-specific currency
              const providerCurrency = getProviderCurrency(providerName);
              const price = await createPriceWithCurrencyFallback(providerName, provider, {
                unitAmount: finalPriceCents,
                currency: providerCurrency,
                productId: productId,
                recurring: {
                  interval: (finalRecurringInterval ?? 'month') as 'day' | 'week' | 'month' | 'year',
                  intervalCount: finalRecurringIntervalCount,
                },
                metadata: {
                  name: finalName,
                  description: finalShortDescription ?? '',
                }
              });

              newExternalPriceIds = setIdByProvider(newExternalPriceIds, providerName, price.id);
              newExternalProductIds = setIdByProvider(newExternalProductIds, providerName, productId);
              anyPriceCreated = true;

              if (!externalPriceIdToUse) {
                externalPriceIdToUse = price.id;
                shouldPersistExternalPriceId = true;
                envPersistValue = price.id;
              }

              Logger.info('Auto-created recurring price on provider', {
                planId,
                provider: providerName,
                priceId: price.id,
                mode: 'recurring',
              });
            } catch (err: unknown) {
              const e = toError(err);
              Logger.error('Auto-create recurring price failed on provider', { 
                planId, 
                provider: providerName,
                error: e.message, 
                mode: 'recurring' 
              });
            }
          }
        }
      }
    }

    if (autoCreateEnabled && toggledAutoRenewOff && !manualOneTimeOverride) {
      const needsOneTimePrice = externalPriceIdToUse === undefined || externalPriceIdToUse === null || externalPriceIdToUse === '';
      if (needsOneTimePrice) {
        if (typeof finalPriceCents !== 'number' || !Number.isFinite(finalPriceCents)) {
          Logger.error('Auto-create failed', {
            planId,
            error: 'priceCents required when auto-creating one-time price',
            mode: 'one_time',
          });
        } else {
          // Create one-time prices on providers that support them
          const configuredProviders = PaymentProviderFactory.getAllConfiguredProviders();
          
          for (const { name: providerName, provider } of configuredProviders) {
            // Skip providers that don't support one-time prices
            if (!providerSupportsOneTimePrices(providerName)) {
              Logger.info('Skipping one-time price creation (provider does not support one-time prices)', {
                planId,
                provider: providerName,
              });
              continue;
            }

            try {
              const productId = await provider.createProduct({
                name: finalName,
                description: finalShortDescription ?? undefined,
              });

              // Use provider-specific currency
              const providerCurrency = getProviderCurrency(providerName);
              const price = await createPriceWithCurrencyFallback(providerName, provider, {
                unitAmount: finalPriceCents,
                currency: providerCurrency,
                productId: productId,
                metadata: {
                  name: finalName,
                  description: finalShortDescription ?? '',
                },
              });

              newExternalPriceIds = setIdByProvider(newExternalPriceIds, providerName, price.id);
              newExternalProductIds = setIdByProvider(newExternalProductIds, providerName, productId);
              anyPriceCreated = true;

              if (!externalPriceIdToUse) {
                externalPriceIdToUse = price.id;
                shouldPersistExternalPriceId = true;
                envPersistValue = price.id;
              }

              Logger.info('Auto-created one-time price on provider', {
                planId,
                provider: providerName,
                priceId: price.id,
                mode: 'one_time',
              });
            } catch (err: unknown) {
              const e = toError(err);
              Logger.error('Auto-create one-time price failed on provider', { 
                planId, 
                provider: providerName,
                error: e.message, 
                mode: 'one_time' 
              });
            }
          }
        }
      }
    }

    if (shouldPersistExternalPriceId && envPersistValue === undefined) {
      if (typeof externalPriceIdToUse === 'string') {
        envPersistValue = externalPriceIdToUse;
      } else if (externalPriceIdToUse === null) {
        envPersistValue = '';
      }
    }

    const updateData: Prisma.PlanUpdateInput = {};

    if (nameProvided && typeof payload.name === 'string') {
      updateData.name = payload.name;
    }
    if (shortDescriptionProvided) {
      updateData.shortDescription = shortDescriptionValue;
    }
    if (descriptionProvided) {
      updateData.description = descriptionValue;
    }
    if (durationProvided && typeof payload.durationHours === 'number') {
      updateData.durationHours = payload.durationHours;
    }
    if (priceProvided && typeof payload.priceCents === 'number') {
      updateData.priceCents = payload.priceCents;
    }
    if (activeProvided && typeof payload.active === 'boolean') {
      updateData.active = payload.active;
    }
    if (sortOrderProvided && typeof payload.sortOrder === 'number') {
      updateData.sortOrder = payload.sortOrder;
    }
    if (shouldPersistExternalPriceId) {
      updateData.externalPriceId = externalPriceIdToUse ?? null;
    } else if (toggledAutoRenewOn && typeof externalPriceIdToUse === 'string') {
      updateData.externalPriceId = externalPriceIdToUse;
    }

    // Update provider-keyed maps if new prices were created
    if (anyPriceCreated || anyProductTouched) {
      updateData.externalPriceIds = newExternalPriceIds;
      updateData.externalProductIds = newExternalProductIds;
    }

    if (autoRenewProvided || toggledAutoRenewOn || toggledAutoRenewOff) {
      updateData.autoRenew = finalAutoRenew;
    }

    if (finalAutoRenew) {
      updateData.recurringInterval = finalRecurringInterval ?? 'month';
      updateData.recurringIntervalCount = finalRecurringIntervalCount;
    } else if (toggledAutoRenewOff) {
      updateData.recurringInterval = null;
    } else if (recurringProvided) {
      updateData.recurringInterval = finalRecurringInterval ?? null;
    }

    if (tokenLimitProvided) {
      updateData.tokenLimit = payload.tokenLimit ?? null;
    }
    if (tokenNameProvided) {
      updateData.tokenName = payload.tokenName ?? null;
    }

    const nextSupportsOrganizations = supportsOrganizationsProvided
      ? Boolean(payload.supportsOrganizations)
      : existingPlan.supportsOrganizations;

    if (supportsOrganizationsProvided) {
      updateData.supportsOrganizations = nextSupportsOrganizations;
      updateData.scope = nextSupportsOrganizations ? 'TEAM' : 'INDIVIDUAL';
    }

    if (nextSupportsOrganizations) {
      if (organizationSeatLimitProvided) {
        updateData.organizationSeatLimit = payload.organizationSeatLimit ?? null;
      }
      if (!existingPlan.organizationTokenPoolStrategy) {
        updateData.organizationTokenPoolStrategy = 'SHARED_FOR_ORG';
      }
    } else {
      if (organizationSeatLimitProvided || supportsOrganizationsProvided) {
        updateData.organizationSeatLimit = null;
      }
      if (organizationTokenPoolStrategyProvided || supportsOrganizationsProvided) {
        updateData.organizationTokenPoolStrategy = null;
      }
    }

    const plan = await prisma.plan.update({
      where: { id: planId },
      data: updateData,
    });

    if (envPersistValue !== undefined) {
      const seed = findPlanSeedByName(finalName);
      if (seed) {
        await persistEnvValue(seed.externalPriceEnv, envPersistValue);
      }
    }

    await recordAdminAction({
      actorId: adminId,
      actorRole: 'ADMIN',
      action: 'plan.update',
      targetType: 'plan',
      details: { planId, name: plan.name },
    });

    return NextResponse.json({ success: true, plan, warnings: updateWarnings });
  } catch (err: unknown) {
    const planId = await getPlanId(context);
    const e = toError(err);
    Logger.error('Plan PUT error', { planId, error: e.message, stack: e.stack });
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
});

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ planId: string }> }
) {
  let planId: string | undefined;
  try {
    const params = await context.params;
    planId = params.planId;
    const adminId = await requireAdmin();
    const rl = await adminRateLimit(adminId, request, 'admin-plans:delete', { limit: 60, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for plan DELETE', { actorId: adminId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }
    // Prevent deleting a plan that has active or pending subscriptions.
    // Expired/cancelled subscriptions should not block deletion.
    const now = new Date();

    // Determine force param — allow admins to force-delete historical subscriptions when needed
    const url = request.nextUrl;
    const force = url?.searchParams?.get('force') === '1' || url?.searchParams?.get('force') === 'true';

    // Count pending subscriptions and active/unexpired subscriptions separately for better diagnostics
    const pendingCount = await prisma.subscription.count({ where: { planId: params.planId, status: 'PENDING' } });
    const activeUnexpiredCount = await prisma.subscription.count({ where: { planId: params.planId, AND: [{ status: 'ACTIVE' }, { expiresAt: { gt: now } }] } });

    // Compute blockingCount inline where needed; avoid unused variable warnings

    // Log the incoming delete request context for triage
    try {
      const url = request.nextUrl;
      const forceFlag = url?.searchParams?.get('force');
      Logger.info('Admin plan delete requested', { planId: params.planId, force: forceFlag, pendingCount, activeUnexpiredCount });
    } catch (err: unknown) {
      // non-fatal logging error
      Logger.warn('Failed to log plan delete context', { planId: params.planId, error: toError(err).message });
    }

    // If there are active-unexpired subscriptions and force is not provided, block deletion.
    if (activeUnexpiredCount > 0 && !force) {
      const blockingSamples = await prisma.subscription.findMany({
        where: {
          planId: params.planId,
          AND: [{ status: 'ACTIVE' }, { expiresAt: { gt: now } }],
        },
        select: { id: true, status: true, expiresAt: true, userId: true },
        take: 10,
      });

      Logger.warn('Blocked plan deletion - active subscriptions present', { planId: params.planId, activeUnexpiredCount, blockingSampleIds: blockingSamples.map(s => s.id) });

      return NextResponse.json(
        {
          error: 'Cannot delete plan with active (not-yet-expired) subscriptions',
          activeUnexpiredCount,
          blockingSamples,
        },
        { status: 400 }
      );
    }

    // If there are pending subscriptions and force is not provided, block deletion (previous behavior).
    if (pendingCount > 0 && !force) {
      const blockingSamples = await prisma.subscription.findMany({
        where: {
          planId: params.planId,
          status: 'PENDING',
        },
        select: { id: true, status: true, expiresAt: true, userId: true },
        take: 10,
      });

      Logger.warn('Blocked plan deletion - pending subscriptions present', { planId: params.planId, pendingCount, blockingSampleIds: blockingSamples.map(s => s.id) });

      return NextResponse.json(
        {
          error: 'Cannot delete plan with pending subscriptions',
          pendingCount,
          blockingSamples,
        },
        { status: 400 }
      );
    }

    // No blocking subscriptions OR force=true — safely remove any historical subscriptions and their payments
    const subs = await prisma.subscription.findMany({ where: { planId: params.planId }, select: { id: true } });
    const subIds = subs.map(s => s.id);

    const deleted: { subscriptions: string[]; paymentsDeleted: number } = { subscriptions: [], paymentsDeleted: 0 };

    await prisma.$transaction(async (tx) => {
      if (subIds.length > 0) {
        const delPayments = await tx.payment.deleteMany({ where: { subscriptionId: { in: subIds } } }) as Prisma.BatchPayload;
        // deleteMany returns a BatchPayload with `count` property
        deleted.paymentsDeleted = delPayments.count ?? 0;
        await tx.subscription.deleteMany({ where: { id: { in: subIds } } });
        deleted.subscriptions = subIds;
      }
      await tx.plan.delete({ where: { id: params.planId } });
    });
    Logger.info('Plan deleted', { planId: params.planId, deletedCount: deleted.paymentsDeleted, deletedSubscriptions: deleted.subscriptions.length, force: !!force });
    await recordAdminAction({
      actorId: adminId,
      actorRole: 'ADMIN',
      action: 'plan.delete',
      targetType: 'plan',
      details: { planId: params.planId, force: !!force, subscriptionsDeleted: deleted.subscriptions.length, paymentsDeleted: deleted.paymentsDeleted },
    });

    return NextResponse.json({ success: true, deleted, force: !!force });
  } catch (error) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    const e = toError(error as unknown);
    Logger.error('Plan delete error', { planId, error: e.message, stack: e.stack });
    // Surface a more useful message for known blocking cases
    if (e.message && e.message.toLowerCase().includes('foreign key') || e.message.toLowerCase().includes('constraint')) {
      return NextResponse.json({ error: 'Failed to delete plan due to DB constraint (foreign key) — verify subscriptions/payments cleaned up or use force=true' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 });
  }
}
