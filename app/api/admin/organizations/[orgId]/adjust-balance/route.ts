import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { asRecord, toError } from '../../../../../../lib/runtime-guards';
import { Logger } from '../../../../../../lib/logger';
import { adminRateLimit } from '../../../../../../lib/rateLimit';
import { recordAdminAction } from '../../../../../../lib/admin-actions';

export async function POST(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const actorId = await requireAdmin();

    const rl = await adminRateLimit(actorId, request, 'admin-orgs:adjust-balance', { limit: 60, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for admin org adjust-balance', { actorId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    const body = await request.json();
    const rec = asRecord(body) ?? {};
    const amountRaw = rec.amount;
    const reasonRaw = rec.reason;
    const force = rec.force === true;

    const amount = typeof amountRaw === 'number' ? Math.trunc(amountRaw) : Number(amountRaw ?? NaN);
    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ error: 'Amount must be a non-zero integer' }, { status: 400 });
    }

    const reason = typeof reasonRaw === 'string' && reasonRaw.trim().length > 0 ? reasonRaw.trim() : undefined;

    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.organization.findUnique({
        where: { id: orgId },
        select: {
          tokenBalance: true,
          name: true,
          tokenPoolStrategy: true,
          plan: { select: { organizationTokenPoolStrategy: true } },
        },
      });
      if (!before) throw new Error('Organization not found');
      const effectiveTokenPoolStrategy = before.plan?.organizationTokenPoolStrategy === 'ALLOCATED_PER_MEMBER'
        || (before.tokenPoolStrategy || 'SHARED_FOR_ORG').toUpperCase() === 'ALLOCATED_PER_MEMBER'
        ? 'ALLOCATED_PER_MEMBER'
        : 'SHARED_FOR_ORG';
      if (effectiveTokenPoolStrategy === 'ALLOCATED_PER_MEMBER') {
        throw new Error('Token balance adjustments are only available for shared-pool organizations. Adjust per-member balances through billing or member-level tooling.');
      }

      const proposed = before.tokenBalance + amount;
      if (proposed < 0 && !force) {
        throw new Error('Resulting balance would be negative. Use `force` to override.');
      }

      const updated = await tx.organization.update({ where: { id: orgId }, data: { tokenBalance: proposed } });

      return { before: before.tokenBalance, after: updated.tokenBalance, orgName: before.name };
    });

    try {
      await recordAdminAction({
        actorId,
        actorRole: 'ADMIN',
        action: 'organizations.adjustBalance',
        targetType: 'ORGANIZATION',
        details: { orgId, delta: amount, before: result.before, after: result.after, reason: reason ?? null }
      });
    } catch (err) {
      Logger.warn('Failed to record admin action for org balance adjust', { error: toError(err).message });
    }

    return NextResponse.json({ success: true, org: { id: orgId, name: result.orgName, tokenBalance: result.after } });
  } catch (err: unknown) {
    const e = toError(err);
    Logger.error('Admin adjust org balance failed', { error: e.message });
    const msg = e.message?.includes('negative') || e.message?.includes('only available for shared-pool organizations')
      ? e.message
      : 'Failed to adjust organization balance';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
