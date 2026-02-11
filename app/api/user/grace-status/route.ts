import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { getPaidTokensNaturalExpiryGraceHours } from '../../../../lib/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  let userId: string;
  try {
    userId = await requireUser();
  } catch (error: unknown) {
    try {
      const err = error as { code?: string; status?: number };
      if (err && (err.code === 'UNAUTHENTICATED' || err.status === 401)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } catch {
      // fall through to generic unauthorized handling
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const graceHours = await getPaidTokensNaturalExpiryGraceHours();
  const now = new Date();
  const graceCutoff = new Date(now.getTime() - graceHours * 60 * 60 * 1000);

  // If the user has any currently-valid subscription, they are not in grace.
  const hasValid = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { not: 'EXPIRED' },
      expiresAt: { gt: now },
    },
    select: { id: true },
  });

  if (hasValid) {
    return NextResponse.json({ inGrace: false });
  }

  // Grace applies after wall-clock expiry (expiresAt <= now) for ended subscriptions
  // (EXPIRED or CANCELLED) within the configured window.
  const latestEndedWithinGrace = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ['EXPIRED', 'CANCELLED'] },
      expiresAt: { gt: graceCutoff, lte: now },
    },
    orderBy: { expiresAt: 'desc' },
    select: {
      expiresAt: true,
      plan: { select: { supportsOrganizations: true, autoRenew: true, name: true } },
    },
  });

  if (!latestEndedWithinGrace?.expiresAt) {
    return NextResponse.json({ inGrace: false });
  }

  const expiresAt = latestEndedWithinGrace.expiresAt;
  const graceEndsAt = new Date(expiresAt.getTime() + graceHours * 60 * 60 * 1000);

  return NextResponse.json({
    inGrace: true,
    graceHours,
    expiresAt: expiresAt.toISOString(),
    graceEndsAt: graceEndsAt.toISOString(),
    plan: {
      name: latestEndedWithinGrace.plan?.name ?? null,
      supportsOrganizations: Boolean(latestEndedWithinGrace.plan?.supportsOrganizations),
      autoRenew: Boolean(latestEndedWithinGrace.plan?.autoRenew),
    },
  });
}
