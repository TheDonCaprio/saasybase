import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { nextCookies, toNextJsHandler } from 'better-auth/next-js';
import { magicLink, organization } from 'better-auth/plugins';
import { BETTER_AUTH_BASE_PATH } from '@/lib/better-auth-shared';
import { sendEmail } from '@/lib/email';
import { Logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { sendWelcomeIfNotSent } from '@/lib/welcome';

function getConfiguredBaseUrl() {
  const candidate =
    process.env.BETTER_AUTH_URL
    || process.env.NEXT_PUBLIC_BETTER_AUTH_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.NEXTAUTH_URL
    || undefined;

  if (!candidate) {
    return undefined;
  }

  try {
    return new URL(candidate).toString().replace(/\/$/, '');
  } catch {
    Logger.warn('Ignoring invalid Better Auth base URL candidate', { candidate });
    return undefined;
  }
}

function getTrustedOrigins() {
  const rawOrigins = [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.AUTH_URL,
  ];

  return Array.from(
    new Set(
      rawOrigins
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map((value) => {
          try {
            return new URL(value).origin;
          } catch {
            return null;
          }
        })
        .filter((value): value is string => Boolean(value))
    )
  );
}

function getUserFirstName(user: { name?: string | null; email?: string | null }) {
  const trimmedName = user.name?.trim();
  if (trimmedName) {
    return trimmedName.split(/\s+/)[0] || 'there';
  }

  const emailLocalPart = user.email?.split('@')[0]?.trim();
  return emailLocalPart || 'there';
}

async function sendTemplatedAuthEmail(params: {
  to: string;
  userId?: string;
  templateKey: string;
  subject: string;
  actionUrl: string;
  name?: string | null;
  currentEmail?: string;
}) {
  const firstName = getUserFirstName({ name: params.name, email: params.to });

  const result = await sendEmail({
    to: params.to,
    ...(params.userId ? { userId: params.userId } : {}),
    subject: params.subject,
    templateKey: params.templateKey,
    variables: {
      firstName,
      userEmail: params.to,
      actionUrl: params.actionUrl,
      ...(params.currentEmail ? { currentEmail: params.currentEmail } : {}),
    },
  });

  if (!result.success) {
    throw new Error(result.error || `Failed to send ${params.templateKey} email`);
  }
}

function buildSocialProviders(): BetterAuthOptions['socialProviders'] {
  const providers: NonNullable<BetterAuthOptions['socialProviders']> = {};

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.github = async () => ({
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    });
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.google = async () => ({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    });
  }

  return Object.keys(providers).length > 0 ? providers : undefined;
}

function normalizeLegacySessionFields(session: Record<string, unknown>) {
  return {
    ...(typeof session.token === 'string' ? { sessionToken: session.token } : {}),
    ...(session.expiresAt instanceof Date ? { expires: session.expiresAt } : {}),
  };
}

function normalizeLegacyAccountFields(account: Record<string, unknown>) {
  return {
    ...(typeof account.providerId === 'string' ? { provider: account.providerId } : {}),
    ...(typeof account.accountId === 'string' ? { providerAccountId: account.accountId } : {}),
    ...(typeof account.providerId === 'string'
      ? {
          type: account.providerId === 'credential' ? 'credentials' : 'oauth',
        }
      : {}),
  };
}

const basePrismaBetterAuthAdapterFactory = prismaAdapter(prisma, {
  provider: 'sqlite',
});

export const betterAuthConfig = {
  baseURL: getConfiguredBaseUrl(),
  basePath: BETTER_AUTH_BASE_PATH,
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustedOrigins: getTrustedOrigins(),
  database: basePrismaBetterAuthAdapterFactory,
  user: {
    modelName: 'user',
    fields: {
      email: 'email',
      name: 'name',
      image: 'imageUrl',
      emailVerified: 'emailVerifiedBool',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'USER',
      },
      suspendedAt: {
        type: 'date',
        required: false,
      },
      suspensionReason: {
        type: 'string',
        required: false,
      },
      suspensionIsPermanent: {
        type: 'boolean',
        required: false,
        defaultValue: false,
      },
      tokenVersion: {
        type: 'number',
        required: false,
        defaultValue: 0,
      },
      paymentsCount: {
        type: 'number',
        required: false,
        defaultValue: 0,
      },
      externalCustomerIds: {
        type: 'string',
        required: false,
      },
      tokenBalance: {
        type: 'number',
        required: false,
        defaultValue: 0,
      },
      freeTokenBalance: {
        type: 'number',
        required: false,
        defaultValue: 0,
      },
      freeTokensLastResetAt: {
        type: 'date',
        required: false,
      },
      tokensLastResetAt: {
        type: 'date',
        required: false,
      },
      paymentProvider: {
        type: 'string',
        required: false,
      },
      externalCustomerId: {
        type: 'string',
        required: false,
        unique: true,
      },
    },
    changeEmail: {
      enabled: true,
    },
  },
  account: {
    modelName: 'account',
    fields: {
      userId: 'userId',
      accountId: 'providerAccountId',
      providerId: 'provider',
      accessToken: 'accessToken',
      refreshToken: 'refreshToken',
      accessTokenExpiresAt: 'accessTokenExpiresAt',
      refreshTokenExpiresAt: 'refreshTokenExpiresAt',
      idToken: 'idToken',
      scope: 'scope',
      password: 'password',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    additionalFields: {
      type: {
        type: 'string',
        required: false,
      },
    },
  },
  session: {
    modelName: 'session',
    fields: {
      userId: 'userId',
      token: 'sessionToken',
      expiresAt: 'expires',
      ipAddress: 'ipAddress',
      userAgent: 'userAgent',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    additionalFields: {
      lastActiveAt: {
        type: 'date',
        required: false,
      },
      country: {
        type: 'string',
        required: false,
      },
      city: {
        type: 'string',
        required: false,
      },
      activeOrganizationId: {
        type: 'string',
        required: false,
      },
      activeTeamId: {
        type: 'string',
        required: false,
      },
    },
  },
  verification: {
    modelName: 'verification',
    fields: {
      identifier: 'identifier',
      value: 'value',
      expiresAt: 'expiresAt',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendTemplatedAuthEmail({
        to: user.email,
        userId: user.id,
        templateKey: 'email_verification',
        subject: 'Verify your email address',
        actionUrl: url,
        name: user.name,
      });
    },
    afterEmailVerification: async (user) => {
      if (!user.email) {
        return;
      }

      await sendWelcomeIfNotSent(user.id, user.email).catch(() => {});
    },
    sendOnSignUp: true,
    sendOnSignIn: true,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: true,
    password: {
      hash: async (password) => bcrypt.hash(password, 12),
      verify: async ({ password, hash }) => bcrypt.compare(password, hash),
    },
    sendResetPassword: async ({ user, url }) => {
      await sendTemplatedAuthEmail({
        to: user.email,
        userId: user.id,
        templateKey: 'password_reset',
        subject: 'Reset your password',
        actionUrl: url,
        name: user.name,
      });
    },
  },
  socialProviders: buildSocialProviders(),
  plugins: [
    nextCookies(),
    magicLink({
      disableSignUp: true,
      sendMagicLink: async ({ email, url }) => {
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          select: { id: true, name: true },
        });

        await sendTemplatedAuthEmail({
          to: email,
          userId: user?.id,
          templateKey: 'magic_link',
          subject: 'Your sign-in link',
          actionUrl: url,
          name: user?.name,
        });
      },
    }),
    organization({
      allowUserToCreateOrganization: true,
      membershipLimit: (_user, activeOrganization) => {
        const seatLimit = (activeOrganization as { seatLimit?: number }).seatLimit;
        return typeof seatLimit === 'number' && seatLimit > 0 ? seatLimit : 100;
      },
      schema: {
        session: {
          fields: {
            activeOrganizationId: 'activeOrganizationId',
            activeTeamId: 'activeTeamId',
          },
        },
        organization: {
          modelName: 'organization',
          fields: {
            name: 'name',
            slug: 'slug',
            logo: 'logo',
            metadata: 'metadata',
            createdAt: 'createdAt',
          },
          additionalFields: {
            ownerUserId: {
              type: 'string',
              required: false,
            },
            planId: {
              type: 'string',
              required: false,
            },
            billingEmail: {
              type: 'string',
              required: false,
            },
            suspendedAt: {
              type: 'date',
              required: false,
            },
            suspensionReason: {
              type: 'string',
              required: false,
            },
            seatLimit: {
              type: 'number',
              required: false,
            },
            tokenPoolStrategy: {
              type: 'string',
              required: false,
              defaultValue: 'SHARED_FOR_ORG',
            },
            memberTokenCap: {
              type: 'number',
              required: false,
            },
            memberCapStrategy: {
              type: 'string',
              required: false,
              defaultValue: 'SOFT',
            },
            memberCapResetIntervalHours: {
              type: 'number',
              required: false,
            },
            ownerExemptFromCaps: {
              type: 'boolean',
              required: false,
              defaultValue: false,
            },
            tokenBalance: {
              type: 'number',
              required: false,
              defaultValue: 0,
            },
            updatedAt: {
              type: 'date',
              required: false,
            },
          },
        },
        member: {
          modelName: 'organizationMembership',
          fields: {
            organizationId: 'organizationId',
            userId: 'userId',
            role: 'role',
            createdAt: 'createdAt',
          },
          additionalFields: {
            status: {
              type: 'string',
              required: false,
              defaultValue: 'ACTIVE',
            },
            sharedTokenBalance: {
              type: 'number',
              required: false,
              defaultValue: 0,
            },
            memberTokenCapOverride: {
              type: 'number',
              required: false,
            },
            memberTokenUsageWindowStart: {
              type: 'date',
              required: false,
            },
            memberTokenUsage: {
              type: 'number',
              required: false,
              defaultValue: 0,
            },
            updatedAt: {
              type: 'date',
              required: false,
              defaultValue: () => new Date(),
              onUpdate: () => new Date(),
            },
          },
        },
        invitation: {
          modelName: 'organizationInvite',
          fields: {
            organizationId: 'organizationId',
            email: 'email',
            role: 'role',
            status: 'status',
            expiresAt: 'expiresAt',
            createdAt: 'createdAt',
            inviterId: 'invitedByUserId',
          },
          additionalFields: {
            token: {
              type: 'string',
              required: false,
              unique: true,
              defaultValue: () => randomBytes(32).toString('hex'),
            },
            acceptedAt: {
              type: 'date',
              required: false,
            },
            updatedAt: {
              type: 'date',
              required: false,
              defaultValue: () => new Date(),
              onUpdate: () => new Date(),
            },
          },
        },
      },
      organizationHooks: {
        beforeCreateOrganization: async ({ organization: newOrganization, user }) => {
          return {
            data: {
              ...newOrganization,
              ownerUserId: user.id,
            },
          };
        },
      },
    }),
  ],
  databaseHooks: {
    account: {
      create: {
        before: async (account) => ({
          data: {
            ...account,
            ...normalizeLegacyAccountFields(account),
          },
        }),
        after: async (account) => {
          if (account.providerId !== 'credential' || !account.password) {
            return;
          }

          await prisma.user.update({
            where: { id: account.userId },
            data: {
              password: account.password,
            },
          });
        },
      },
      update: {
        before: async (account) => ({
          data: {
            ...account,
            ...normalizeLegacyAccountFields(account),
          },
        }),
      },
    },
    session: {
      create: {
        before: async (session) => ({
          data: {
            ...session,
            ...normalizeLegacySessionFields(session),
          },
        }),
      },
      update: {
        before: async (session) => ({
          data: {
            ...session,
            ...normalizeLegacySessionFields(session),
          },
        }),
      },
    },
  },
} satisfies BetterAuthOptions;

export const betterAuthServer = betterAuth(betterAuthConfig);
export const betterAuthNextJsHandler = toNextJsHandler(betterAuthServer);

export type BetterAuthServer = typeof betterAuthServer;
export type BetterAuthConfiguration = typeof betterAuthConfig;