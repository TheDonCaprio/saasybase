import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@/lib/prisma-client';
import { prisma } from '@/lib/prisma';
import { Logger } from '@/lib/logger';
import { asRecord, toError } from '@/lib/runtime-guards';
import { getPaidTokensNaturalExpiryGraceHours } from '@/lib/settings';
import { getAuthSafe } from '@/lib/auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { getRequestIp } from '@/lib/request-ip';
import { findActivePaidPersonalSubscription, hasUnlimitedPaidPersonalAccess } from '@/lib/personal-paid-access';
import { getMembershipOrganizationReferenceWhere, getOrganizationReferenceWhere } from '@/lib/organization-reference';

type SpendBucket = 'auto' | 'paid' | 'free' | 'shared';

type SpendRequest = {
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

async function resolveSharedContext(params: {
  userId: string;
  organizationId?: string;
  tx: Prisma.TransactionClient;
}): Promise<
  | {
      ok: true;
      organizationId: string;
      membershipId: string | null;
      poolBalance: number;
      tokenPoolStrategy: 'SHARED_FOR_ORG' | 'ALLOCATED_PER_MEMBER';
      memberAllocatedBalance: number;
      effectiveMemberCap: number | null;
      memberCapStrategy: 'SOFT' | 'HARD' | 'DISABLED';
      memberCapResetIntervalHours: number | null;
      memberTokenUsage: number;
      memberTokenUsageWindowStart: Date | null;
    }
  | { ok: false; status: number; error: string }
> {
  const { userId, organizationId, tx } = params;

  async function findValidOwnerTeamSubscription(ownerUserId: string, targetOrganizationId?: string) {
    const now = new Date();
    const graceHours = await getPaidTokensNaturalExpiryGraceHours();
    const graceCutoff = new Date(now.getTime() - graceHours * 60 * 60 * 1000);

    return tx.subscription.findFirst({
      where: {
        userId: ownerUserId,
        ...(targetOrganizationId ? { organizationId: targetOrganizationId } : {}),
        plan: { supportsOrganizations: true },
        OR: [
          { status: { not: 'EXPIRED' }, expiresAt: { gt: now } },
          { status: { in: ['EXPIRED', 'CANCELLED', 'PAST_DUE'] }, expiresAt: { gt: graceCutoff, lte: now } },
        ],
      },
      select: { id: true },
    });
  }

  if (!organizationId) {
    return { ok: false, status: 400, error: 'no_shared_context' };
  }

  const targetOrgFilter = organizationId
    ? {
        OR: getMembershipOrganizationReferenceWhere(organizationId),
      }
    : {};

  const membership = await tx.organizationMembership.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      ...targetOrgFilter,
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
      sharedTokenBalance: true,
      organization: {
        select: {
          id: true,
          providerOrganizationId: true,
          ownerUserId: true,
          tokenBalance: true,
          tokenPoolStrategy: true,
          memberTokenCap: true,
          memberCapStrategy: true,
          memberCapResetIntervalHours: true,
          invites: { select: { id: true, status: true } },
          ownerExemptFromCaps: true,
        },
      },
    },
  });

  if (!membership?.organization?.id) {
    const ownedOrganization = await tx.organization.findFirst({
      where: {
        ownerUserId: userId,
        plan: { supportsOrganizations: true },
        ...(organizationId
          ? {
              OR: getOrganizationReferenceWhere(organizationId),
            }
          : {}),
      },
      select: {
        id: true,
        ownerUserId: true,
        tokenBalance: true,
        tokenPoolStrategy: true,
        invites: { select: { id: true, status: true } },
        ownerExemptFromCaps: true,
      },
    });

    if (!ownedOrganization?.id) {
      return { ok: false, status: 400, error: 'no_shared_context' };
    }

    const ownerSub = await findValidOwnerTeamSubscription(userId, ownedOrganization.id);
    if (!ownerSub) {
      return { ok: false, status: 403, error: 'owner_subscription_expired' };
    }

    const ownedStrategy = (ownedOrganization.tokenPoolStrategy || 'SHARED_FOR_ORG').toUpperCase() as 'SHARED_FOR_ORG' | 'ALLOCATED_PER_MEMBER';

    return {
      ok: true,
      organizationId: ownedOrganization.id,
      membershipId: null,
      poolBalance: Math.max(0, Number(ownedOrganization.tokenBalance ?? 0)),
      tokenPoolStrategy: ownedStrategy,
      memberAllocatedBalance: 0,
      effectiveMemberCap: null,
      memberCapStrategy: 'DISABLED',
      memberCapResetIntervalHours: null,
      memberTokenUsage: 0,
      memberTokenUsageWindowStart: null,
    };
  }

  // Verify the organization owner still has a valid team subscription.
  const ownerUserId = membership.organization.ownerUserId;
  if (ownerUserId) {
    const ownerSub = await findValidOwnerTeamSubscription(ownerUserId, membership.organization.id);
    if (!ownerSub) {
      return { ok: false, status: 403, error: 'owner_subscription_expired' };
    }
  }

  const poolBalance = Math.max(0, Number(membership.organization.tokenBalance ?? 0));
  const memberStrategy = (membership.organization.tokenPoolStrategy || 'SHARED_FOR_ORG').toUpperCase() as 'SHARED_FOR_ORG' | 'ALLOCATED_PER_MEMBER';
  const memberAllocatedBalance = Math.max(0, Number(membership.sharedTokenBalance ?? 0));

  const capStrategy = (membership.organization.memberCapStrategy || 'SOFT').toString().toUpperCase();
  const normalizedStrategy = (capStrategy === 'HARD' || capStrategy === 'DISABLED' ? capStrategy : 'SOFT') as
    | 'SOFT'
    | 'HARD'
    | 'DISABLED';
  const capsDisabled = normalizedStrategy === 'DISABLED';

  const overrideCap = typeof membership.memberTokenCapOverride === 'number' ? membership.memberTokenCapOverride : null;
  const orgCap = typeof membership.organization.memberTokenCap === 'number' ? membership.organization.memberTokenCap : null;

  // Owner exemption: if the flag is set and this user is the org owner, bypass caps entirely
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
    tokenPoolStrategy: memberStrategy,
    memberAllocatedBalance,
    effectiveMemberCap,
    memberCapStrategy: normalizedStrategy,
    memberCapResetIntervalHours: reset,
    memberTokenUsage,
    memberTokenUsageWindowStart,
  };
}

const rateLimited = withRateLimit(
  async (req) => {
    const { userId } = await getAuthSafe();
    return userId
      ? `user-spend-tokens:${userId}`
      : `user-spend-tokens:anon:${getRequestIp(req) ?? 'unknown'}`;
  },
  {
    ...RATE_LIMITS.API_GENERAL,
    message: 'Too many token spend requests'
  }
);

export async function POST(req: NextRequest) {
  return rateLimited(req, async () => {
    let parsed: SpendRequest;
    try {
      const json = await req.json();
      parsed = (asRecord(json) || {}) as unknown as SpendRequest;
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
    }

    const { userId, orgId } = await getAuthSafe();
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const amount = parsePositiveInt(parsed.amount);
    if (!amount) return NextResponse.json({ ok: false, error: 'amount_must_be_positive_integer' }, { status: 400 });
    if (amount > 100_000) return NextResponse.json({ ok: false, error: 'amount_too_large' }, { status: 400 });

    const bucket: SpendBucket =
      parsed.bucket === 'paid' || parsed.bucket === 'free' || parsed.bucket === 'shared' || parsed.bucket === 'auto'
        ? parsed.bucket
        : 'auto';

    const featureRaw = typeof parsed.feature === 'string' ? parsed.feature.trim() : '';
    const feature = featureRaw.length ? featureRaw.slice(0, 120) : 'generic';

    const organizationId = typeof parsed.organizationId === 'string' ? parsed.organizationId.trim() : (orgId || undefined);
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

        // Pre-resolve shared context once (used by both auto-selection and shared deduction).
        let sharedContext: Awaited<ReturnType<typeof resolveSharedContext>> | null = null;

        let effectiveBucket: Exclude<SpendBucket, 'auto'>;
        if (bucket === 'auto') {
          if (organizationId) {
            sharedContext = await resolveSharedContext({ userId, organizationId, tx });
            if (!sharedContext.ok) {
              return {
                status: sharedContext.status,
                body: { ok: false, error: sharedContext.error },
              };
            }
            effectiveBucket = 'shared';
          } else if (hasActiveSubscription && (hasUnlimitedPaidAccess || paidBalance >= amount)) {
            effectiveBucket = 'paid';
          } else if (freeBalance >= amount) {
            effectiveBucket = 'free';
          } else if (hasActiveSubscription && (hasUnlimitedPaidAccess || paidBalance > 0)) {
            effectiveBucket = 'paid';
          } else if (freeBalance > 0) {
            effectiveBucket = 'free';
          } else if (hasActiveSubscription) {
            effectiveBucket = 'paid';
          } else {
            effectiveBucket = 'free';
          }
        } else {
          effectiveBucket = bucket;
        }

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

        // Ensure shared context is resolved when explicitly requesting shared bucket.
        if (effectiveBucket === 'shared' && !sharedContext) {
          sharedContext = await resolveSharedContext({ userId, organizationId, tx });
        }
        if (effectiveBucket === 'shared' && (!sharedContext || !sharedContext.ok)) {
          const sc = sharedContext && !sharedContext.ok ? sharedContext : null;
          return {
            status: sc?.status ?? 400,
            body: { ok: false, error: sc?.error ?? 'no_shared_context' },
          };
        }

        if (effectiveBucket === 'paid') {
          if (!hasActiveSubscription) {
            return {
              status: 403,
              body: {
                ok: false,
                error: 'paid_subscription_expired',
                bucket: 'paid',
              },
            };
          }

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
          // At this point sharedContext is guaranteed ok (guarded above).
          const shared = sharedContext as Extract<NonNullable<typeof sharedContext>, { ok: true }>;

          if (shared.tokenPoolStrategy === 'ALLOCATED_PER_MEMBER') {
            // ALLOCATED_PER_MEMBER: deduct from the member's individual sharedTokenBalance
            const memberBalance = shared.memberAllocatedBalance;

            if (amount > memberBalance) {
              return {
                status: 409,
                body: {
                  ok: false,
                  error: 'insufficient_tokens',
                  bucket: 'shared',
                  required: amount,
                  available: memberBalance,
                  tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
                },
              };
            }

            if (shared.membershipId) {
              const updated = await tx.organizationMembership.updateMany({
                where: { id: shared.membershipId, status: 'ACTIVE', sharedTokenBalance: { gte: amount } },
                data: { sharedTokenBalance: { decrement: amount } },
              });

              if (!updated.count) {
                return {
                  status: 409,
                  body: {
                    ok: false,
                    error: 'insufficient_tokens',
                    bucket: 'shared',
                    required: amount,
                    available: memberBalance,
                    tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
                  },
                };
              }
            } else {
              return {
                status: 400,
                body: { ok: false, error: 'no_membership_for_allocated_strategy' },
              };
            }
          } else {
            // SHARED_FOR_ORG (default): deduct from organization pool with cap logic
            const poolBalance = shared.poolBalance;
            const cap = shared.effectiveMemberCap;
            const resetHours = shared.memberCapResetIntervalHours;
            const now = Date.now();
            const windowStartMs = shared.memberTokenUsageWindowStart ? shared.memberTokenUsageWindowStart.getTime() : null;
            const windowExpired =
              resetHours != null &&
              (windowStartMs == null || now - windowStartMs >= resetHours * 60 * 60 * 1000);
            const usage = windowExpired ? 0 : Math.max(0, shared.memberTokenUsage);
            const remainingCap = cap == null ? null : Math.max(0, cap - usage);

            const usageAfter = usage + amount;
            const remainingAfter = cap == null ? null : Math.max(0, cap - usageAfter);

            sharedCap = {
              strategy: shared.memberCapStrategy,
              cap,
              usageBefore: usage,
              usageAfter,
              remainingBefore: remainingCap,
              remainingAfter,
              windowStart: windowExpired
                ? null
                : shared.memberTokenUsageWindowStart
                  ? shared.memberTokenUsageWindowStart.toISOString()
                  : null,
              resetIntervalHours: resetHours,
            };

            const softCapExceeded = shared.memberCapStrategy === 'SOFT' && cap != null && usageAfter > cap;
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

            const hardCapEnabled = shared.memberCapStrategy === 'HARD' && cap != null;
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
                  capStrategy: shared.memberCapStrategy,
                },
              };
            }

            const updated = await tx.organization.updateMany({
              where: { id: shared.organizationId, tokenBalance: { gte: amount } },
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
                  capStrategy: shared.memberCapStrategy,
                },
              };
            }

            // Update per-member usage window tracking.
            const nextWindowStart = windowExpired || !shared.memberTokenUsageWindowStart ? new Date() : shared.memberTokenUsageWindowStart;
            const usageUpdate = windowExpired
              ? { memberTokenUsageWindowStart: nextWindowStart, memberTokenUsage: amount }
              : { memberTokenUsageWindowStart: nextWindowStart, memberTokenUsage: { increment: amount } };

            if (shared.membershipId) {
              await tx.organizationMembership.updateMany({
                where: { id: shared.membershipId, status: 'ACTIVE' },
                data: usageUpdate,
              });
            }
          }
        }

        try {
          await tx.featureUsageLog.create({
            data: {
              userId,
              feature: `saasyapp_spend:${feature}:${effectiveBucket}${requestId ? `:${requestId}` : ''}`,
              count: amount,
              periodStart: new Date(),
            },
          });
        } catch (e: unknown) {
          Logger.warn('user spend-tokens: failed to write FeatureUsageLog', {
            userId,
            error: toError(e).message,
          });
        }

        const sharedOrgId = sharedContext && sharedContext.ok ? sharedContext.organizationId : null;

        const resolvedSharedContext = sharedContext && sharedContext.ok ? sharedContext : null;

        const [freshUser, freshOrg, freshMembership] = await Promise.all([
          tx.user.findUnique({ where: { id: userId }, select: { tokenBalance: true, freeTokenBalance: true } }),
          effectiveBucket === 'shared' && sharedOrgId
            ? tx.organization.findUnique({ where: { id: sharedOrgId }, select: { tokenBalance: true } })
            : Promise.resolve(null),
          effectiveBucket === 'shared' && resolvedSharedContext?.membershipId
            ? tx.organizationMembership.findFirst({
                where: { id: resolvedSharedContext.membershipId },
                select: { sharedTokenBalance: true },
              })
            : Promise.resolve(null),
        ]);

        const sharedDisplayBalance = effectiveBucket === 'shared' && resolvedSharedContext
          ? resolvedSharedContext.tokenPoolStrategy === 'ALLOCATED_PER_MEMBER'
            ? Math.max(0, Number(freshMembership?.sharedTokenBalance ?? resolvedSharedContext.memberAllocatedBalance ?? 0))
            : Math.max(0, Number(freshOrg?.tokenBalance ?? resolvedSharedContext.poolBalance ?? 0))
          : null;

        return {
          status: 200,
          body: {
            ok: true,
            userId,
            amount,
            bucket: effectiveBucket,
            organizationId: effectiveBucket === 'shared' ? sharedOrgId : null,
            warnings,
            sharedCap,
            balances: {
              paid: Math.max(0, Number(freshUser?.tokenBalance ?? paidBalance)),
              free: Math.max(0, Number(freshUser?.freeTokenBalance ?? freeBalance)),
              shared: sharedDisplayBalance,
              sharedPool: effectiveBucket === 'shared' ? Math.max(0, Number(freshOrg?.tokenBalance ?? 0)) : null,
            },
          },
        };
      });

      return NextResponse.json(result.body, { status: result.status });
    } catch (error: unknown) {
      const err = toError(error);
      Logger.error('user spend-tokens: unexpected error', {
        error: err.message,
        stack: err.stack,
      });
      return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
    }
  });
}
