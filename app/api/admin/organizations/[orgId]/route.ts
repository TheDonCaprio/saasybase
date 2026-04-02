import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { requireAdminSectionAccess } from '../../../../../lib/route-guards';
import { adminRateLimit } from '../../../../../lib/rateLimit';
import { Logger } from '../../../../../lib/logger';
import { asRecord, toError } from '../../../../../lib/runtime-guards';
import { recordAdminAction } from '../../../../../lib/admin-actions';
import type { Prisma } from '@/lib/prisma-client';

const adminOrganizationInclude = {
  owner: { select: { id: true, name: true, email: true } },
  plan: { select: { id: true, name: true } },
  memberships: { select: { id: true, status: true } },
  invites: { select: { id: true, status: true } }
} satisfies Prisma.OrganizationInclude;

type AdminOrganizationRecord = Prisma.OrganizationGetPayload<{
  include: typeof adminOrganizationInclude;
}>;

function buildOrgPayload(org: AdminOrganizationRecord) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    billingEmail: org.billingEmail,
    plan: org.plan ? { id: org.plan.id, name: org.plan.name } : null,
    owner: org.owner ? { id: org.owner.id, name: org.owner.name, email: org.owner.email } : null,
    tokenBalance: org.tokenBalance,
    memberTokenCap: org.memberTokenCap,
    memberCapStrategy: org.memberCapStrategy,
    memberCapResetIntervalHours: org.memberCapResetIntervalHours,
    tokenPoolStrategy: org.tokenPoolStrategy,
    seatLimit: org.seatLimit,
    ownerExemptFromCaps: org.ownerExemptFromCaps,
    stats: {
      activeMembers: org.memberships.filter((m) => m.status === 'ACTIVE').length,
      totalMembers: org.memberships.length,
      pendingInvites: org.invites.filter((invite) => invite.status === 'PENDING').length
    },
    createdAt: org.createdAt,
    updatedAt: org.updatedAt
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { userId: actorId } = await requireAdminSectionAccess('organizations');
    const params = await context.params;
    const rl = await adminRateLimit(actorId, request, 'admin-orgs:get', { limit: 240, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for admin org detail', { actorId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }
    const org = (await prisma.organization.findUnique({
      where: { id: params.orgId },
      include: adminOrganizationInclude
    })) as AdminOrganizationRecord | null;

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    return NextResponse.json({ organization: buildOrgPayload(org) });
  } catch (error) {
    Logger.error('Failed to load admin org detail', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to load organization' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await context.params;
  try {
    const actor = await requireAdminSectionAccess('organizations');
    const rl = await adminRateLimit(actor.userId, request, 'admin-orgs:update', { limit: 120, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for admin org update', { actorId: actor.userId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    const body = asRecord(await request.json()) ?? {};
    const data: Record<string, unknown> = {};
    const changes: Record<string, unknown> = {};

    if (typeof body.name === 'string') {
      const trimmed = body.name.trim();
      if (trimmed.length === 0) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      data.name = trimmed;
      changes.name = trimmed;
    }

    if (typeof body.slug === 'string') {
      const trimmed = body.slug.trim().toLowerCase();
      if (!/^[a-z0-9-]{3,64}$/.test(trimmed)) {
        return NextResponse.json({ error: 'Slug must be 3-64 lowercase letters, numbers, or hyphens' }, { status: 400 });
      }
      data.slug = trimmed;
      changes.slug = trimmed;
    }

    if (body.hasOwnProperty('billingEmail')) {
      const raw = typeof body.billingEmail === 'string' ? body.billingEmail.trim() : '';
      data.billingEmail = raw.length > 0 ? raw : null;
      changes.billingEmail = data.billingEmail;
    }

    if (body.hasOwnProperty('seatLimit')) {
      if (body.seatLimit === null || body.seatLimit === undefined || body.seatLimit === '') {
        data.seatLimit = null;
        changes.seatLimit = null;
      } else {
        const seatLimit = Number(body.seatLimit);
        if (!Number.isFinite(seatLimit) || seatLimit < 1) {
          return NextResponse.json({ error: 'Seat limit must be a positive integer or empty' }, { status: 400 });
        }
        data.seatLimit = Math.trunc(seatLimit);
        changes.seatLimit = Math.trunc(seatLimit);
      }
    }

    if (body.hasOwnProperty('memberTokenCap')) {
      if (body.memberTokenCap === null || body.memberTokenCap === undefined || body.memberTokenCap === '') {
        data.memberTokenCap = null;
        changes.memberTokenCap = null;
      } else {
        const cap = Number(body.memberTokenCap);
        if (!Number.isFinite(cap) || cap < 0) {
          return NextResponse.json({ error: 'Member token cap must be a non-negative integer or empty' }, { status: 400 });
        }
        data.memberTokenCap = Math.trunc(cap);
        changes.memberTokenCap = Math.trunc(cap);
      }
    }

    if (typeof body.memberCapStrategy === 'string') {
      const normalized = body.memberCapStrategy.toUpperCase();
      if (!['SOFT', 'HARD', 'DISABLED'].includes(normalized)) {
        return NextResponse.json({ error: 'Invalid member cap strategy' }, { status: 400 });
      }
      data.memberCapStrategy = normalized;
      changes.memberCapStrategy = normalized;
    }

    if (body.hasOwnProperty('memberCapResetIntervalHours')) {
      if (body.memberCapResetIntervalHours === null || body.memberCapResetIntervalHours === undefined || body.memberCapResetIntervalHours === '') {
        data.memberCapResetIntervalHours = null;
        changes.memberCapResetIntervalHours = null;
      } else {
        const interval = Number(body.memberCapResetIntervalHours);
        if (!Number.isFinite(interval) || interval < 1) {
          return NextResponse.json({ error: 'Reset interval must be at least 1 hour or empty' }, { status: 400 });
        }
        data.memberCapResetIntervalHours = Math.trunc(interval);
        changes.memberCapResetIntervalHours = Math.trunc(interval);
      }
    }

    if (typeof body.tokenPoolStrategy === 'string') {
      const normalized = body.tokenPoolStrategy.trim().toUpperCase();
      if (normalized.length === 0) {
        return NextResponse.json({ error: 'Token pool strategy cannot be empty' }, { status: 400 });
      }
      data.tokenPoolStrategy = normalized;
      changes.tokenPoolStrategy = normalized;
    }

    if (body.hasOwnProperty('ownerExemptFromCaps')) {
      data.ownerExemptFromCaps = body.ownerExemptFromCaps === true;
      changes.ownerExemptFromCaps = data.ownerExemptFromCaps;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
    }

    try {
      const updated = (await prisma.organization.update({
        where: { id: orgId },
        data,
        include: adminOrganizationInclude
      })) as AdminOrganizationRecord;

      await recordAdminAction({
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'organizations.update',
        targetType: 'ORGANIZATION',
        details: { orgId, changes }
      });

      return NextResponse.json({ success: true, organization: buildOrgPayload(updated) });
    } catch (err) {
      const error = toError(err);
      const prismaCode = (error as { code?: string }).code;
      const message = prismaCode === 'P2002' ? 'Slug already in use' : error.message;
      Logger.error('Admin org update failed', { error: error.message, orgId });
      return NextResponse.json({ error: message || 'Failed to update organization' }, { status: 400 });
    }
  } catch (error) {
    const err = toError(error);
    return NextResponse.json({ error: err.message || 'Failed to update organization' }, { status: 500 });
  }
}
