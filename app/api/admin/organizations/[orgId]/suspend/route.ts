import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminSectionAccess } from '@/lib/route-guards';
import { adminRateLimit } from '@/lib/rateLimit';
import { Logger } from '@/lib/logger';
import { recordAdminAction } from '@/lib/admin-actions';
import { deactivateOrganizationsByIds } from '@/lib/organization-access';
import { toError } from '@/lib/runtime-guards';

export async function POST(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await context.params;

  try {
    const actor = await requireAdminSectionAccess('organizations');
    const rl = await adminRateLimit(actor.userId, request, 'admin-orgs:suspend', { limit: 60, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for admin org suspend', { actorId: actor.userId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    await deactivateOrganizationsByIds([orgId], {
      userId: actor.userId,
      reason: 'admin.organizations.suspend',
      mode: 'SUSPEND',
    });

    await recordAdminAction({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'organizations.suspend',
      targetType: 'ORGANIZATION',
      details: { orgId, name: organization.name },
    });

    return NextResponse.json({ success: true, orgId, name: organization.name });
  } catch (error) {
    const err = toError(error);
    Logger.error('Admin org suspend failed', { orgId, error: err.message });
    return NextResponse.json({ error: err.message || 'Failed to suspend organization' }, { status: 500 });
  }
}