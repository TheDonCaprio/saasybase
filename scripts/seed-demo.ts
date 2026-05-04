import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createPrismaClient } from '../lib/create-prisma-client';
import { ensurePlansSeeded } from '../lib/plans';

const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

const prisma = createPrismaClient();

const DEMO_DOMAIN = 'demo.saasybase.test';
const DEMO_PASSWORD = 'DemoPass123';
const DEMO_CONTEXT = 'demo-seed';
const DEFAULT_USER_COUNT = 330;
const DEFAULT_BLOG_POST_COUNT = 20;
const DEFAULT_ORG_COUNT = 24;
const DEFAULT_VISIT_COUNT = 1600;
const DEFAULT_SYSTEM_LOG_COUNT = 420;
const DEFAULT_NOTIFICATION_COUNT = 960;
const DEFAULT_SUPPORT_TICKET_COUNT = 110;
const DEFAULT_EMAIL_LOG_COUNT = 220;
const DEFAULT_ADMIN_ACTION_COUNT = 180;

type DemoConfig = {
  userCount: number;
  blogPostCount: number;
  orgCount: number;
  visitCount: number;
  systemLogCount: number;
  notificationCount: number;
  supportTicketCount: number;
  emailLogCount: number;
  adminActionCount: number;
};

type DemoUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
  paymentProvider: string;
  externalCustomerId: string;
  tokenBalance: number;
  freeTokenBalance: number;
  suspendedAt: Date | null;
  suspensionReason: string | null;
  suspensionIsPermanent: boolean;
};

type DemoOrganization = {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  billingEmail: string;
  planId: string | null;
  createdAt: Date;
  tokenBalance: number;
};

type DemoPlan = {
  id: string;
  name: string;
  priceCents: number;
  autoRenew: boolean;
  supportsOrganizations: boolean;
};

type SeedCounts = {
  users: number;
  organizations: number;
  memberships: number;
  subscriptions: number;
  payments: number;
  coupons: number;
  couponRedemptions: number;
  tickets: number;
  replies: number;
  notifications: number;
  emailLogs: number;
  visits: number;
  systemLogs: number;
  blogPosts: number;
  adminActions: number;
};

function printHelp() {
  console.log(`\nDemo site seeder\n\nUsage:\n  npm run demo:seed\n  npm run demo:seed -- --users=360 --posts=24\n  npx tsx scripts/seed-demo.ts --help\n\nOptions:\n  --users=<n>          Number of demo users to create. Default: ${DEFAULT_USER_COUNT}\n  --posts=<n>          Number of demo blog posts to create. Default: ${DEFAULT_BLOG_POST_COUNT}\n  --orgs=<n>           Number of demo organizations to create. Default: ${DEFAULT_ORG_COUNT}\n  --visits=<n>         Number of visit log rows to create. Default: ${DEFAULT_VISIT_COUNT}\n  --help               Show this message\n\nNotes:\n  - This only replaces demo-namespaced data.\n  - It does not run the normal bootstrap seed.\n  - Demo login password for seeded credential accounts: ${DEMO_PASSWORD}\n`);
}

function getNumberArg(name: string, defaultValue: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (!raw) return defaultValue;
  const value = Number(raw.split('=')[1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid value for ${name}: ${raw.split('=')[1]}`);
  }
  return Math.floor(value);
}

function getConfig(): DemoConfig {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  return {
    userCount: getNumberArg('--users', DEFAULT_USER_COUNT),
    blogPostCount: getNumberArg('--posts', DEFAULT_BLOG_POST_COUNT),
    orgCount: getNumberArg('--orgs', DEFAULT_ORG_COUNT),
    visitCount: getNumberArg('--visits', DEFAULT_VISIT_COUNT),
    systemLogCount: DEFAULT_SYSTEM_LOG_COUNT,
    notificationCount: DEFAULT_NOTIFICATION_COUNT,
    supportTicketCount: DEFAULT_SUPPORT_TICKET_COUNT,
    emailLogCount: DEFAULT_EMAIL_LOG_COUNT,
    adminActionCount: DEFAULT_ADMIN_ACTION_COUNT,
  };
}

function mulberry32(seed: number) {
  let current = seed >>> 0;
  return () => {
    current += 0x6d2b79f5;
    let value = Math.imul(current ^ (current >>> 15), 1 | current);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20260504);

function randInt(min: number, max: number) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pickOne<T>(items: T[]): T {
  return items[randInt(0, items.length - 1)];
}

function pickManyUnique<T>(items: T[], count: number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randInt(0, index);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

function id(prefix: string, index: number) {
  return `demo-${prefix}-${String(index).padStart(4, '0')}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function randomPastDate(maxDaysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - randInt(0, maxDaysAgo));
  date.setHours(randInt(0, 23), randInt(0, 59), randInt(0, 59), 0);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function json(value: unknown) {
  return JSON.stringify(value);
}

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function buildOrWhere(filters: Array<Record<string, unknown>>, fallback: Record<string, unknown>) {
  return { OR: filters.length > 0 ? filters : [fallback] };
}

function safeIds(items: string[]) {
  return items.length > 0 ? items : ['__demo-none__'];
}

async function createManyInChunks<T>(
  runner: (data: T[]) => Promise<unknown>,
  items: T[],
  size = 200,
) {
  for (const group of chunk(items, size)) {
    if (group.length > 0) {
      await runner(group);
    }
  }
}

const FIRST_NAMES = [
  'Alex', 'Maya', 'Noah', 'Lena', 'Tariq', 'Amara', 'Grace', 'Omar', 'Ivy', 'Ethan', 'Priya', 'Nina', 'Hana', 'Lucas', 'Sara', 'Ben', 'Kemi', 'Zoe', 'Sam', 'Dami',
  'Ava', 'Leo', 'Mila', 'Theo', 'Ruth', 'Jade', 'Kian', 'Mason', 'Aisha', 'Riley', 'Ella', 'Jonah', 'Sofia', 'Daniel', 'Layla', 'Victor', 'Mina', 'Jasper', 'Yara', 'Elena',
];

const LAST_NAMES = [
  'Walker', 'Patel', 'Kim', 'Singh', 'Ruiz', 'Fischer', 'Adams', 'Novak', 'Jordan', 'Ali', 'Chen', 'Ito', 'Carter', 'Osei', 'Okafor', 'Silva', 'Martin', 'Reed', 'Lopez', 'Bennett',
  'Clark', 'Stone', 'Young', 'Diaz', 'Rossi', 'Mendes', 'Khan', 'Costa', 'Moreau', 'Ibrahim', 'Santos', 'Muller', 'Cole', 'Morris', 'Bauer', 'Lee', 'Nguyen', 'Nolan', 'Owens', 'Ford',
];

const COMPANY_WORDS = [
  'Orbit', 'Northstar', 'Pioneer', 'Atlas', 'Signal', 'Drift', 'Marble', 'Forge', 'Summit', 'Launch', 'Circuit', 'Harbor', 'Beacon', 'River', 'Foundry', 'Canvas', 'Operator', 'Bright', 'Pilot', 'Nova',
];

const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'integer', 'porta', 'tincidunt', 'nibh', 'morbi', 'gravida', 'ligula', 'vitae', 'vehicula', 'fermentum', 'praesent', 'massa',
  'viverra', 'elementum', 'justo', 'quis', 'dapibus', 'aliquam', 'curabitur', 'nulla', 'tellus', 'finibus', 'tempor', 'lectus', 'turpis', 'facilisis', 'orci', 'habitasse', 'platea', 'dictumst', 'sagittis', 'egestas',
];

function loremSentence(minWords = 8, maxWords = 18) {
  const wordCount = randInt(minWords, maxWords);
  const words: string[] = [];
  for (let index = 0; index < wordCount; index += 1) {
    words.push(pickOne(LOREM_WORDS));
  }
  const sentence = words.join(' ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

function loremParagraph(minSentences = 3, maxSentences = 6) {
  const sentences: string[] = [];
  const count = randInt(minSentences, maxSentences);
  for (let index = 0; index < count; index += 1) {
    sentences.push(loremSentence());
  }
  return sentences.join(' ');
}

function blogHtml(title: string) {
  return [
    `<h2>${title}</h2>`,
    `<p>${loremParagraph(4, 6)}</p>`,
    `<p>${loremParagraph(4, 6)}</p>`,
    `<blockquote>${loremSentence(12, 20)}</blockquote>`,
    `<p>${loremParagraph(3, 5)}</p>`,
    '<ul>',
    `<li>${loremSentence(5, 10)}</li>`,
    `<li>${loremSentence(5, 10)}</li>`,
    `<li>${loremSentence(5, 10)}</li>`,
    '</ul>',
    `<p>${loremParagraph(3, 5)}</p>`,
  ].join('');
}

async function purgeExistingDemoData() {
  const [demoUsers, demoOrganizations, demoCoupons, demoPosts, demoCategories] = await Promise.all([
    prisma.user.findMany({ where: { email: { endsWith: `@${DEMO_DOMAIN}` } }, select: { id: true } }),
    prisma.organization.findMany({ where: { slug: { startsWith: 'demo-org-' } }, select: { id: true } }),
    prisma.coupon.findMany({ where: { code: { startsWith: 'DEMO' } }, select: { id: true } }),
    prisma.sitePage.findMany({ where: { collection: 'blog', slug: { startsWith: 'demo-lorem-' } }, select: { id: true } }),
    prisma.blogCategory.findMany({ where: { slug: { startsWith: 'demo-' } }, select: { id: true } }),
  ]);

  const userIds = demoUsers.map((user) => user.id);
  const orgIds = demoOrganizations.map((org) => org.id);
  const couponIds = demoCoupons.map((coupon) => coupon.id);
  const postIds = demoPosts.map((post) => post.id);
  const categoryIds = demoCategories.map((category) => category.id);
  const ticketIds = (
    await prisma.supportTicket.findMany({
      where: {
        OR: [
          { userId: { in: safeIds(userIds) } },
          { subject: { startsWith: '[Demo]' } },
        ],
      },
      select: { id: true },
    })
  ).map((ticket) => ticket.id);

  await prisma.blogPostCategory.deleteMany({
    where: buildOrWhere(
      [
        ...(postIds.length > 0 ? [{ postId: { in: postIds } }] : []),
        ...(categoryIds.length > 0 ? [{ categoryId: { in: categoryIds } }] : []),
      ],
      { postId: { in: ['__demo-none__'] } },
    ),
  });
  await prisma.couponRedemption.deleteMany({
    where: buildOrWhere(
      [
        ...(couponIds.length > 0 ? [{ couponId: { in: couponIds } }] : []),
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
      ],
      { couponId: { in: ['__demo-none__'] } },
    ),
  });
  await prisma.couponPlan.deleteMany({ where: { couponId: { in: safeIds(couponIds) } } });
  await prisma.ticketReply.deleteMany({
    where: buildOrWhere(
      [
        ...(ticketIds.length > 0 ? [{ ticketId: { in: ticketIds } }] : []),
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
      ],
      { ticketId: { in: ['__demo-none__'] } },
    ),
  });
  await prisma.supportTicket.deleteMany({ where: ticketIds.length > 0 ? { id: { in: ticketIds } } : { subject: { startsWith: '[Demo]' } } });
  await prisma.emailLog.deleteMany({
    where: buildOrWhere(
      [
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
        { to: { endsWith: `@${DEMO_DOMAIN}` } },
        { subject: { startsWith: '[Demo]' } },
      ],
      { subject: { startsWith: '[Demo]' } },
    ),
  });
  await prisma.notification.deleteMany({
    where: buildOrWhere(
      [
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
        { title: { startsWith: '[Demo]' } },
      ],
      { title: { startsWith: '[Demo]' } },
    ),
  });
  await prisma.visitLog.deleteMany({
    where: buildOrWhere(
      [
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
        { path: { startsWith: '/demo' } },
      ],
      { path: { startsWith: '/demo' } },
    ),
  });
  await prisma.adminActionLog.deleteMany({
    where: buildOrWhere(
      [
        ...(userIds.length > 0 ? [{ actorId: { in: userIds } }] : []),
        ...(userIds.length > 0 ? [{ targetUserId: { in: userIds } }] : []),
        { action: { startsWith: 'demo.' } },
      ],
      { action: { startsWith: 'demo.' } },
    ),
  });
  await prisma.featureUsageLog.deleteMany({ where: { userId: { in: safeIds(userIds) } } });
  await prisma.userSetting.deleteMany({ where: { userId: { in: safeIds(userIds) } } });
  await prisma.paymentAuthorization.deleteMany({ where: { userId: { in: safeIds(userIds) } } });
  await prisma.payment.deleteMany({
    where: buildOrWhere(
      [
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
        ...(orgIds.length > 0 ? [{ organizationId: { in: orgIds } }] : []),
        { externalPaymentId: { startsWith: 'demo-pay-' } },
      ],
      { externalPaymentId: { startsWith: 'demo-pay-' } },
    ),
  });
  await prisma.subscription.deleteMany({
    where: buildOrWhere(
      [
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
        ...(orgIds.length > 0 ? [{ organizationId: { in: orgIds } }] : []),
        { externalSubscriptionId: { startsWith: 'demo-sub-' } },
      ],
      { externalSubscriptionId: { startsWith: 'demo-sub-' } },
    ),
  });
  await prisma.organizationInvite.deleteMany({
    where: buildOrWhere(
      [
        ...(orgIds.length > 0 ? [{ organizationId: { in: orgIds } }] : []),
        ...(userIds.length > 0 ? [{ invitedByUserId: { in: userIds } }] : []),
        { email: { endsWith: `@${DEMO_DOMAIN}` } },
      ],
      { email: { endsWith: `@${DEMO_DOMAIN}` } },
    ),
  });
  await prisma.organizationMembership.deleteMany({
    where: buildOrWhere(
      [
        ...(orgIds.length > 0 ? [{ organizationId: { in: orgIds } }] : []),
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
      ],
      { organizationId: { in: ['__demo-none__'] } },
    ),
  });
  await prisma.organization.deleteMany({ where: orgIds.length > 0 ? { id: { in: orgIds } } : { slug: { startsWith: 'demo-org-' } } });
  await prisma.account.deleteMany({ where: { userId: { in: safeIds(userIds) } } });
  await prisma.session.deleteMany({ where: { userId: { in: safeIds(userIds) } } });
  await prisma.rateLimitBucket.deleteMany({
    where: buildOrWhere(
      [
        ...(userIds.length > 0 ? [{ actorId: { in: userIds } }] : []),
        { key: { startsWith: 'demo:' } },
      ],
      { key: { startsWith: 'demo:' } },
    ),
  });
  await prisma.sitePage.deleteMany({ where: postIds.length > 0 ? { id: { in: postIds } } : { slug: { startsWith: 'demo-lorem-' } } });
  await prisma.blogCategory.deleteMany({ where: categoryIds.length > 0 ? { id: { in: categoryIds } } : { slug: { startsWith: 'demo-' } } });
  await prisma.coupon.deleteMany({ where: couponIds.length > 0 ? { id: { in: couponIds } } : { code: { startsWith: 'DEMO' } } });
  await prisma.systemLog.deleteMany({ where: { context: DEMO_CONTEXT } });
  await prisma.user.deleteMany({ where: userIds.length > 0 ? { id: { in: userIds } } : { email: { endsWith: `@${DEMO_DOMAIN}` } } });
}

async function main() {
  const config = getConfig();
  const activeProvider = (process.env.PAYMENT_PROVIDER || 'stripe').toLowerCase();
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
  const counts: SeedCounts = {
    users: 0,
    organizations: 0,
    memberships: 0,
    subscriptions: 0,
    payments: 0,
    coupons: 0,
    couponRedemptions: 0,
    tickets: 0,
    replies: 0,
    notifications: 0,
    emailLogs: 0,
    visits: 0,
    systemLogs: 0,
    blogPosts: 0,
    adminActions: 0,
  };

  console.log('Resetting existing demo data namespace...');
  await purgeExistingDemoData();

  console.log('Ensuring plans exist...');
  await ensurePlansSeeded();

  const plans = (await prisma.plan.findMany({
    orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
    select: {
      id: true,
      name: true,
      priceCents: true,
      autoRenew: true,
      supportsOrganizations: true,
    },
  })) as DemoPlan[];

  if (plans.length === 0) {
    throw new Error('No plans found after ensurePlansSeeded().');
  }

  const subscriptionPlans = plans.filter((plan) => plan.autoRenew);
  const oneTimePlans = plans.filter((plan) => !plan.autoRenew);
  const orgPlans = plans.filter((plan) => plan.supportsOrganizations);
  const effectiveSubscriptionPlans = subscriptionPlans.length > 0 ? subscriptionPlans : plans;
  const effectiveOneTimePlans = oneTimePlans.length > 0 ? oneTimePlans : plans;
  const effectiveOrgPlans = orgPlans.length > 0 ? orgPlans : effectiveSubscriptionPlans;

  const demoUsers: DemoUser[] = [];
  for (let index = 0; index < config.userCount; index += 1) {
    const firstName = pickOne(FIRST_NAMES);
    const lastName = pickOne(LAST_NAMES);
    const name = `${firstName} ${lastName}`;
    const specialEmail =
      index === 0 ? `demo-admin@${DEMO_DOMAIN}`
        : index === 1 ? `demo-moderator@${DEMO_DOMAIN}`
          : index === 2 ? `demo-user@${DEMO_DOMAIN}`
            : `member${String(index + 1).padStart(3, '0')}@${DEMO_DOMAIN}`;

    demoUsers.push({
      id: id('user', index + 1),
      email: specialEmail,
      name,
      role: index === 0 ? 'ADMIN' : index === 1 ? 'MODERATOR' : 'USER',
      createdAt: randomPastDate(320),
      paymentProvider: activeProvider,
      externalCustomerId: `demo-customer-${String(index + 1).padStart(4, '0')}`,
      tokenBalance: randInt(20, 900),
      freeTokenBalance: randInt(0, 160),
      suspendedAt: index % 41 === 0 && index > 10 ? randomPastDate(40) : null,
      suspensionReason: index % 41 === 0 && index > 10 ? 'Demo account suspended for moderation preview.' : null,
      suspensionIsPermanent: false,
    });
  }

  const userRows = demoUsers.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    password: hashedPassword,
    emailVerified: user.createdAt,
    emailVerifiedBool: true,
    paymentsCount: 0,
    externalCustomerIds: json({ [activeProvider]: user.externalCustomerId }),
    tokenBalance: user.tokenBalance,
    freeTokenBalance: user.freeTokenBalance,
    freeTokensLastResetAt: randomPastDate(25),
    tokensLastResetAt: randomPastDate(25),
    createdAt: user.createdAt,
    paymentProvider: user.paymentProvider,
    externalCustomerId: user.externalCustomerId,
    suspendedAt: user.suspendedAt,
    suspensionReason: user.suspensionReason,
    suspensionIsPermanent: user.suspensionIsPermanent,
  }));

  const accountRows = demoUsers.map((user, index) => ({
    id: id('account', index + 1),
    userId: user.id,
    type: 'credentials',
    provider: 'credential',
    providerAccountId: user.id,
    accountId: user.id,
    providerId: 'credential',
    password: hashedPassword,
    createdAt: user.createdAt,
  }));

  const userSettingRows = demoUsers.map((user, index) => ({
    id: id('user-setting', index + 1),
    userId: user.id,
    key: 'EMAIL_NOTIFICATIONS',
    value: index % 9 === 0 ? 'false' : 'true',
    createdAt: user.createdAt,
  }));

  console.log(`Creating ${userRows.length} demo users...`);
  await createManyInChunks((data) => prisma.user.createMany({ data }), userRows);
  await createManyInChunks((data) => prisma.account.createMany({ data }), accountRows);
  await createManyInChunks((data) => prisma.userSetting.createMany({ data }), userSettingRows);
  counts.users = userRows.length;

  const organizationOwners = pickManyUnique(demoUsers.filter((user) => user.role === 'USER'), config.orgCount);
  const organizations: DemoOrganization[] = organizationOwners.map((owner, index) => ({
    id: id('org', index + 1),
    name: `${pickOne(COMPANY_WORDS)} ${pickOne(['Studio', 'Labs', 'Cloud', 'Works', 'Collective', 'Systems'])}`,
    slug: `demo-org-${String(index + 1).padStart(2, '0')}-${slugify(owner.name)}`,
    ownerUserId: owner.id,
    billingEmail: `billing+${String(index + 1).padStart(2, '0')}@${DEMO_DOMAIN}`,
    planId: pickOne(effectiveOrgPlans).id,
    createdAt: randomPastDate(240),
    tokenBalance: randInt(500, 5000),
  }));

  const organizationRows = organizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    ownerUserId: organization.ownerUserId,
    planId: organization.planId,
    billingEmail: organization.billingEmail,
    tokenBalance: organization.tokenBalance,
    createdAt: organization.createdAt,
  }));

  const membershipRows: Array<{
    id: string;
    organizationId: string;
    userId: string;
    role: string;
    status: string;
    sharedTokenBalance: number;
    createdAt: Date;
  }> = [];
  const inviteRows: Array<{
    id: string;
    organizationId: string;
    email: string;
    role: string;
    status: string;
    invitedByUserId: string;
    token: string;
    expiresAt: Date;
    createdAt: Date;
  }> = [];

  organizations.forEach((organization, index) => {
    const memberPool = demoUsers.filter((user) => user.id !== organization.ownerUserId);
    const members = pickManyUnique(memberPool, randInt(4, 12));
    membershipRows.push({
      id: id('membership', membershipRows.length + 1),
      organizationId: organization.id,
      userId: organization.ownerUserId,
      role: 'OWNER',
      status: 'ACTIVE',
      sharedTokenBalance: randInt(100, 900),
      createdAt: organization.createdAt,
    });
    members.forEach((member, memberIndex) => {
      membershipRows.push({
        id: id('membership', membershipRows.length + 1),
        organizationId: organization.id,
        userId: member.id,
        role: memberIndex === 0 ? 'ADMIN' : 'MEMBER',
        status: 'ACTIVE',
        sharedTokenBalance: randInt(0, 400),
        createdAt: randomPastDate(180),
      });
    });
    inviteRows.push({
      id: id('invite', index + 1),
      organizationId: organization.id,
      email: `invite-${String(index + 1).padStart(2, '0')}@${DEMO_DOMAIN}`,
      role: 'MEMBER',
      status: 'PENDING',
      invitedByUserId: organization.ownerUserId,
      token: `demo-invite-token-${String(index + 1).padStart(4, '0')}`,
      expiresAt: addDays(new Date(), 7),
      createdAt: randomPastDate(12),
    });
  });

  console.log(`Creating ${organizationRows.length} organizations and ${membershipRows.length} memberships...`);
  await prisma.organization.createMany({ data: organizationRows });
  await createManyInChunks((data) => prisma.organizationMembership.createMany({ data }), membershipRows);
  await prisma.organizationInvite.createMany({ data: inviteRows });
  counts.organizations = organizationRows.length;
  counts.memberships = membershipRows.length;

  const coupons = [
    { code: 'DEMO10', percentOff: 10, duration: 'once' },
    { code: 'DEMO15', percentOff: 15, duration: 'repeating', durationInMonths: 3 },
    { code: 'DEMO25', percentOff: 25, duration: 'once' },
    { code: 'DEMO50', percentOff: 50, duration: 'once' },
    { code: 'DEMOOFF20', amountOffCents: 2000, currency: 'USD', duration: 'once' },
    { code: 'DEMOOFF50', amountOffCents: 5000, currency: 'USD', duration: 'once' },
    { code: 'DEMOLAUNCH', percentOff: 20, duration: 'forever' },
    { code: 'DEMOAGENCY', percentOff: 30, duration: 'repeating', durationInMonths: 6 },
  ].map((coupon, index) => ({
    id: id('coupon', index + 1),
    code: coupon.code,
    description: `[Demo] ${coupon.code} seeded for the demo storefront and admin views.`,
    percentOff: 'percentOff' in coupon ? coupon.percentOff ?? null : null,
    amountOffCents: 'amountOffCents' in coupon ? coupon.amountOffCents ?? null : null,
    currency: 'currency' in coupon ? coupon.currency ?? null : null,
    duration: coupon.duration,
    durationInMonths: 'durationInMonths' in coupon ? coupon.durationInMonths ?? null : null,
    minimumPurchaseCents: 1500,
    active: true,
    maxRedemptions: randInt(40, 250),
    redemptionCount: 0,
    startsAt: daysAgo(randInt(5, 80)),
    externalCouponIds: json({ [activeProvider]: `demo-coupon-${String(index + 1).padStart(2, '0')}` }),
    externalPromotionCodeIds: json({ [activeProvider]: `demo-promo-${String(index + 1).padStart(2, '0')}` }),
  }));

  const couponPlanRows = coupons.flatMap((coupon, couponIndex) =>
    pickManyUnique(plans, couponIndex % 2 === 0 ? 2 : 3).map((plan) => ({
      id: id('coupon-plan', couponPlanRowsCounter.next()),
      couponId: coupon.id,
      planId: plan.id,
    })),
  );

  const couponRedemptions = pickManyUnique(demoUsers.filter((user) => user.role === 'USER'), 90).map((user, index) => ({
    id: id('coupon-redemption', index + 1),
    couponId: pickOne(coupons).id,
    userId: user.id,
    redeemedAt: randomPastDate(120),
    consumedAt: index % 4 === 0 ? randomPastDate(60) : null,
  }));

  console.log(`Creating ${coupons.length} coupons...`);
  await prisma.coupon.createMany({ data: coupons });
  await createManyInChunks((data) => prisma.couponPlan.createMany({ data }), couponPlanRows);
  await createManyInChunks((data) => prisma.couponRedemption.createMany({ data }), couponRedemptions);
  counts.coupons = coupons.length;
  counts.couponRedemptions = couponRedemptions.length;

  const featureUsageRows = demoUsers.flatMap((user, index) => {
    const features = ['AI_REQUESTS', 'IMAGE_EXPORTS', 'TEAM_INVITES', 'API_CALLS'];
    return features.map((feature, featureIndex) => ({
      id: id('usage', index * features.length + featureIndex + 1),
      userId: user.id,
      feature,
      count: randInt(1, 40),
      periodStart: randomPastDate(90),
      periodEnd: addDays(new Date(), randInt(1, 30)),
      createdAt: randomPastDate(90),
    }));
  });
  await createManyInChunks((data) => prisma.featureUsageLog.createMany({ data }), featureUsageRows);

  const subscriptions: Array<{
    id: string;
    userId: string;
    planId: string;
    organizationId: string | null;
    status: string;
    startedAt: Date;
    expiresAt: Date;
    isLifetime: boolean;
    lastPaymentAmountCents: number;
    canceledAt: Date | null;
    paymentProvider: string;
    externalSubscriptionId: string;
    externalSubscriptionIds: string;
    clearPaidTokensOnExpiry: boolean;
    cancelAtPeriodEnd: boolean;
    createdAt: Date;
  }> = [];

  const payments: Array<{
    id: string;
    userId: string;
    subscriptionId: string | null;
    planId: string | null;
    organizationId: string | null;
    amountCents: number;
    subtotalCents: number;
    discountCents: number;
    couponCode: string | null;
    currency: string;
    paymentProvider: string;
    externalPaymentId: string;
    externalSessionId: string;
    externalRefundId: string | null;
    externalPaymentIds: string;
    externalSessionIds: string;
    externalRefundIds: string | null;
    status: string;
    createdAt: Date;
  }> = [];

  let paymentSequence = 1;
  let subscriptionSequence = 1;
  const usersWithSubscriptions = pickManyUnique(demoUsers.filter((user) => user.role === 'USER'), 165);
  usersWithSubscriptions.forEach((user, index) => {
    const plan = pickOne(effectiveSubscriptionPlans);
    const startedAt = randomPastDate(360);
    const status = index % 9 === 0 ? 'PAST_DUE' : index % 11 === 0 ? 'CANCELLED' : index % 7 === 0 ? 'PENDING' : 'ACTIVE';
    const expiresAt = status === 'CANCELLED' ? randomPastDate(40) : addDays(new Date(), randInt(10, 90));
    const canceledAt = status === 'CANCELLED' ? randomPastDate(30) : null;
    const subscriptionId = id('subscription', subscriptionSequence += 1);
    subscriptions.push({
      id: subscriptionId,
      userId: user.id,
      planId: plan.id,
      organizationId: null,
      status,
      startedAt,
      expiresAt,
      isLifetime: false,
      lastPaymentAmountCents: plan.priceCents,
      canceledAt,
      paymentProvider: activeProvider,
      externalSubscriptionId: `demo-sub-${String(subscriptionSequence).padStart(5, '0')}`,
      externalSubscriptionIds: json({ [activeProvider]: `demo-sub-${String(subscriptionSequence).padStart(5, '0')}` }),
      clearPaidTokensOnExpiry: false,
      cancelAtPeriodEnd: index % 13 === 0,
      createdAt: startedAt,
    });

    const invoiceCount = randInt(1, 4);
    for (let invoiceIndex = 0; invoiceIndex < invoiceCount; invoiceIndex += 1) {
      const coupon = invoiceIndex === 0 && index % 5 === 0 ? pickOne(coupons) : null;
      const discountCents = coupon?.percentOff ? Math.round((plan.priceCents * coupon.percentOff) / 100) : coupon?.amountOffCents ?? 0;
      const subtotalCents = plan.priceCents;
      const amountCents = Math.max(0, subtotalCents - discountCents);
      const paymentStatus = status === 'PAST_DUE' && invoiceIndex === invoiceCount - 1 ? 'FAILED' : status === 'PENDING' && invoiceIndex === invoiceCount - 1 ? 'PENDING' : 'SUCCEEDED';
      const createdAt = addDays(startedAt, invoiceIndex * 30 + randInt(0, 5));
      const paymentId = id('payment', paymentSequence += 1);
      const externalPaymentId = `demo-pay-${String(paymentSequence).padStart(6, '0')}`;
      payments.push({
        id: paymentId,
        userId: user.id,
        subscriptionId,
        planId: plan.id,
        organizationId: null,
        amountCents,
        subtotalCents,
        discountCents,
        couponCode: coupon?.code ?? null,
        currency: 'usd',
        paymentProvider: activeProvider,
        externalPaymentId,
        externalSessionId: `demo-session-${String(paymentSequence).padStart(6, '0')}`,
        externalRefundId: null,
        externalPaymentIds: json({ [activeProvider]: externalPaymentId }),
        externalSessionIds: json({ [activeProvider]: `demo-session-${String(paymentSequence).padStart(6, '0')}` }),
        externalRefundIds: null,
        status: paymentStatus,
        createdAt,
      });
    }
  });

  organizations.slice(0, Math.min(organizations.length, 32)).forEach((organization) => {
    const plan = pickOne(effectiveOrgPlans);
    const startedAt = randomPastDate(240);
    const subscriptionId = id('subscription', subscriptionSequence += 1);
    subscriptions.push({
      id: subscriptionId,
      userId: organization.ownerUserId,
      planId: plan.id,
      organizationId: organization.id,
      status: 'ACTIVE',
      startedAt,
      expiresAt: addDays(new Date(), randInt(15, 120)),
      isLifetime: false,
      lastPaymentAmountCents: plan.priceCents,
      canceledAt: null,
      paymentProvider: activeProvider,
      externalSubscriptionId: `demo-sub-${String(subscriptionSequence).padStart(5, '0')}`,
      externalSubscriptionIds: json({ [activeProvider]: `demo-sub-${String(subscriptionSequence).padStart(5, '0')}` }),
      clearPaidTokensOnExpiry: false,
      cancelAtPeriodEnd: false,
      createdAt: startedAt,
    });
    for (let invoiceIndex = 0; invoiceIndex < 3; invoiceIndex += 1) {
      const paymentId = id('payment', paymentSequence += 1);
      const externalPaymentId = `demo-pay-${String(paymentSequence).padStart(6, '0')}`;
      payments.push({
        id: paymentId,
        userId: organization.ownerUserId,
        subscriptionId,
        planId: plan.id,
        organizationId: organization.id,
        amountCents: plan.priceCents,
        subtotalCents: plan.priceCents,
        discountCents: 0,
        couponCode: null,
        currency: 'usd',
        paymentProvider: activeProvider,
        externalPaymentId,
        externalSessionId: `demo-session-${String(paymentSequence).padStart(6, '0')}`,
        externalRefundId: null,
        externalPaymentIds: json({ [activeProvider]: externalPaymentId }),
        externalSessionIds: json({ [activeProvider]: `demo-session-${String(paymentSequence).padStart(6, '0')}` }),
        externalRefundIds: null,
        status: 'SUCCEEDED',
        createdAt: addDays(startedAt, invoiceIndex * 30),
      });
    }
  });

  const oneTimeSalesUsers = pickManyUnique(demoUsers, 240);
  oneTimeSalesUsers.forEach((user, index) => {
    const plan = pickOne(effectiveOneTimePlans);
    const coupon = index % 6 === 0 ? pickOne(coupons) : null;
    const subtotalCents = plan.priceCents;
    const discountCents = coupon?.percentOff ? Math.round((subtotalCents * coupon.percentOff) / 100) : coupon?.amountOffCents ?? 0;
    const amountCents = Math.max(0, subtotalCents - discountCents);
    const status = index % 16 === 0 ? 'REFUNDED' : index % 10 === 0 ? 'PENDING' : 'SUCCEEDED';
    const paymentId = id('payment', paymentSequence += 1);
    const externalPaymentId = `demo-pay-${String(paymentSequence).padStart(6, '0')}`;
    const refundId = status === 'REFUNDED' ? `demo-refund-${String(paymentSequence).padStart(6, '0')}` : null;
    payments.push({
      id: paymentId,
      userId: user.id,
      subscriptionId: null,
      planId: plan.id,
      organizationId: null,
      amountCents,
      subtotalCents,
      discountCents,
      couponCode: coupon?.code ?? null,
      currency: 'usd',
      paymentProvider: activeProvider,
      externalPaymentId,
      externalSessionId: `demo-session-${String(paymentSequence).padStart(6, '0')}`,
      externalRefundId: refundId,
      externalPaymentIds: json({ [activeProvider]: externalPaymentId }),
      externalSessionIds: json({ [activeProvider]: `demo-session-${String(paymentSequence).padStart(6, '0')}` }),
      externalRefundIds: refundId ? json({ [activeProvider]: refundId }) : null,
      status,
      createdAt: randomPastDate(180),
    });
  });

  console.log(`Creating ${subscriptions.length} subscriptions and ${payments.length} payments...`);
  await createManyInChunks((data) => prisma.subscription.createMany({ data }), subscriptions);
  await createManyInChunks((data) => prisma.payment.createMany({ data }), payments);
  counts.subscriptions = subscriptions.length;
  counts.payments = payments.length;

  const paymentCountByUser = new Map<string, number>();
  payments.forEach((payment) => {
    if (payment.status !== 'FAILED') {
      paymentCountByUser.set(payment.userId, (paymentCountByUser.get(payment.userId) || 0) + 1);
    }
  });
  for (const user of demoUsers) {
    await prisma.user.update({
      where: { id: user.id },
      data: { paymentsCount: paymentCountByUser.get(user.id) || 0 },
    });
  }

  const supportTickets = Array.from({ length: config.supportTicketCount }, (_, index) => {
    const user = pickOne(demoUsers.filter((item) => item.role === 'USER'));
    return {
      id: id('ticket', index + 1),
      userId: user.id,
      subject: `[Demo] ${pickOne(['Billing question', 'Team invite issue', 'Feature request', 'Usage limit confusion', 'Refund follow-up'])}`,
      message: loremParagraph(2, 4),
      category: pickOne(['GENERAL', 'BILLING', 'TECHNICAL', 'FEATURE_REQUEST']),
      status: pickOne(['OPEN', 'OPEN', 'IN_PROGRESS', 'CLOSED']),
      createdByRole: 'USER',
      createdAt: randomPastDate(120),
    };
  });
  const ticketReplies = supportTickets.flatMap((ticket, index) => {
    const rows = [
      {
        id: id('reply', index * 2 + 1),
        ticketId: ticket.id,
        userId: index % 2 === 0 ? demoUsers[0].id : ticket.userId,
        message: loremParagraph(1, 2),
        createdAt: addDays(ticket.createdAt, 1),
      },
    ];
    if (index % 3 === 0) {
      rows.push({
        id: id('reply', index * 2 + 2),
        ticketId: ticket.id,
        userId: ticket.userId,
        message: loremParagraph(1, 2),
        createdAt: addDays(ticket.createdAt, 2),
      });
    }
    return rows;
  });
  await createManyInChunks((data) => prisma.supportTicket.createMany({ data }), supportTickets);
  await createManyInChunks((data) => prisma.ticketReply.createMany({ data }), ticketReplies);
  counts.tickets = supportTickets.length;
  counts.replies = ticketReplies.length;

  const notifications = Array.from({ length: config.notificationCount }, (_, index) => {
    const user = pickOne(demoUsers);
    return {
      id: id('notification', index + 1),
      userId: user.id,
      title: `[Demo] ${pickOne(['Subscription renewed', 'Team member joined', 'Invoice ready', 'New comment received', 'Usage threshold reached'])}`,
      message: loremSentence(10, 18),
      type: pickOne(['GENERAL', 'BILLING', 'TEAM', 'SYSTEM']),
      url: pickOne(['/dashboard', '/dashboard/billing', '/dashboard/team', '/admin/system']),
      read: index % 3 === 0,
      createdAt: randomPastDate(90),
    };
  });
  await createManyInChunks((data) => prisma.notification.createMany({ data }), notifications);
  counts.notifications = notifications.length;

  const emailLogs = Array.from({ length: config.emailLogCount }, (_, index) => {
    const user = pickOne(demoUsers);
    return {
      id: id('email-log', index + 1),
      userId: user.id,
      to: user.email,
      subject: `[Demo] ${pickOne(['Welcome to your workspace', 'Invoice available', 'Support reply received', 'Usage report', 'Billing confirmation'])}`,
      template: pickOne(['welcome', 'invoice', 'support_reply', 'usage_summary', 'billing_confirmation']),
      status: pickOne(['SENT', 'SENT', 'SENT', 'FAILED']),
      error: index % 11 === 0 ? 'Mailbox provider timeout (demo)' : null,
      createdAt: randomPastDate(90),
    };
  });
  await createManyInChunks((data) => prisma.emailLog.createMany({ data }), emailLogs);
  counts.emailLogs = emailLogs.length;

  const visits = Array.from({ length: config.visitCount }, (_, index) => {
    const maybeUser = index % 5 === 0 ? null : pickOne(demoUsers);
    return {
      id: id('visit', index + 1),
      sessionId: `demo-session-${String(index + 1).padStart(6, '0')}`,
      userId: maybeUser?.id ?? null,
      ipAddress: `192.168.${randInt(0, 9)}.${randInt(10, 240)}`,
      userAgent: pickOne(['Mozilla/5.0 Demo Chrome', 'Mozilla/5.0 Demo Safari', 'Mozilla/5.0 Demo Firefox']),
      country: pickOne(['US', 'GB', 'NG', 'DE', 'IN', 'CA']),
      city: pickOne(['Lagos', 'Berlin', 'Toronto', 'London', 'Austin', 'Bengaluru']),
      referrer: pickOne(['https://google.com', 'https://x.com', 'https://github.com', 'https://saasybase.com']),
      path: pickOne(['/demo', '/demo/pricing', '/demo/blog', '/dashboard', '/admin', '/checkout']),
      createdAt: randomPastDate(45),
    };
  });
  await createManyInChunks((data) => prisma.visitLog.createMany({ data }), visits, 400);
  counts.visits = visits.length;

  const systemLogs = Array.from({ length: config.systemLogCount }, (_, index) => ({
    id: id('system-log', index + 1),
    level: pickOne(['INFO', 'INFO', 'WARN', 'ERROR']),
    message: `[Demo] ${pickOne(['Payment lifecycle sync finished', 'Analytics snapshot refreshed', 'Background cleanup completed', 'Webhook replay ignored', 'Email delivery retried'])}`,
    meta: json({ requestId: `demo-req-${index + 1}`, subsystem: pickOne(['payments', 'analytics', 'notifications', 'billing', 'auth']) }),
    context: DEMO_CONTEXT,
    createdAt: randomPastDate(30),
  }));
  await createManyInChunks((data) => prisma.systemLog.createMany({ data }), systemLogs, 400);
  counts.systemLogs = systemLogs.length;

  const adminActorIds = demoUsers.filter((user) => user.role !== 'USER').map((user) => user.id);
  const adminActions = Array.from({ length: config.adminActionCount }, (_, index) => ({
    id: id('admin-action', index + 1),
    actorId: pickOne(adminActorIds),
    actorRole: pickOne(['ADMIN', 'MODERATOR']),
    action: pickOne(['demo.user.impersonate', 'demo.payment.review', 'demo.ticket.assign', 'demo.subscription.adjust', 'demo.org.audit']),
    targetUserId: pickOne(demoUsers).id,
    targetType: pickOne(['USER', 'PAYMENT', 'SUBSCRIPTION', 'ORGANIZATION', 'TICKET']),
    details: json({ note: loremSentence(8, 14) }),
    createdAt: randomPastDate(120),
  }));
  await createManyInChunks((data) => prisma.adminActionLog.createMany({ data }), adminActions);
  counts.adminActions = adminActions.length;

  const rateLimitBuckets = Array.from({ length: 80 }, (_, index) => {
    const windowStart = randomPastDate(7);
    const windowEnd = addDays(windowStart, 1);
    return {
      id: id('rate-limit', index + 1),
      key: `demo:${pickOne(['api', 'auth', 'webhook'])}:${index + 1}`,
      actorId: index % 2 === 0 ? pickOne(demoUsers).id : null,
      route: pickOne(['/api/checkout/confirm', '/api/notifications', '/api/webhooks/payments']),
      method: pickOne(['GET', 'POST']),
      ip: `10.0.${randInt(0, 6)}.${randInt(10, 240)}`,
      userAgent: 'Demo Seeder',
      windowStart,
      windowEnd,
      hits: randInt(1, 60),
      firstRequestAt: windowStart,
      lastRequestAt: addDays(windowStart, 0),
      createdAt: windowStart,
    };
  });
  await createManyInChunks((data) => prisma.rateLimitBucket.createMany({ data }), rateLimitBuckets);

  const blogCategories = ['Growth', 'Product', 'Engineering', 'Billing', 'Operations'].map((title, index) => ({
    id: id('blog-category', index + 1),
    slug: `demo-${slugify(title)}`,
    title,
    description: `[Demo] ${title} articles for the seeded landing and docs views.`,
  }));
  const blogPosts = Array.from({ length: config.blogPostCount }, (_, index) => {
    const title = `${pickOne(['Scaling', 'Designing', 'Improving', 'Shipping', 'Operating'])} ${pickOne(['billing flows', 'team workspaces', 'support queues', 'product analytics', 'admin tooling'])}`;
    return {
      id: id('blog-post', index + 1),
      collection: 'blog',
      slug: `demo-lorem-${String(index + 1).padStart(2, '0')}-${slugify(title)}`,
      title,
      description: loremSentence(12, 20),
      content: blogHtml(title),
      published: true,
      system: false,
      publishedAt: randomPastDate(180),
      metaTitle: `${title} | Demo`,
      metaDescription: loremSentence(10, 18),
      canonicalUrl: null,
      noIndex: false,
      ogTitle: `${title} | Demo`,
      ogDescription: loremSentence(10, 18),
      ogImage: null,
    };
  });
  const blogPostCategories = blogPosts.flatMap((post, index) =>
    pickManyUnique(blogCategories, index % 2 === 0 ? 2 : 1).map((category) => ({
      id: id('blog-post-category', blogPostCategoryCounter.next()),
      postId: post.id,
      categoryId: category.id,
      assignedAt: post.publishedAt ?? new Date(),
    })),
  );
  await prisma.blogCategory.createMany({ data: blogCategories });
  await createManyInChunks((data) => prisma.sitePage.createMany({ data }), blogPosts);
  await createManyInChunks((data) => prisma.blogPostCategory.createMany({ data }), blogPostCategories);
  counts.blogPosts = blogPosts.length;

  console.log('\nDemo seed complete.');
  console.log(`Users: ${counts.users}`);
  console.log(`Organizations: ${counts.organizations}`);
  console.log(`Memberships: ${counts.memberships}`);
  console.log(`Subscriptions: ${counts.subscriptions}`);
  console.log(`Payments: ${counts.payments}`);
  console.log(`Coupons: ${counts.coupons}`);
  console.log(`Coupon redemptions: ${counts.couponRedemptions}`);
  console.log(`Support tickets: ${counts.tickets}`);
  console.log(`Ticket replies: ${counts.replies}`);
  console.log(`Notifications: ${counts.notifications}`);
  console.log(`Email logs: ${counts.emailLogs}`);
  console.log(`Visit logs: ${counts.visits}`);
  console.log(`System logs: ${counts.systemLogs}`);
  console.log(`Blog posts: ${counts.blogPosts}`);
  console.log(`Admin actions: ${counts.adminActions}`);
  console.log('\nDemo credentials:');
  console.log(`- Admin: demo-admin@${DEMO_DOMAIN} / ${DEMO_PASSWORD}`);
  console.log(`- Moderator: demo-moderator@${DEMO_DOMAIN} / ${DEMO_PASSWORD}`);
  console.log(`- User: demo-user@${DEMO_DOMAIN} / ${DEMO_PASSWORD}`);
}

const couponPlanRowsCounter = (() => {
  let current = 1;
  return {
    next() {
      const value = current;
      current += 1;
      return value;
    },
  };
})();

const blogPostCategoryCounter = (() => {
  let current = 1;
  return {
    next() {
      const value = current;
      current += 1;
      return value;
    },
  };
})();

main()
  .catch((error) => {
    console.error('Demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });