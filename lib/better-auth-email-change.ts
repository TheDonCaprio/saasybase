import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

const BETTER_AUTH_EMAIL_CHANGE_PREFIX = 'betterauth-email-change:';
const DEFAULT_BETTER_AUTH_EMAIL_CHANGE_EXPIRES_IN_SECONDS = 60 * 60;

export type BetterAuthPendingEmailChange = {
  newEmail: string;
  expires: Date;
};

type BetterAuthEmailChangePayload = {
  userId: string;
  currentEmail: string;
  newEmail: string;
};

export type BetterAuthEmailChangeToken = {
  currentEmail: string;
  newEmail: string;
  requestType: string;
  userId: string;
};

function normalizeEmail(value: string) {
  return value.toLowerCase().trim();
}

function getIdentifierPrefix(userId: string) {
  return `${BETTER_AUTH_EMAIL_CHANGE_PREFIX}${userId}:`;
}

function getIdentifier(userId: string, newEmail: string) {
  return `${getIdentifierPrefix(userId)}${normalizeEmail(newEmail)}`;
}

function getExpiryDate() {
  return new Date(Date.now() + DEFAULT_BETTER_AUTH_EMAIL_CHANGE_EXPIRES_IN_SECONDS * 1000);
}

function parsePayload(value: string): BetterAuthEmailChangePayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<BetterAuthEmailChangePayload>;
    if (
      typeof parsed.userId === 'string'
      && typeof parsed.currentEmail === 'string'
      && typeof parsed.newEmail === 'string'
    ) {
      return {
        userId: parsed.userId,
        currentEmail: normalizeEmail(parsed.currentEmail),
        newEmail: normalizeEmail(parsed.newEmail),
      };
    }
  } catch {
    return null;
  }

  return null;
}

export async function recordBetterAuthPendingEmailChange(params: {
  userId: string;
  currentEmail: string;
  newEmail: string;
}) {
  const userId = params.userId;
  const newEmail = normalizeEmail(params.newEmail);
  const currentEmail = normalizeEmail(params.currentEmail);

  await prisma.verification.deleteMany({
    where: {
      identifier: {
        startsWith: getIdentifierPrefix(userId),
      },
    },
  });

  await prisma.verification.create({
    data: {
      identifier: getIdentifier(userId, newEmail),
      value: JSON.stringify({ userId, currentEmail, newEmail }),
      expiresAt: getExpiryDate(),
    },
  });
}

export async function getBetterAuthPendingEmailChangeForUser(userId: string): Promise<BetterAuthPendingEmailChange | null> {
  const record = await prisma.verification.findFirst({
    where: {
      identifier: {
        startsWith: getIdentifierPrefix(userId),
      },
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      expiresAt: 'desc',
    },
  });

  if (!record) {
    return null;
  }

  const payload = parsePayload(record.value);
  if (!payload) {
    return null;
  }

  return {
    newEmail: payload.newEmail,
    expires: record.expiresAt,
  };
}

export async function cancelBetterAuthPendingEmailChange(userId: string) {
  return prisma.verification.deleteMany({
    where: {
      identifier: {
        startsWith: getIdentifierPrefix(userId),
      },
    },
  });
}

export async function hasBetterAuthPendingEmailChange(userId: string, newEmail: string) {
  const record = await prisma.verification.findFirst({
    where: {
      identifier: getIdentifier(userId, newEmail),
      expiresAt: {
        gt: new Date(),
      },
    },
    select: { identifier: true },
  });

  return Boolean(record);
}

export async function clearBetterAuthPendingEmailChange(userId: string, newEmail: string) {
  return prisma.verification.deleteMany({
    where: {
      identifier: getIdentifier(userId, newEmail),
    },
  });
}

export async function parseBetterAuthEmailChangeToken(token: string, secret: string): Promise<BetterAuthEmailChangeToken | null> {
  try {
    const jwt = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
    const payload = jwt.payload as {
      email?: unknown;
      updateTo?: unknown;
      requestType?: unknown;
    };

    if (
      typeof payload.email !== 'string'
      || typeof payload.updateTo !== 'string'
      || typeof payload.requestType !== 'string'
      || !payload.requestType.startsWith('change-email-')
    ) {
      return null;
    }

    const currentEmail = normalizeEmail(payload.email);
    const newEmail = normalizeEmail(payload.updateTo);
    const user = await prisma.user.findUnique({
      where: { email: currentEmail },
      select: { id: true },
    });

    if (!user?.id) {
      return null;
    }

    return {
      currentEmail,
      newEmail,
      requestType: payload.requestType,
      userId: user.id,
    };
  } catch {
    return null;
  }
}