import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../../lib/prisma';
import { fetchTeamDashboardState } from '../../../../lib/team-dashboard';
import { getOrganizationAccessSummary } from '../../../../lib/organization-access';
import { Logger } from '../../../../lib/logger';
import { getOrganizationReferenceWhere as getOrganizationReferenceMatches } from '../../../../lib/organization-reference';
import { toError } from '../../../../lib/runtime-guards';

const CAP_STRATEGIES = ['SOFT', 'HARD', 'DISABLED'] as const;
type CapStrategy = (typeof CAP_STRATEGIES)[number];

function parseNullableInteger(value: unknown, opts: { allowZero?: boolean } = {}): number | null {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(parsed)) return null;
  if (!opts.allowZero && parsed <= 0) return null;
  if (opts.allowZero && parsed < 0) return null;
  return Math.trunc(parsed);
}

function normalizeStrategy(value: unknown): CapStrategy | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return CAP_STRATEGIES.includes(normalized as CapStrategy) ? (normalized as CapStrategy) : null;
}

function getOrganizationReferenceWhere(userId: string, orgId?: string | null) {
  return orgId
    ? {
        ownerUserId: userId,
        OR: getOrganizationReferenceMatches(orgId),
      }
    : { ownerUserId: userId };
}

export async function PATCH(request: NextRequest) {
  const { userId, orgId } = await authService.getSession();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch (err) {
    Logger.warn('team settings payload parse failed', { error: String(err) });
  }

  const memberTokenCapProvided = Object.prototype.hasOwnProperty.call(payload, 'memberTokenCap');
  const memberCapStrategyProvided = Object.prototype.hasOwnProperty.call(payload, 'memberCapStrategy');
  const resetIntervalProvided = Object.prototype.hasOwnProperty.call(payload, 'memberCapResetIntervalHours');
  const ownerExemptProvided = Object.prototype.hasOwnProperty.call(payload, 'ownerExemptFromCaps');

  if (!memberTokenCapProvided && !memberCapStrategyProvided && !resetIntervalProvided && !ownerExemptProvided) {
    return NextResponse.json({ ok: false, error: 'No fields to update.' }, { status: 400 });
  }

  const nextCap = memberTokenCapProvided ? parseNullableInteger(payload.memberTokenCap, { allowZero: true }) : undefined;
  if (memberTokenCapProvided && payload.memberTokenCap != null && nextCap == null) {
    return NextResponse.json({ ok: false, error: 'memberTokenCap must be a non-negative integer or null.' }, { status: 400 });
  }

  const nextStrategy = memberCapStrategyProvided ? normalizeStrategy(payload.memberCapStrategy) : undefined;
  if (memberCapStrategyProvided && !nextStrategy) {
    return NextResponse.json({ ok: false, error: 'memberCapStrategy must be SOFT, HARD, or DISABLED.' }, { status: 400 });
  }

  const nextResetInterval = resetIntervalProvided ? parseNullableInteger(payload.memberCapResetIntervalHours) : undefined;
  if (resetIntervalProvided && payload.memberCapResetIntervalHours != null && nextResetInterval == null) {
    return NextResponse.json({ ok: false, error: 'memberCapResetIntervalHours must be a positive number of hours or null.' }, { status: 400 });
  }

  try {
    const access = await getOrganizationAccessSummary(userId, orgId ?? null);
    if (!access.allowed || access.kind !== 'OWNER') {
      return NextResponse.json({ ok: false, error: 'Only workspace owners can update shared token caps.' }, { status: 403 });
    }

    const organization = await prisma.organization.findFirst({
      where: getOrganizationReferenceWhere(userId, orgId),
    });
    if (!organization) {
      return NextResponse.json({ ok: false, error: 'Workspace not found. Provision a workspace before updating settings.' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (memberTokenCapProvided) {
      data.memberTokenCap = nextCap ?? null;
    }
    if (memberCapStrategyProvided) {
      data.memberCapStrategy = nextStrategy ?? 'SOFT';
    }
    if (resetIntervalProvided) {
      data.memberCapResetIntervalHours = nextResetInterval ?? null;
    }
    if (ownerExemptProvided) {
      data.ownerExemptFromCaps = payload.ownerExemptFromCaps === true;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: 'No valid fields to update.' }, { status: 400 });
    }

    await prisma.organization.update({ where: { id: organization.id }, data });
    const state = await fetchTeamDashboardState(userId, {
      forceSync: true,
      activeOrganizationId: orgId ?? null,
    });
    return NextResponse.json({ ok: true, ...state });
  } catch (err) {
    const error = toError(err);
    Logger.error('team settings update failed', { userId, error: error.message });
    return NextResponse.json({ ok: false, error: 'Unable to update workspace settings.' }, { status: 500 });
  }
}
