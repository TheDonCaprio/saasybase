import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIP, RATE_LIMITS } from '@/lib/rateLimit';
import { handleApiError, ApiError } from '@/lib/api-error';
import { parseProviderIdMap } from '@/lib/utils/provider-ids';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapSession(session: Awaited<ReturnType<typeof authService.getUserSessions>>[number]) {
  return {
    id: session.id,
    status: session.status,
    lastActiveAt: toIso(session.lastActiveAt),
    activity: session.activity ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await authService.getSession();
    if (!session.userId) {
      throw ApiError.unauthorized();
    }

    const rateLimitResult = await rateLimit(
      `user:export-account-data:${session.userId}`,
      RATE_LIMITS.EXPORT,
      {
        actorId: session.userId,
        ip: getClientIP(request),
        route: '/api/user/export-account-data',
        method: 'GET',
        userAgent: request.headers.get('user-agent'),
      }
    );

    if (!rateLimitResult.allowed) {
      const resetIn = Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: rateLimitResult.error || 'Export limit exceeded' },
        {
          status: 429,
          headers: {
            'Retry-After': String(resetIn),
            'X-RateLimit-Limit': String(RATE_LIMITS.EXPORT.limit),
            'X-RateLimit-Reset': String(rateLimitResult.reset),
          },
        }
      );
    }

    const [user, settings, subscriptions, payments, tickets, notifications, memberships, ownedOrganizations, userSessions] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          email: true,
          name: true,
          imageUrl: true,
          role: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
          tokenBalance: true,
          freeTokenBalance: true,
          freeTokensLastResetAt: true,
          tokensLastResetAt: true,
          paymentProvider: true,
          externalCustomerId: true,
          externalCustomerIds: true,
        },
      }),
      prisma.userSetting.findMany({
        where: { userId: session.userId },
        select: { id: true, key: true, value: true, createdAt: true, updatedAt: true },
        orderBy: { key: 'asc' },
      }),
      prisma.subscription.findMany({
        where: { userId: session.userId },
        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          status: true,
          startedAt: true,
          expiresAt: true,
          canceledAt: true,
          clearPaidTokensOnExpiry: true,
          cancelAtPeriodEnd: true,
          scheduledPlanId: true,
          scheduledPlanDate: true,
          prorationPendingSince: true,
          paymentProvider: true,
          externalSubscriptionId: true,
          externalSubscriptionIds: true,
          createdAt: true,
          updatedAt: true,
          plan: {
            select: {
              id: true,
              name: true,
              shortDescription: true,
              description: true,
              durationHours: true,
              priceCents: true,
              tokenLimit: true,
              tokenName: true,
              scope: true,
              autoRenew: true,
              recurringInterval: true,
              recurringIntervalCount: true,
              supportsOrganizations: true,
            },
          },
          organization: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.payment.findMany({
        where: { userId: session.userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          subscriptionId: true,
          planId: true,
          organizationId: true,
          amountCents: true,
          subtotalCents: true,
          discountCents: true,
          couponCode: true,
          currency: true,
          paymentProvider: true,
          externalPaymentId: true,
          externalSessionId: true,
          externalRefundId: true,
          externalPaymentIds: true,
          externalSessionIds: true,
          externalRefundIds: true,
          status: true,
          createdAt: true,
          plan: {
            select: {
              id: true,
              name: true,
              shortDescription: true,
              description: true,
              durationHours: true,
              priceCents: true,
              tokenLimit: true,
              tokenName: true,
              scope: true,
              autoRenew: true,
              recurringInterval: true,
              recurringIntervalCount: true,
              supportsOrganizations: true,
            },
          },
          subscription: {
            select: {
              id: true,
              status: true,
              startedAt: true,
              expiresAt: true,
              plan: {
                select: {
                  id: true,
                  name: true,
                  shortDescription: true,
                  description: true,
                  durationHours: true,
                  priceCents: true,
                  tokenLimit: true,
                  tokenName: true,
                  scope: true,
                  autoRenew: true,
                  recurringInterval: true,
                  recurringIntervalCount: true,
                  supportsOrganizations: true,
                },
              },
            },
          },
        },
      }),
      prisma.supportTicket.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          subject: true,
          message: true,
          category: true,
          status: true,
          createdByRole: true,
          createdAt: true,
          updatedAt: true,
          replies: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, message: true, createdAt: true },
          },
        },
      }),
      prisma.notification.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, message: true, type: true, url: true, read: true, createdAt: true },
      }),
      prisma.organizationMembership.findMany({
        where: { userId: session.userId, status: 'ACTIVE' },
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              tokenBalance: true,
              tokenPoolStrategy: true,
              memberTokenCap: true,
              memberCapStrategy: true,
              memberCapResetIntervalHours: true,
              ownerExemptFromCaps: true,
              createdAt: true,
              updatedAt: true,
              plan: { select: { id: true, name: true, scope: true, supportsOrganizations: true } },
            },
          },
        },
      }),
      prisma.organization.findMany({
        where: { ownerUserId: session.userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          tokenBalance: true,
          tokenPoolStrategy: true,
          memberTokenCap: true,
          memberCapStrategy: true,
          memberCapResetIntervalHours: true,
          ownerExemptFromCaps: true,
          createdAt: true,
          updatedAt: true,
          plan: { select: { id: true, name: true, scope: true, supportsOrganizations: true } },
        },
      }),
      authService.getUserSessions(session.userId),
    ]);

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      profile: {
        ...user,
        emailVerified: toIso(user.emailVerified),
        createdAt: toIso(user.createdAt),
        updatedAt: toIso(user.updatedAt),
        externalCustomerIds: parseProviderIdMap(user.externalCustomerIds),
      },
      security: {
        sessions: userSessions.map(mapSession),
      },
      settings,
      billing: {
        subscriptions: subscriptions.map((subscription) => ({
          ...subscription,
          startedAt: toIso(subscription.startedAt),
          expiresAt: toIso(subscription.expiresAt),
          canceledAt: toIso(subscription.canceledAt),
          scheduledPlanDate: toIso(subscription.scheduledPlanDate),
          prorationPendingSince: toIso(subscription.prorationPendingSince),
          createdAt: toIso(subscription.createdAt),
          updatedAt: toIso(subscription.updatedAt),
          externalSubscriptionIds: parseProviderIdMap(subscription.externalSubscriptionIds),
        })),
        payments: payments.map((payment) => ({
          ...payment,
          createdAt: toIso(payment.createdAt),
          externalPaymentIds: parseProviderIdMap(payment.externalPaymentIds),
          externalSessionIds: parseProviderIdMap(payment.externalSessionIds),
          externalRefundIds: parseProviderIdMap(payment.externalRefundIds),
        })),
      },
      support: tickets.map((ticket) => ({
        ...ticket,
        createdAt: toIso(ticket.createdAt),
        updatedAt: toIso(ticket.updatedAt),
        replies: ticket.replies.map((reply) => ({
          ...reply,
          createdAt: toIso(reply.createdAt),
        })),
      })),
      notifications: notifications.map((notification) => ({
        ...notification,
        createdAt: toIso(notification.createdAt),
      })),
      organizations: {
        memberships: memberships.map((membership) => ({
          ...membership,
          createdAt: toIso(membership.createdAt),
          updatedAt: toIso(membership.updatedAt),
        })),
        owned: ownedOrganizations.map((organization) => ({
          ...organization,
          createdAt: toIso(organization.createdAt),
          updatedAt: toIso(organization.updatedAt),
        })),
      },
    };

    const body = `${JSON.stringify(payload, null, 2)}\n`;
    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="saasybase-account-data-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store, max-age=0',
    });

    return new NextResponse(body, { headers });
  } catch (error) {
    return handleApiError(error);
  }
}