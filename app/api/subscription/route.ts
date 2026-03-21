export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { toError } from '../../../lib/runtime-guards';
import { syncOrganizationEligibilityForUser } from '../../../lib/organization-access';
import { Logger } from '../../../lib/logger';
import { getAuthSafe } from '../../../lib/auth';
import { getOrganizationPlanContext } from '../../../lib/user-plan-context';
import { getPricingPlanFamily } from '../../../lib/pricing-card-status';

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

export async function GET() {
  try {
    const { userId, orgId } = await getAuthSafe();
    if (!userId) return jsonError('Unauthorized', 401, 'UNAUTHORIZED');
    
    const now = new Date();
    
    // NOTE: We intentionally do NOT auto-activate PENDING subscriptions here.
    // PENDING subscriptions represent manual-activation purchases and should
    // only be promoted to ACTIVE when the user explicitly activates them
    // (via the activation endpoint) or when a server-side scheduler promotes
    // scheduled entries. Auto-activating on read caused placeholder PENDING
    // rows (which use `startedAt = now` as a DB placeholder) to immediately
    // become ACTIVE and run concurrently with an existing ACTIVE subscription.
    //
    // Keep a cleanup for stale PENDING rows that have already expired.
    const expiredPendingResult = await prisma.subscription.updateMany({
      where: {
        userId,
        status: 'PENDING',
        expiresAt: { lte: now }
      },
      data: {
        status: 'EXPIRED',
        canceledAt: now
      }
    });

    if (expiredPendingResult.count > 0) {
      try {
        await syncOrganizationEligibilityForUser(userId);
      } catch (err: unknown) {
        Logger.warn('Failed to sync organization eligibility after expiring pending subscriptions (GET /subscription)', {
          userId,
          error: toError(err).message
        });
      }
    }

    const ownedActiveSubscriptions = await prisma.subscription.findMany({
      where: { 
        userId, 
        status: 'ACTIVE', 
        expiresAt: { gt: now } 
      }, 
      include: { plan: true },
      orderBy: { expiresAt: 'asc' }
    });
    const sub = ownedActiveSubscriptions[0] ?? null;
    
    // Also check for any pending subscription (manual-activation flow)
    const pendingSub = await prisma.subscription.findFirst({
      where: {
        userId,
        status: 'PENDING',
        OR: [
          { prorationPendingSince: { not: null } },
          { startedAt: { gt: now } },
          { payments: { some: { status: 'SUCCEEDED' } } },
        ],
      },
      include: { plan: true },
      orderBy: { createdAt: 'asc' }
    });
    
      const organizationPlan = sub ? null : await getOrganizationPlanContext(userId, orgId);

      const response: Record<string, unknown> = {
        ok: true,
        ownedActiveSubscriptions: ownedActiveSubscriptions.map((subscription) => ({
          id: subscription.id,
          planId: subscription.plan.id,
          plan: subscription.plan.name,
          family: getPricingPlanFamily(subscription.plan.supportsOrganizations),
          planAutoRenew: !!subscription.plan.autoRenew,
          planSupportsOrganizations: subscription.plan.supportsOrganizations === true,
          expiresAt: subscription.expiresAt,
          status: subscription.status,
        })),
      };
      if (sub) {
        response.active = true;
        response.source = 'personal';
        response.planId = sub.plan.id;
        response.plan = sub.plan.name;
        // Expose whether the current plan auto-renews so clients can decide
        // whether to treat it as a one-time purchase (autoRenew === false)
        response.planAutoRenew = !!sub.plan.autoRenew;
        response.planSupportsOrganizations = sub.plan.supportsOrganizations === true;
        response.expiresAt = sub.expiresAt;
        response.status = sub.status;
      } else if (organizationPlan) {
        response.active = true;
        response.source = 'organization';
        response.plan = organizationPlan.organization.plan?.name ?? 'Team Plan';
        response.organization = {
          id: organizationPlan.organization.id,
          name: organizationPlan.organization.name,
          role: organizationPlan.role,
          tokenPoolStrategy: 'SHARED_FOR_ORG',
          tokenBalance: organizationPlan.organization.tokenBalance ?? 0,
        };
      } else {
        response.active = false;
      }

    
    if (pendingSub) {
      const isAwaitingPaymentConfirmation = pendingSub.prorationPendingSince instanceof Date;
      response.pending = {
        id: pendingSub.id,
        plan: pendingSub.plan?.name,
        // Expose whether pending plan auto-renews (useful for UI decisions)
        planAutoRenew: !!pendingSub.plan?.autoRenew,
        planSupportsOrganizations: pendingSub.plan?.supportsOrganizations === true,
        pendingConfirmation: isAwaitingPaymentConfirmation,
        // In the new manual-activation flow startedAt may be null
        startsAt: pendingSub.startedAt || null,
        expiresAt: pendingSub.expiresAt || null,
        pendingSince: pendingSub.prorationPendingSince || null,
      };
    }
    
    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = toError(err).message;
    console.error('subscription GET error', message);
    return jsonError(message || 'Failed to fetch subscription', 500, 'SUBSCRIPTION_FETCH_FAILED');
  }
}
