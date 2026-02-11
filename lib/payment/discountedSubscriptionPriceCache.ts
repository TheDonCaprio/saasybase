import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { Logger } from '@/lib/logger';
import { toError } from '@/lib/runtime-guards';

type CachePayload = {
  provider: string;
  basePriceId: string;
  planId: string;
  couponId: string;
  couponUpdatedAtMs: number | null;
  currency: string;
  interval: string;
  intervalCount: number;
  originalAmountCents: number;
  discountedAmountCents: number;
};

type CacheValue =
  | { status: 'pending'; createdAt: string }
  | { status: 'ready'; createdAt: string; provider: string; priceId: string };

const PENDING_TTL_MS = 5 * 60 * 1000;

function safeParseCacheValue(value: string): CacheValue | null {
  try {
    const parsed = JSON.parse(value) as CacheValue;
    if (!parsed || typeof parsed !== 'object') return null;
    if ((parsed as CacheValue).status === 'ready') {
      const ready = parsed as Extract<CacheValue, { status: 'ready' }>;
      if (typeof ready.priceId !== 'string') return null;
      if (typeof ready.provider !== 'string') return null;
      if (typeof ready.createdAt !== 'string') return null;
      return ready;
    }
    if ((parsed as CacheValue).status === 'pending') {
      const pending = parsed as Extract<CacheValue, { status: 'pending' }>;
      if (typeof pending.createdAt !== 'string') return null;
      return pending;
    }
    return null;
  } catch {
    return null;
  }
}

function isPendingStale(createdAtIso: string, nowMs = Date.now()): boolean {
  const createdAtMs = new Date(createdAtIso).getTime();
  if (!Number.isFinite(createdAtMs)) return true;
  return nowMs - createdAtMs > PENDING_TTL_MS;
}

function stableKeyFromPayload(payload: CachePayload): string {
  const raw = JSON.stringify(payload);
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return `discounted_subscription_price_v1:${hash}`;
}

export function buildDiscountedSubscriptionPriceCacheKey(payload: CachePayload): string {
  return stableKeyFromPayload(payload);
}

export async function getCachedDiscountedSubscriptionPriceId(key: string): Promise<string | null> {
  try {
    const row = await prisma.setting.findUnique({ where: { key }, select: { value: true } });
    if (!row?.value) return null;
    const parsed = safeParseCacheValue(row.value);
    if (parsed && parsed.status === 'ready' && typeof parsed.priceId === 'string' && parsed.priceId.length > 0) {
      return parsed.priceId;
    }
    return null;
  } catch {
    return null;
  }
}

export async function tryAcquireDiscountedSubscriptionPriceKey(key: string): Promise<boolean> {
  try {
    await prisma.setting.create({
      data: {
        key,
        value: JSON.stringify({ status: 'pending', createdAt: new Date().toISOString() } satisfies CacheValue),
      },
    });
    return true;
  } catch {
    // Key already exists (or transient failure). If it exists and is stale-pending,
    // attempt to reclaim it.
    try {
      const existing = await prisma.setting.findUnique({ where: { key }, select: { value: true } });
      const parsed = existing?.value ? safeParseCacheValue(existing.value) : null;
      if (parsed && parsed.status === 'ready') {
        return false;
      }

      const pendingCreatedAt = parsed && parsed.status === 'pending' ? parsed.createdAt : null;
      if (!pendingCreatedAt || !isPendingStale(pendingCreatedAt)) {
        return false;
      }

      Logger.warn('Reclaiming stale discounted subscription price lock', {
        cacheKey: key,
        createdAt: pendingCreatedAt,
        ttlMs: PENDING_TTL_MS,
      });

      await prisma.setting.deleteMany({ where: { key } });

      await prisma.setting.create({
        data: {
          key,
          value: JSON.stringify({ status: 'pending', createdAt: new Date().toISOString() } satisfies CacheValue),
        },
      });
      return true;
    } catch {
      return false;
    }
  }
}

export async function setCachedDiscountedSubscriptionPriceId(key: string, provider: string, priceId: string): Promise<void> {
  try {
    await prisma.setting.upsert({
      where: { key },
      create: {
        key,
        value: JSON.stringify({ status: 'ready', createdAt: new Date().toISOString(), provider, priceId } satisfies CacheValue),
      },
      update: {
        value: JSON.stringify({ status: 'ready', createdAt: new Date().toISOString(), provider, priceId } satisfies CacheValue),
      },
    });
  } catch (err: unknown) {
    const e = toError(err);
    Logger.warn('Failed to persist discounted subscription price cache', { cacheKey: key, provider, error: e.message });
  }
}

export async function clearDiscountedSubscriptionPriceKey(key: string): Promise<void> {
  try {
    await prisma.setting.delete({ where: { key } });
  } catch {
    // ignore
  }
}
