import { randomBytes, createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';

const EMAIL_VERIFY_PREFIX = 'email-verify:';
const EMAIL_CHANGE_PREFIX = 'email-change:';

export type PendingEmailChange = {
  newEmail: string;
  expires: Date;
};

function formatExpiryTime(expires: Date) {
  return expires.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getPrettyMagicLinkUrl(rawUrl: string) {
  try {
    const source = new URL(rawUrl);
    const pretty = new URL('/auth/magic-link', source.origin);

    for (const key of ['token', 'email', 'callbackUrl']) {
      const value = source.searchParams.get(key);
      if (value) {
        pretty.searchParams.set(key, value);
      }
    }

    return pretty.toString();
  } catch {
    return rawUrl;
  }
}

async function sendAuthEmailOrThrow(
  options: Parameters<typeof sendEmail>[0],
  failureMessage: string,
) {
  const result = await sendEmail(options);
  if (!result.success) {
    throw new Error(result.error || failureMessage);
  }
}

export function getEmailVerificationIdentifier(email: string) {
  return `${EMAIL_VERIFY_PREFIX}${email.toLowerCase().trim()}`;
}

export function getEmailChangeIdentifier(userId: string, newEmail: string) {
  return `${EMAIL_CHANGE_PREFIX}${userId}:${newEmail.toLowerCase().trim()}`;
}

export function resolveNextAuthRuntimeBaseUrl(runtimeOrigin?: string) {
  return runtimeOrigin
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.NEXTAUTH_URL
    || process.env.AUTH_URL
    || 'http://localhost:3000';
}

export async function getPendingEmailChangeForUser(userId: string): Promise<PendingEmailChange | null> {
  const record = await prisma.verificationToken.findFirst({
    where: {
      identifier: {
        startsWith: `${EMAIL_CHANGE_PREFIX}${userId}:`,
      },
      expires: {
        gt: new Date(),
      },
    },
    orderBy: {
      expires: 'desc',
    },
  });

  if (!record) {
    return null;
  }

  const parsed = parseVerificationIdentifier(record.identifier);
  if (!parsed || parsed.kind !== 'email-change') {
    return null;
  }

  return {
    newEmail: parsed.newEmail,
    expires: record.expires,
  };
}

export async function cancelPendingEmailChange(userId: string) {
  return prisma.verificationToken.deleteMany({
    where: {
      identifier: {
        startsWith: `${EMAIL_CHANGE_PREFIX}${userId}:`,
      },
    },
  });
}

export function parseVerificationIdentifier(identifier: string):
  | { kind: 'email-verify'; email: string }
  | { kind: 'email-change'; userId: string; newEmail: string }
  | null {
  if (identifier.startsWith(EMAIL_VERIFY_PREFIX)) {
    return {
      kind: 'email-verify',
      email: identifier.slice(EMAIL_VERIFY_PREFIX.length),
    };
  }

  if (identifier.startsWith(EMAIL_CHANGE_PREFIX)) {
    const payload = identifier.slice(EMAIL_CHANGE_PREFIX.length);
    const separatorIndex = payload.indexOf(':');
    if (separatorIndex === -1) {
      return null;
    }

    const userId = payload.slice(0, separatorIndex);
    const newEmail = payload.slice(separatorIndex + 1);
    if (!userId || !newEmail) {
      return null;
    }

    return { kind: 'email-change', userId, newEmail };
  }

  return null;
}

export async function sendNextAuthVerificationEmail(params: {
  userId: string;
  email: string;
  name?: string | null;
  baseUrl?: string;
}) {
  const normalizedEmail = params.email.toLowerCase().trim();
  const rawToken = randomBytes(32).toString('hex');
  const hashedToken = createHash('sha256').update(rawToken).digest('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const identifier = getEmailVerificationIdentifier(normalizedEmail);

  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hashedToken,
      expires,
    },
  });

  const baseUrl = resolveNextAuthRuntimeBaseUrl(params.baseUrl);
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;
  const firstName = params.name?.split(' ')[0] || 'there';

  await sendAuthEmailOrThrow({
    to: normalizedEmail,
    userId: params.userId,
    subject: 'Verify your email address',
    text: `Hi ${firstName},\n\nPlease verify your email address by opening the link below:\n\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nIf you did not create this account, you can ignore this email.`,
    html: `<p>Hi ${firstName},</p><p>Please verify your email address by clicking the link below:</p><p><a href="${verifyUrl}">Verify your email</a></p><p>This link expires in 24 hours.</p><p>If you did not create this account, you can ignore this email.</p>`,
    templateKey: 'email_verification',
    variables: {
      firstName,
      userEmail: normalizedEmail,
      actionUrl: verifyUrl,
    },
  }, 'Failed to send verification email');
}

export async function sendNextAuthEmailChangeVerification(params: {
  userId: string;
  currentEmail: string;
  newEmail: string;
  name?: string | null;
  baseUrl?: string;
}) {
  const normalizedNewEmail = params.newEmail.toLowerCase().trim();
  const identifier = getEmailChangeIdentifier(params.userId, normalizedNewEmail);
  const rawToken = randomBytes(32).toString('hex');
  const hashedToken = createHash('sha256').update(rawToken).digest('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.verificationToken.deleteMany({
    where: {
      identifier: {
        startsWith: `${EMAIL_CHANGE_PREFIX}${params.userId}:`,
      },
    },
  });

  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hashedToken,
      expires,
    },
  });

  const baseUrl = resolveNextAuthRuntimeBaseUrl(params.baseUrl);
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${rawToken}&email=${encodeURIComponent(normalizedNewEmail)}`;
  const firstName = params.name?.split(' ')[0] || 'there';

  await sendAuthEmailOrThrow({
    to: normalizedNewEmail,
    userId: params.userId,
    subject: 'Confirm your new email address',
    text: `Hi ${firstName},\n\nPlease confirm your new email address by opening the link below:\n\n${verifyUrl}\n\nYour current email address will remain active until this is confirmed. This link expires in 24 hours.\n\nIf you did not request this change, you can ignore this email.`,
    html: `<p>Hi ${firstName},</p><p>Please confirm your new email address by clicking the link below:</p><p><a href="${verifyUrl}">Confirm new email address</a></p><p>Your current email address will remain active until this is confirmed.</p><p>This link expires in 24 hours.</p><p>If you did not request this change, you can ignore this email.</p>`,
    templateKey: 'email_change_confirmation',
    variables: {
      firstName,
      userEmail: normalizedNewEmail,
      actionUrl: verifyUrl,
      currentEmail: params.currentEmail.toLowerCase().trim(),
    },
  }, 'Failed to send email change verification');
}

export async function sendNextAuthMagicLinkEmail(params: {
  userId: string;
  email: string;
  name?: string | null;
  url: string;
  expires: Date;
}) {
  const normalizedEmail = params.email.toLowerCase().trim();
  const firstName = params.name?.split(' ')[0] || 'there';
  const expiresAt = formatExpiryTime(params.expires);
  const magicLinkUrl = getPrettyMagicLinkUrl(params.url);

  await sendAuthEmailOrThrow({
    to: normalizedEmail,
    userId: params.userId,
    subject: 'Your sign-in link',
    text: `Hi ${firstName},\n\nUse the secure link below to sign in:\n\n${magicLinkUrl}\n\nThis link expires on ${expiresAt}. If you did not request this email, you can ignore it.`,
    html: `<p>Hi ${firstName},</p><p>Use the secure link below to sign in:</p><p><a href="${magicLinkUrl}">Sign in securely</a></p><p>This link expires on ${expiresAt}.</p><p>If you did not request this email, you can ignore it.</p>`,
    templateKey: 'magic_link',
    variables: {
      firstName,
      userEmail: normalizedEmail,
      actionUrl: magicLinkUrl,
    },
  }, 'Failed to send magic link email');
}