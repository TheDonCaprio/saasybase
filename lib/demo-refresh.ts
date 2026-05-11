import type { Prisma } from '@/lib/prisma-client';
import { prisma } from './prisma';
import { ensurePlansSeeded } from './plans';

const DEMO_DOMAIN = 'demo.saasybase.test';
const DEMO_CONTEXT = 'demo-seed';

export class DemoRefreshSeedMissingError extends Error {
  constructor(message = 'No demo users found. Run `npm run demo:seed` first.') {
    super(message);
    this.name = 'DemoRefreshSeedMissingError';
  }
}

export type DemoRefreshConfig = {
  windowDays?: number;
  visitWindowDays?: number;
};

export type DemoRefreshResult = {
  users: number;
  organizations: number;
  subscriptions: number;
  payments: number;
  tickets: number;
  replies: number;
  notifications: number;
  emailLogs: number;
  visits: number;
  systemLogs: number;
  adminActions: number;
  invites: number;
  blogPosts: number;
  coupons: number;
};

function mulberry32(seed: number) {
  let current = seed >>> 0;
  return () => {
    current += 0x6d2b79f5;
    let value = Math.imul(current ^ (current >>> 15), 1 | current);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20260504 ^ Math.floor(Date.now() / 1000 / 60 / 10));

function randInt(min: number, max: number) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pickOne<T>(items: T[]): T {
  return items[randInt(0, items.length - 1)];
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}

function randomPastDate(maxDaysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - randInt(0, maxDaysAgo));
  date.setHours(randInt(0, 23), randInt(0, 59), randInt(0, 59), 0);
  return date;
}

function safeIds(items: string[]) {
  return items.length > 0 ? items : ['__demo-none__'];
}

async function runTransactionsInChunks(tasks: Array<Prisma.PrismaPromise<unknown>>, size = 100) {
  for (let index = 0; index < tasks.length; index += size) {
    const batch = tasks.slice(index, index + size);
    if (batch.length > 0) {
      await Promise.all(batch);
    }
  }
}

export async function refreshDemoData(input: DemoRefreshConfig = {}): Promise<DemoRefreshResult> {
  const config = {
    windowDays: input.windowDays ?? 120,
    visitWindowDays: input.visitWindowDays ?? 45,
  };

  await ensurePlansSeeded();

  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
    select: { id: true, role: true },
    orderBy: { createdAt: 'asc' },
  });

  if (demoUsers.length === 0) {
    throw new DemoRefreshSeedMissingError();
  }

  const userIds = demoUsers.map((user) => user.id);
  const organizations = await prisma.organization.findMany({
    where: {
      OR: [
        { slug: { startsWith: 'demo-org-' } },
        { ownerUserId: { in: safeIds(userIds) } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const organizationIds = organizations.map((organization) => organization.id);

  const plans = await prisma.plan.findMany({
    select: { id: true, priceCents: true },
  });
  const priceByPlanId = new Map(plans.map((plan) => [plan.id, plan.priceCents]));

  const subscriptions = await prisma.subscription.findMany({
    where: {
      OR: [
        { userId: { in: safeIds(userIds) } },
        { organizationId: { in: safeIds(organizationIds) } },
        { externalSubscriptionId: { startsWith: 'demo-sub-' } },
      ],
    },
    select: {
      id: true,
      planId: true,
      organizationId: true,
      isLifetime: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const subscriptionUpdates = subscriptions.map((subscription, index) => {
    const activeLikeStatus = index % 8 === 0 ? 'PAST_DUE' : index % 11 === 0 ? 'PENDING' : index % 13 === 0 ? 'CANCELLED' : 'ACTIVE';
    const startedAt = randomPastDate(Math.max(45, config.windowDays));
    const updateData = subscription.isLifetime
      ? {
          status: 'ACTIVE',
          startedAt,
          expiresAt: addDays(new Date(), 3650),
          canceledAt: null,
          cancelAtPeriodEnd: false,
          clearPaidTokensOnExpiry: false,
          lastPaymentAmountCents: priceByPlanId.get(subscription.planId) ?? null,
        }
      : activeLikeStatus === 'ACTIVE'
        ? {
            status: 'ACTIVE',
            startedAt,
            expiresAt: addDays(new Date(), randInt(28, 120)),
            canceledAt: null,
            cancelAtPeriodEnd: index % 14 === 0,
            clearPaidTokensOnExpiry: false,
            lastPaymentAmountCents: priceByPlanId.get(subscription.planId) ?? null,
          }
        : activeLikeStatus === 'PENDING'
          ? {
              status: 'PENDING',
              startedAt,
              expiresAt: addDays(new Date(), randInt(10, 25)),
              canceledAt: null,
              cancelAtPeriodEnd: false,
              clearPaidTokensOnExpiry: false,
              lastPaymentAmountCents: priceByPlanId.get(subscription.planId) ?? null,
            }
          : activeLikeStatus === 'PAST_DUE'
            ? {
                status: 'PAST_DUE',
                startedAt,
                expiresAt: addDays(new Date(), randInt(2, 12)),
                canceledAt: null,
                cancelAtPeriodEnd: false,
                clearPaidTokensOnExpiry: false,
                lastPaymentAmountCents: priceByPlanId.get(subscription.planId) ?? null,
              }
            : {
                status: 'CANCELLED',
                startedAt,
                expiresAt: randomPastDate(20),
                canceledAt: randomPastDate(10),
                cancelAtPeriodEnd: false,
                clearPaidTokensOnExpiry: false,
                lastPaymentAmountCents: priceByPlanId.get(subscription.planId) ?? null,
              };

    return prisma.subscription.update({
      where: { id: subscription.id },
      data: updateData,
    });
  });
  await runTransactionsInChunks(subscriptionUpdates, 80);

  const freshSubscriptions = await prisma.subscription.findMany({
    where: { id: { in: subscriptions.map((subscription) => subscription.id) } },
    select: { id: true, status: true },
  });
  const subscriptionStatusById = new Map(freshSubscriptions.map((subscription) => [subscription.id, subscription.status]));

  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { userId: { in: safeIds(userIds) } },
        { organizationId: { in: safeIds(organizationIds) } },
        { externalPaymentId: { startsWith: 'demo-pay-' } },
      ],
    },
    select: { id: true, status: true, subscriptionId: true },
    orderBy: { createdAt: 'asc' },
  });

  const paymentUpdates = payments.map((payment, index) => {
    const relatedStatus = payment.subscriptionId ? subscriptionStatusById.get(payment.subscriptionId) : null;
    const nextStatus = payment.status === 'REFUNDED'
      ? 'REFUNDED'
      : payment.status === 'FAILED' || relatedStatus === 'PAST_DUE'
        ? 'FAILED'
        : payment.status === 'PENDING' || relatedStatus === 'PENDING'
          ? 'PENDING'
          : 'SUCCEEDED';
    const createdAt = nextStatus === 'SUCCEEDED'
      ? randomPastDate(Math.max(20, config.windowDays))
      : nextStatus === 'REFUNDED'
        ? randomPastDate(Math.max(30, Math.floor(config.windowDays * 0.9)))
        : randomPastDate(14);

    return prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: nextStatus,
        createdAt: addHours(createdAt, index % 6),
      },
    });
  });
  await runTransactionsInChunks(paymentUpdates, 100);

  const tickets = await prisma.supportTicket.findMany({
    where: {
      OR: [
        { userId: { in: safeIds(userIds) } },
        { subject: { startsWith: '[Demo]' } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const replies = await prisma.ticketReply.findMany({
    where: {
      OR: [
        { ticketId: { in: safeIds(tickets.map((ticket) => ticket.id)) } },
        { userId: { in: safeIds(userIds) } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  const ticketUpdates = tickets.map((ticket) => prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      status: pickOne(['OPEN', 'OPEN', 'IN_PROGRESS', 'CLOSED']),
      createdAt: randomPastDate(Math.max(14, Math.floor(config.windowDays * 0.7))),
    },
  }));
  const replyUpdates = replies.map((reply, index) => prisma.ticketReply.update({
    where: { id: reply.id },
    data: { createdAt: addHours(randomPastDate(Math.max(12, Math.floor(config.windowDays * 0.5))), index % 8) },
  }));
  await runTransactionsInChunks(ticketUpdates, 80);
  await runTransactionsInChunks(replyUpdates, 120);

  const notificationIds = (await prisma.notification.findMany({
    where: {
      OR: [
        { userId: { in: safeIds(userIds) } },
        { title: { startsWith: '[Demo]' } },
      ],
    },
    select: { id: true },
  })).map((notification) => notification.id);
  const emailLogIds = (await prisma.emailLog.findMany({
    where: {
      OR: [
        { userId: { in: safeIds(userIds) } },
        { to: { endsWith: `@${DEMO_DOMAIN}` } },
        { subject: { startsWith: '[Demo]' } },
      ],
    },
    select: { id: true },
  })).map((emailLog) => emailLog.id);
  const visitIds = (await prisma.visitLog.findMany({
    where: {
      OR: [
        { userId: { in: safeIds(userIds) } },
        { path: { startsWith: '/demo' } },
      ],
    },
    select: { id: true },
  })).map((visit) => visit.id);
  const systemLogIds = (await prisma.systemLog.findMany({
    where: { context: DEMO_CONTEXT },
    select: { id: true },
  })).map((systemLog) => systemLog.id);
  const adminActionIds = (await prisma.adminActionLog.findMany({
    where: {
      OR: [
        { actorId: { in: safeIds(userIds) } },
        { targetUserId: { in: safeIds(userIds) } },
        { action: { startsWith: 'demo.' } },
      ],
    },
    select: { id: true },
  })).map((adminAction) => adminAction.id);
  const inviteIds = (await prisma.organizationInvite.findMany({
    where: {
      OR: [
        { organizationId: { in: safeIds(organizationIds) } },
        { invitedByUserId: { in: safeIds(userIds) } },
        { email: { endsWith: `@${DEMO_DOMAIN}` } },
      ],
    },
    select: { id: true },
  })).map((invite) => invite.id);
  const blogPostIds = (await prisma.sitePage.findMany({
    where: { collection: 'blog', slug: { startsWith: 'demo-lorem-' } },
    select: { id: true },
  })).map((post) => post.id);
  const couponIds = (await prisma.coupon.findMany({
    where: { code: { startsWith: 'DEMO' } },
    select: { id: true },
  })).map((coupon) => coupon.id);

  await runTransactionsInChunks(notificationIds.map((id) => prisma.notification.update({
    where: { id },
    data: {
      read: randInt(0, 2) === 0,
      createdAt: randomPastDate(Math.max(10, Math.floor(config.windowDays * 0.45))),
    },
  })), 120);

  await runTransactionsInChunks(emailLogIds.map((id) => prisma.emailLog.update({
    where: { id },
    data: {
      status: pickOne(['SENT', 'SENT', 'SENT', 'FAILED']),
      error: randInt(0, 10) === 0 ? 'Mailbox provider timeout (demo refresh)' : null,
      createdAt: randomPastDate(Math.max(10, Math.floor(config.windowDays * 0.5))),
    },
  })), 120);

  await runTransactionsInChunks(visitIds.map((id, index) => prisma.visitLog.update({
    where: { id },
    data: {
      createdAt: addHours(randomPastDate(config.visitWindowDays), index % 10),
      country: pickOne(['US', 'GB', 'NG', 'DE', 'IN', 'CA']),
      city: pickOne(['Lagos', 'Berlin', 'Toronto', 'London', 'Austin', 'Bengaluru']),
      referrer: pickOne(['https://google.com', 'https://x.com', 'https://github.com', 'https://saasybase.com']),
    },
  })), 150);

  await runTransactionsInChunks(systemLogIds.map((id) => prisma.systemLog.update({
    where: { id },
    data: {
      level: pickOne(['INFO', 'INFO', 'WARN', 'ERROR']),
      createdAt: randomPastDate(Math.max(7, Math.floor(config.windowDays * 0.3))),
    },
  })), 120);

  await runTransactionsInChunks(adminActionIds.map((id) => prisma.adminActionLog.update({
    where: { id },
    data: {
      createdAt: randomPastDate(Math.max(10, Math.floor(config.windowDays * 0.6))),
      action: pickOne(['demo.user.impersonate', 'demo.payment.review', 'demo.ticket.assign', 'demo.subscription.adjust', 'demo.org.audit']),
    },
  })), 120);

  await runTransactionsInChunks(inviteIds.map((id) => prisma.organizationInvite.update({
    where: { id },
    data: {
      status: pickOne(['PENDING', 'PENDING', 'ACCEPTED']),
      createdAt: randomPastDate(10),
      expiresAt: addDays(new Date(), randInt(5, 14)),
      acceptedAt: randInt(0, 4) === 0 ? randomPastDate(6) : null,
    },
  })), 100);

  await runTransactionsInChunks(blogPostIds.map((id) => prisma.sitePage.update({
    where: { id },
    data: {
      publishedAt: randomPastDate(Math.max(20, Math.floor(config.windowDays * 0.8))),
    },
  })), 60);

  await runTransactionsInChunks(couponIds.map((id) => prisma.coupon.update({
    where: { id },
    data: {
      startsAt: randomPastDate(Math.max(20, Math.floor(config.windowDays * 0.8))),
      endsAt: addDays(new Date(), randInt(30, 180)),
      redemptionCount: randInt(5, 120),
      active: true,
    },
  })), 40);

  return {
    users: demoUsers.length,
    organizations: organizations.length,
    subscriptions: subscriptions.length,
    payments: payments.length,
    tickets: tickets.length,
    replies: replies.length,
    notifications: notificationIds.length,
    emailLogs: emailLogIds.length,
    visits: visitIds.length,
    systemLogs: systemLogIds.length,
    adminActions: adminActionIds.length,
    invites: inviteIds.length,
    blogPosts: blogPostIds.length,
    coupons: couponIds.length,
  };
}