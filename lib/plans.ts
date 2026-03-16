import { prisma } from './prisma';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import {
  parseProviderIdMap,
  getCurrentProviderKey,
  getIdByProvider,
  isProviderPriceIdCompatible,
  providerSupportsOneTimePrices,
} from './utils/provider-ids';
import { formatCurrency } from './utils/currency';
import { getActiveCurrency } from './payment/registry';

export type CorePlanId = string;

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
  autoRenew?: boolean;
  recurringInterval?: 'day' | 'week' | 'month' | 'year';
  recurringIntervalCount?: number;
}

export const PLAN_DEFINITIONS: PlanSeed[] = [
  // One-time plans
  {
    id: '24H',
    name: '24 Hour Pro',
    durationHours: 24,
    priceCents: 10000,
    externalPriceEnv: 'PAYMENT_PRICE_24H',
    legacyExternalPriceEnv: 'PRICE_24H',
    priceMode: 'payment',
    sortOrder: 0,
    autoRenew: false,
  },
  {
    id: '7D',
    name: '7 Day Pro',
    durationHours: 24 * 7,
    priceCents: 15000,
    externalPriceEnv: 'PAYMENT_PRICE_7D',
    legacyExternalPriceEnv: 'PRICE_7D',
    priceMode: 'payment',
    sortOrder: 1,
    autoRenew: false,
  },
  {
    id: '1M_OT',
    name: '1 Month Extra',
    durationHours: 24 * 30,
    priceCents: 20000,
    externalPriceEnv: 'PAYMENT_PRICE_1M_OT',
    legacyExternalPriceEnv: 'PRICE_1M',
    priceMode: 'payment',
    sortOrder: 2,
    autoRenew: false,
  },
  
  // Subscription plans
  {
    id: '1M_SUB',
    name: 'Monthly Pro',
    durationHours: 24 * 30,
    priceCents: 20000,
    externalPriceEnv: 'SUBSCRIPTION_PRICE_1M',
    priceMode: 'subscription',
    sortOrder: 3,
    autoRenew: true,
    recurringInterval: 'month',
    recurringIntervalCount: 1,
  },
  {
    id: '3M_SUB',
    name: 'Quarterly Pro',
    durationHours: 24 * 90,
    priceCents: 48000,
    externalPriceEnv: 'SUBSCRIPTION_PRICE_3M',
    priceMode: 'subscription',
    sortOrder: 4,
    autoRenew: true,
    recurringInterval: 'month',
    recurringIntervalCount: 3,
    description: 'Save 20%',
  },
  {
    id: '1Y_SUB',
    name: 'Yearly Pro',
    durationHours: 24 * 365,
    priceCents: 144000,
    externalPriceEnv: 'SUBSCRIPTION_PRICE_1Y',
    priceMode: 'subscription',
    sortOrder: 5,
    autoRenew: true,
    recurringInterval: 'year',
    recurringIntervalCount: 1,
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

export function resolveSeededPlanPriceForProvider(
  def: PlanSeed,
  options?: {
    providerKey?: string;
    externalPriceIds?: unknown;
    legacyExternalPriceId?: string | null;
  }
): { priceId?: string; envKey?: string; isLegacy: boolean; source: 'provider-map' | 'legacy-field' | 'env' | 'missing' } {
  const providerKey = options?.providerKey || getCurrentProviderKey();
  const recurring = def.priceMode === 'subscription';

  const providerMappedPriceId = getIdByProvider(options?.externalPriceIds, providerKey);
  if (providerMappedPriceId && isProviderPriceIdCompatible(providerKey, providerMappedPriceId, { recurring })) {
    return { priceId: providerMappedPriceId, isLegacy: false, source: 'provider-map' };
  }

  const legacyExternalPriceId = options?.legacyExternalPriceId;
  if (legacyExternalPriceId && isProviderPriceIdCompatible(providerKey, legacyExternalPriceId, { recurring })) {
    return { priceId: legacyExternalPriceId, isLegacy: false, source: 'legacy-field' };
  }

  if (!recurring && !providerSupportsOneTimePrices(providerKey)) {
    return { priceId: undefined, envKey: undefined, isLegacy: false, source: 'missing' };
  }

  const resolved = resolvePlanPriceEnv(def);
  if (resolved.priceId && isProviderPriceIdCompatible(providerKey, resolved.priceId, { recurring })) {
    return { ...resolved, source: 'env' };
  }

  return { priceId: undefined, envKey: resolved.envKey, isLegacy: resolved.isLegacy, source: 'missing' };
}

export async function ensurePlansSeeded() {
  const currentNames = PLAN_DEFINITIONS.map(p => p.name);
  
  // Deactivate plans that are no longer in the definitions
  await prisma.plan.updateMany({
    where: {
      name: { notIn: currentNames },
      active: true,
    },
    data: { active: false }
  });

  for (const plan of PLAN_DEFINITIONS) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: {
        durationHours: plan.durationHours,
        priceCents: plan.priceCents,
        sortOrder: plan.sortOrder,
        autoRenew: plan.autoRenew ?? (plan.priceMode === 'subscription'),
        recurringInterval: plan.recurringInterval || (plan.priceMode === 'subscription' ? 'month' : null),
        recurringIntervalCount: plan.recurringIntervalCount || 1,
        active: true, // Ensure it's active
      },
      create: {
        name: plan.name,
        durationHours: plan.durationHours,
        priceCents: plan.priceCents,
        sortOrder: plan.sortOrder,
        autoRenew: plan.autoRenew ?? (plan.priceMode === 'subscription'),
        recurringInterval: plan.recurringInterval || (plan.priceMode === 'subscription' ? 'month' : null),
        recurringIntervalCount: plan.recurringIntervalCount || 1,
        scope: 'INDIVIDUAL',
        active: true,
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
    if (!isProviderPriceIdCompatible(providerKey, priceId, { recurring: def.priceMode === 'subscription' })) {
      Logger.info('Skipping plan external price sync because env value does not match the active provider', {
        planId: def.id,
        provider: providerKey,
        envKey,
        priceMode: def.priceMode,
      });
      continue;
    }
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
