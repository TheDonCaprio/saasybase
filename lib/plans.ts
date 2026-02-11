import { prisma } from './prisma';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import { parseProviderIdMap, getCurrentProviderKey } from './utils/provider-ids';
import { formatCurrency } from './utils/currency';
import { getActiveCurrency } from './payment/registry';

export type CorePlanId = '24H' | '7D' | '1M' | '3M' | '1Y';

export interface PlanSeed {
  id: CorePlanId;
  name: string;
  durationHours: number;
  priceCents: number;
  externalPriceEnv: string; // env var name (typed contract)
  legacyExternalPriceEnv?: string; // fallback for older installs
  priceMode: 'payment' | 'subscription';
  description?: string;
  sortOrder: number;
}

export const PLAN_DEFINITIONS: PlanSeed[] = [
  {
    id: '24H',
    name: '24 Hour Pro',
    durationHours: 24,
    priceCents: 299,
    externalPriceEnv: 'PAYMENT_PRICE_24H',
    legacyExternalPriceEnv: 'PRICE_24H',
    priceMode: 'payment',
    sortOrder: 0,
  },
  {
    id: '7D',
    name: '7 Day Pro',
    durationHours: 24 * 7,
    priceCents: 799,
    externalPriceEnv: 'PAYMENT_PRICE_7D',
    legacyExternalPriceEnv: 'PRICE_7D',
    priceMode: 'payment',
    sortOrder: 1,
  },
  {
    id: '1M',
    name: '1 Month Pro',
    durationHours: 24 * 30,
    priceCents: 1999,
    externalPriceEnv: 'PAYMENT_PRICE_1M',
    legacyExternalPriceEnv: 'PRICE_1M',
    priceMode: 'payment',
    sortOrder: 2,
  },
  {
    id: '3M',
    name: '3 Month Pro',
    durationHours: 24 * 90,
    priceCents: 4999,
    externalPriceEnv: 'PAYMENT_PRICE_3M',
    legacyExternalPriceEnv: 'PRICE_3M',
    priceMode: 'payment',
    sortOrder: 3,
    description: 'Save 20%',
  },
  {
    id: '1Y',
    name: '1 Year Pro',
    durationHours: 24 * 365,
    priceCents: 14999,
    externalPriceEnv: 'PAYMENT_PRICE_1Y',
    legacyExternalPriceEnv: 'PRICE_1Y',
    priceMode: 'payment',
    sortOrder: 4,
    description: 'Save 40%',
  },
];

export function findPlanSeedByName(name: string): PlanSeed | undefined {
  return PLAN_DEFINITIONS.find(def => def.name === name);
}

export function resolvePlanPriceEnv(def: PlanSeed): { priceId?: string; envKey?: string; isLegacy: boolean } {
  const direct = process.env[def.externalPriceEnv];
  if (direct) {
    return { priceId: direct, envKey: def.externalPriceEnv, isLegacy: false };
  }
  if (def.legacyExternalPriceEnv) {
    const legacy = process.env[def.legacyExternalPriceEnv];
    if (legacy) {
      return { priceId: legacy, envKey: def.legacyExternalPriceEnv, isLegacy: true };
    }
  }
  return { priceId: undefined, envKey: undefined, isLegacy: false };
}

export async function ensurePlansSeeded() {
  for (const plan of PLAN_DEFINITIONS) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: {
        durationHours: plan.durationHours,
        priceCents: plan.priceCents,
        sortOrder: plan.sortOrder,
      },
      create: {
        name: plan.name,
        durationHours: plan.durationHours,
        priceCents: plan.priceCents,
        sortOrder: plan.sortOrder,
      }
    });
  }
}

// Sync externalPriceId columns from environment (so webhook can map priceId -> plan)
export async function syncPlanExternalPriceIds() {
  // Ensure the core plan rows exist before attempting updates.
  await ensurePlansSeeded();
  const providerKey = getCurrentProviderKey();

  for (const def of PLAN_DEFINITIONS) {
    const { priceId, envKey, isLegacy } = resolvePlanPriceEnv(def);
    if (!priceId) continue;
    if (isLegacy) {
      Logger.warn('Using legacy external price env var for plan. Rename to maintain mode safety.', {
        planId: def.id,
        envKey,
        expected: def.externalPriceEnv,
      });
    }

    try {
      const plan = await prisma.plan.findUnique({
        where: { name: def.name },
        select: { id: true, externalPriceId: true, externalPriceIds: true },
      });

      if (!plan) {
        continue;
      }

      const existingMap = parseProviderIdMap(plan.externalPriceIds);
      const currentMapped = existingMap[providerKey];

      if (plan.externalPriceId === priceId && currentMapped === priceId) {
        continue;
      }

      const conflict = await prisma.plan.findFirst({
        where: {
          OR: [
            { externalPriceId: priceId },
            { externalPriceIds: { not: null } },
          ],
          NOT: { id: plan.id },
        },
        select: { id: true, name: true, externalPriceIds: true, externalPriceId: true },
      });

      if (conflict) {
        const conflictMap = parseProviderIdMap(conflict.externalPriceIds);
        const conflictMatch = conflictMap[providerKey] === priceId || conflict.externalPriceId === priceId;
        if (conflictMatch) {
          Logger.warn('Skipping external price sync due to conflict', {
            planName: def.name,
            externalPriceId: priceId,
            conflictingPlanId: conflict.id,
            conflictingPlanName: conflict.name,
          });
          continue;
        }
      }

      const updatedMap = { ...existingMap, [providerKey]: priceId };

      await prisma.plan.update({
        where: { id: plan.id },
        data: {
          externalPriceId: priceId,
          externalPriceIds: JSON.stringify(updatedMap),
        },
      });
    } catch (err: unknown) {
      const error = toError(err);
      Logger.warn('Failed to sync plan external price', {
        planName: def.name,
        error: error.message,
      });
    }
  }
}

/**
 * Format a price in cents to a display string with currency symbol.
 * 
 * @param cents - Amount in smallest currency unit (e.g., cents)
 * @param currency - Currency code (e.g., 'USD', 'NGN'). Required for client components.
 *                   If omitted, falls back to server-side detection (only works on server).
 */
export function formatPrice(cents: number, currency?: string): string {
  if (!currency) {
    // Server-side fallback - this will fail on client if PAYMENT_PROVIDER is not set
    return formatCurrency(cents, getActiveCurrency());
  }
  return formatCurrency(cents, currency);
}
