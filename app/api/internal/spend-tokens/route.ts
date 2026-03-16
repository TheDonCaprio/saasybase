import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Logger } from '@/lib/logger';
import { asRecord, toError } from '@/lib/runtime-guards';
import { getPaidTokensNaturalExpiryGraceHours } from '@/lib/settings';
import type { Prisma } from '@prisma/client';
import { findActivePaidPersonalSubscription, hasUnlimitedPaidPersonalAccess } from '@/lib/personal-paid-access';

type SpendBucket = 'auto' | 'paid' | 'free' | 'shared';

type SpendRequest = {
  userId: string;
  amount: number | string;
  bucket?: SpendBucket;
  feature?: string;
  organizationId?: string;
  requestId?: string;
};

function parsePositiveInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i <= 0) return null;
  return i;
}

function getBearerToken(req: NextRequest): string | null {
  const bearer = req.headers.get('authorization') || '';
  if (!bearer.startsWith('Bearer ')) return null;
  const token = bearer.slice('Bearer '.length).trim();
  return token.length ? token : null;
}

function isInternalAuthorized(req: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_TOKEN || null;
  const bearer = getBearerToken(req);

  // Production: require a configured secret and a matching Bearer token.
  if (process.env.NODE_ENV === 'production') {
    return Boolean(expected && bearer && bearer === expected);
  }

  // Non-production: allow either the explicit dev header or the bearer token.
  if (req.headers.get('X-Internal-API') === 'true') return true;
  return Boolean(expected && bearer && bearer === expected);
}

async function resolveSharedContext(params: {
  userId: string;
  organizationId?: string;
  tx: Prisma.TransactionClient;
}): Promise<
  | {
      ok: true;
      organizationId: string;
      membershipId: string;
      poolBalance: number;
      effectiveMemberCap: number | null;
      memberCapStrategy: 'SOFT' | 'HARD' | 'DISABLED';
      memberCapResetIntervalHours: number | null;
      memberTokenUsage: number;
      memberTokenUsageWindowStart: Date | null;
    }
  | { ok: false; status: number; error: string }
> {
  const { userId, organizationId, tx } = params;

  const membership = await tx.organizationMembership.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      ...(organizationId ? { organizationId } : {}),
      organization: {
        plan: {
          supportsOrganizations: true,
        },
      },
    },
    select: {
      id: true,
      organizationId: true,
      memberTokenCapOverride: true,
      memberTokenUsageWindowStart: true,
      memberTokenUsage: true,
      organization: {
        select: {
          id: true,
          ownerUserId: true,
          tokenBalance: true,
          memberTokenCap: true,
          memberCapStrategy: true,
          memberCapResetIntervalHours: true,
          ownerExemptFromCaps: true,
        },
      },
    },
  });

  if (!membership?.organization?.id) {
    return { ok: false, status: 404, error: 'no_shared_context' };
  }

  // Verify the organization owner still has a valid team subscription.
  const ownerUserId = membership.organization.ownerUserId;
  if (ownerUserId) {
    const now = new Date();
    const graceHours = await getPaidTokensNaturalExpiryGraceHours();
    const graceCutoff = new Date(now.getTime() - graceHours * 60 * 60 * 1000);
    const ownerSub = await tx.subscription.findFirst({
      where: {
        userId: ownerUserId,
        plan: { supportsOrganizations: true },
        OR: [
          { status: { not: 'EXPIRED' }, expiresAt: { gt: now } },
          { status: { in: ['EXPIRED', 'CANCELLED', 'PAST_DUE'] }, expiresAt: { gt: graceCutoff, lte: now } },
        ],
      },
      select: { id: true },
    });
    if (!ownerSub) {
      return { ok: false, status: 403, error: 'owner_subscription_expired' };
    }
  }

  const poolBalance = Math.max(0, Number(membership.organization.tokenBalance ?? 0));

  const capStrategy = (membership.organization.memberCapStrategy || 'SOFT').toString().toUpperCase();
  const normalizedStrategy = (capStrategy === 'HARD' || capStrategy === 'DISABLED' ? capStrategy : 'SOFT') as
    | 'SOFT'
    | 'HARD'
    | 'DISABLED';
  const capsDisabled = normalizedStrategy === 'DISABLED';

  const overrideCap = typeof membership.memberTokenCapOverride === 'number' ? membership.memberTokenCapOverride : null;
  const orgCap = typeof membership.organization.memberTokenCap === 'number' ? membership.organization.memberTokenCap : null;

  // Owner exemption: bypass caps if the org has flagged the owner as exempt
  const isOwner = membership.organization.ownerUserId === userId;
  const ownerExempt = isOwner && (membership.organization.ownerExemptFromCaps === true);
  const effectiveMemberCap = ownerExempt ? null : (capsDisabled ? null : overrideCap ?? orgCap);

  const reset = typeof membership.organization.memberCapResetIntervalHours === 'number'
    ? membership.organization.memberCapResetIntervalHours
    : null;

  const memberTokenUsage = Math.max(0, Number(membership.memberTokenUsage ?? 0));
  const memberTokenUsageWindowStart = membership.memberTokenUsageWindowStart ?? null;

  return {
    ok: true,
    organizationId: membership.organization.id,
    membershipId: membership.id,
    poolBalance,
    effectiveMemberCap,
    memberCapStrategy: normalizedStrategy,
    memberCapResetIntervalHours: reset,
    memberTokenUsage,
    memberTokenUsageWindowStart,
  };
}

export async function POST(req: NextRequest) {
  if (!isInternalAuthorized(req)) {
    // Hide internal endpoints in production.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let parsed: SpendRequest;
  try {
    const json = await req.json();
    parsed = (asRecord(json) || {}) as unknown as SpendRequest;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const userId = typeof parsed.userId === 'string' ? parsed.userId.trim() : '';
  if (!userId) return NextResponse.json({ ok: false, error: 'userId_required' }, { status: 400 });

  const amount = parsePositiveInt(parsed.amount);
  if (!amount) return NextResponse.json({ ok: false, error: 'amount_must_be_positive_integer' }, { status: 400 });
  if (amount > 1_000_000) return NextResponse.json({ ok: false, error: 'amount_too_large' }, { status: 400 });

  const bucket: SpendBucket =
    parsed.bucket === 'paid' || parsed.bucket === 'free' || parsed.bucket === 'shared' || parsed.bucket === 'auto'
      ? parsed.bucket
      : 'auto';

  const featureRaw = typeof parsed.feature === 'string' ? parsed.feature.trim() : '';
  const feature = featureRaw.length ? featureRaw.slice(0, 120) : 'generic';

  const organizationId = typeof parsed.organizationId === 'string' ? parsed.organizationId.trim() : undefined;
  const requestId = typeof parsed.requestId === 'string' ? parsed.requestId.trim().slice(0, 120) : undefined;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, tokenBalance: true, freeTokenBalance: true },
      });

      if (!user) {
        return { status: 404, body: { ok: false, error: 'user_not_found' } };
      }

      const paidBalance = Math.max(0, Number(user.tokenBalance ?? 0));
      const freeBalance = Math.max(0, Number(user.freeTokenBalance ?? 0));

      const activePaidSubscription = await findActivePaidPersonalSubscription(tx, userId);
      const hasActiveSubscription = Boolean(activePaidSubscription);
      const hasUnlimitedPaidAccess = hasUnlimitedPaidPersonalAccess(activePaidSubscription);

      let effectiveBucket: Exclude<SpendBucket, 'auto'>;
      if (bucket === 'auto') {
        // Prefer personal paid subscription when active; fall back to shared workspace pool; then free.
        if (hasActiveSubscription) {
          effectiveBucket = 'paid';
        } else {
          const shared = await resolveSharedContext({ userId, organizationId, tx });
          effectiveBucket = shared.ok ? 'shared' : 'free';
        }
      } else {
        effectiveBucket = bucket;
      }

      let sharedContext: Awaited<ReturnType<typeof resolveSharedContext>> | null = null;
      let warnings:
        | Array<{ code: 'soft_cap_exceeded'; message: string; cap: number; usageBefore: number; usageAfter: number }>
        | undefined;
      let sharedCap:
        | {
            strategy: 'SOFT' | 'HARD' | 'DISABLED';
            cap: number | null;
            usageBefore: number;
            usageAfter: number;
            remainingBefore: number | null;
            remainingAfter: number | null;
            windowStart: string | null;
            resetIntervalHours: number | null;
          }
        | undefined;

      if (effectiveBucket === 'shared') {
        sharedContext = await resolveSharedContext({ userId, organizationId, tx });
        if (!sharedContext.ok) {
          return {
            status: sharedContext.status,
            body: { ok: false, error: sharedContext.error },
          };
        }
      }

      if (effectiveBucket === 'paid') {
        if (!hasUnlimitedPaidAccess) {
          const updated = await tx.user.updateMany({
            where: { id: userId, tokenBalance: { gte: amount } },
            data: { tokenBalance: { decrement: amount } },
          });
          if (!updated.count) {
            return {
              status: 409,
              body: {
                ok: false,
                error: 'insufficient_tokens',
                bucket: 'paid',
                required: amount,
                available: paidBalance,
              },
            };
          }
        }
      } else if (effectiveBucket === 'free') {
        const updated = await tx.user.updateMany({
          where: { id: userId, freeTokenBalance: { gte: amount } },
          data: { freeTokenBalance: { decrement: amount } },
        });
        if (!updated.count) {
          return {
            status: 409,
            body: {
              ok: false,
              error: 'insufficient_tokens',
              bucket: 'free',
              required: amount,
              available: freeBalance,
            },
          };
        }
      } else {
        const poolBalance = sharedContext!.poolBalance;
        const cap = sharedContext!.effectiveMemberCap;
        const resetHours = sharedContext!.memberCapResetIntervalHours;
        const now = Date.now();
        const windowStartMs = sharedContext!.memberTokenUsageWindowStart ? sharedContext!.memberTokenUsageWindowStart.getTime() : null;
        const windowExpired =
          resetHours != null &&
          (windowStartMs == null || now - windowStartMs >= resetHours * 60 * 60 * 1000);
        const usage = windowExpired ? 0 : Math.max(0, sharedContext!.memberTokenUsage);
        const remainingCap = cap == null ? null : Math.max(0, cap - usage);

        const usageAfter = usage + amount;
        const remainingAfter = cap == null ? null : Math.max(0, cap - usageAfter);

        sharedCap = {
          strategy: sharedContext!.memberCapStrategy,
          cap,
          usageBefore: usage,
          usageAfter,
          remainingBefore: remainingCap,
          remainingAfter,
          windowStart: windowExpired
            ? null
            : sharedContext!.memberTokenUsageWindowStart
              ? sharedContext!.memberTokenUsageWindowStart.toISOString()
              : null,
          resetIntervalHours: resetHours,
        };

        const softCapExceeded = sharedContext!.memberCapStrategy === 'SOFT' && cap != null && usageAfter > cap;
        if (softCapExceeded) {
          warnings = [
            {
              code: 'soft_cap_exceeded',
              message: 'Member has exceeded their shared token cap (SOFT mode).',
              cap,
              usageBefore: usage,
              usageAfter,
            },
          ];
        }

        const hardCapEnabled = sharedContext!.memberCapStrategy === 'HARD' && cap != null;
        const capAvailable = cap == null ? poolBalance : Math.min(poolBalance, remainingCap ?? 0);
        const spendAllowedByCap = hardCapEnabled ? amount <= capAvailable : amount <= poolBalance;

        if (!spendAllowedByCap) {
          return {
            status: 409,
            body: {
              ok: false,
              error: 'insufficient_tokens',
              bucket: 'shared',
              required: amount,
              available: hardCapEnabled ? capAvailable : poolBalance,
              poolAvailable: poolBalance,
              memberCap: cap,
              memberUsage: usage,
              memberRemainingCap: remainingCap,
              capStrategy: sharedContext!.memberCapStrategy,
            },
          };
        }

        const updated = await tx.organization.updateMany({
          where: { id: sharedContext!.organizationId, tokenBalance: { gte: amount } },
          data: { tokenBalance: { decrement: amount } },
        });

        if (!updated.count) {
          return {
            status: 409,
            body: {
              ok: false,
              error: 'insufficient_tokens',
              bucket: 'shared',
              required: amount,
              available: hardCapEnabled ? capAvailable : poolBalance,
              poolAvailable: poolBalance,
              memberCap: cap,
              memberUsage: usage,
              memberRemainingCap: remainingCap,
              capStrategy: sharedContext!.memberCapStrategy,
            },
          };
        }

        const nextWindowStart = windowExpired || !sharedContext!.memberTokenUsageWindowStart ? new Date() : sharedContext!.memberTokenUsageWindowStart;
        const usageUpdate = windowExpired
          ? { memberTokenUsageWindowStart: nextWindowStart, memberTokenUsage: amount }
          : { memberTokenUsageWindowStart: nextWindowStart, memberTokenUsage: { increment: amount } };

        await tx.organizationMembership.updateMany({
          where: { id: sharedContext!.membershipId, status: 'ACTIVE' },
          data: usageUpdate,
        });
      }

      try {
        await tx.featureUsageLog.create({
          data: {
            userId,
            feature: `token_spend:${feature}:${effectiveBucket}${requestId ? `:${requestId}` : ''}`,
            count: amount,
            periodStart: new Date(),
          },
        });
      } catch (e: unknown) {
        // Audit logging must not block spending.
        Logger.warn('internal spend-tokens: failed to write FeatureUsageLog', {
          userId,
          error: toError(e).message,
        });
      }

      const [freshUser, freshOrg] = await Promise.all([
        tx.user.findUnique({ where: { id: userId }, select: { tokenBalance: true, freeTokenBalance: true } }),
        effectiveBucket === 'shared'
          ? tx.organization.findUnique({ where: { id: sharedContext!.organizationId }, select: { tokenBalance: true } })
          : Promise.resolve(null),
      ]);

      return {
        status: 200,
        body: {
          ok: true,
          userId,
          amount,
          bucket: effectiveBucket,
          organizationId: effectiveBucket === 'shared' ? sharedContext!.organizationId : null,
          warnings,
          sharedCap,
          balances: {
            paid: Math.max(0, Number(freshUser?.tokenBalance ?? paidBalance)),
            free: Math.max(0, Number(freshUser?.freeTokenBalance ?? freeBalance)),
            sharedPool: effectiveBucket === 'shared' ? Math.max(0, Number(freshOrg?.tokenBalance ?? 0)) : null,
          },
        },
      };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error: unknown) {
    const err = toError(error);
    Logger.error('internal spend-tokens: unexpected error', {
      error: err.message,
      stack: err.stack,
    });
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
