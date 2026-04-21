/**
 * Better Auth Provider
 * ====================
 *
 * Better Auth is treated as the local source of truth in this repo. The
 * provider adapter exposes session, user, organization, and session-management
 * primitives against the shared app database, while route protection is
 * handled centrally in `lib/auth-provider/middleware.ts`.
 *
 * Local Better Auth does not require inbound webhook verification because auth
 * state changes are initiated inside the application.
 */

import type {
  AuthOrganization,
  AuthOrganizationMembership,
  AuthProvider,
  AuthProviderFeature,
  AuthSession,
  AuthSessionInfo,
  AuthUser,
  AuthWebhookEvent,
} from '../types';
import { headers as nextHeaders } from 'next/headers';
import { prisma } from '../../prisma';
import { Logger } from '../../logger';
import { toError } from '../../runtime-guards';
import { validateAndFormatPersonName } from '../../name-validation';
import { getUserSuspensionStatus } from '../../account-suspension';
import { parseUserAgent } from '../../session-activity';

type BetterAuthSessionPayload = {
  session: {
    id: string;
    userId: string;
    activeOrganizationId?: string | null;
  };
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
    emailVerified?: boolean;
  };
};

function toAuthUser(dbUser: Record<string, unknown>): AuthUser {
  const name = (dbUser.name as string) ?? null;
  const nameParts = name?.split(' ') ?? [];
  const emailVerifiedBool = typeof dbUser.emailVerifiedBool === 'boolean'
    ? dbUser.emailVerifiedBool
    : !!dbUser.emailVerified;

  return {
    id: dbUser.id as string,
    email: (dbUser.email as string) ?? null,
    firstName: nameParts[0] ?? null,
    lastName: nameParts.slice(1).join(' ') || null,
    fullName: name,
    imageUrl: (dbUser.imageUrl as string) ?? null,
    lastSignInAt: null,
    emailVerified: emailVerifiedBool,
  };
}

function toAuthOrganization(org: Record<string, unknown>): AuthOrganization {
  let parsedMetadata: Record<string, unknown> = {};
  if (typeof org.metadata === 'string' && org.metadata.trim().length > 0) {
    try {
      const value = JSON.parse(org.metadata) as unknown;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        parsedMetadata = value as Record<string, unknown>;
      }
    } catch {
      parsedMetadata = {};
    }
  }

  return {
    id: org.id as string,
    name: (org.name as string) ?? '',
    slug: (org.slug as string) ?? null,
    createdBy: (org.ownerUserId as string) ?? null,
    maxAllowedMemberships: typeof org.seatLimit === 'number' ? org.seatLimit : null,
    publicMetadata: {
      ...parsedMetadata,
      ...(typeof org.planId === 'string' ? { planId: org.planId } : {}),
      ...(typeof org.tokenPoolStrategy === 'string' ? { tokenPoolStrategy: org.tokenPoolStrategy } : {}),
      ...(typeof org.seatLimit === 'number' ? { seatLimit: org.seatLimit } : {}),
      ...(typeof org.logo === 'string' ? { logo: org.logo } : {}),
    },
  };
}

async function getBetterAuthSessionFromHeaders(headers: Headers): Promise<BetterAuthSessionPayload | null> {
  const { betterAuthServer } = await import('@/lib/better-auth');

  return (await betterAuthServer.api.getSession({
    headers,
  })) as BetterAuthSessionPayload | null;
}

function toSessionUser(user: BetterAuthSessionPayload['user']): AuthUser {
  const name = user.name ?? null;
  const nameParts = name?.split(' ') ?? [];

  return {
    id: user.id,
    email: user.email ?? null,
    firstName: nameParts[0] ?? null,
    lastName: nameParts.slice(1).join(' ') || null,
    fullName: name,
    imageUrl: user.image ?? null,
    lastSignInAt: null,
    emailVerified: user.emailVerified ?? false,
  };
}

export class BetterAuthProvider implements AuthProvider {
  readonly name = 'betterauth' as const;

  private static readonly SUPPORTED: AuthProviderFeature[] = [
    'organizations',
    'session_management',
    'oauth',
    'magic_link',
  ];

  supportsFeature(feature: AuthProviderFeature): boolean {
    return BetterAuthProvider.SUPPORTED.includes(feature);
  }

  async getSession(): Promise<AuthSession> {
    try {
      const headers = await nextHeaders();
      const session = await getBetterAuthSessionFromHeaders(headers);

      if (!session) {
        return { userId: null, orgId: null, sessionId: null };
      }

      return {
        userId: session.user.id,
        orgId: session.session.activeOrganizationId ?? null,
        sessionId: session.session.id,
      };
    } catch (err) {
      Logger.warn('BetterAuthProvider.getSession failed', {
        error: toError(err).message,
      });
      return { userId: null, orgId: null, sessionId: null };
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const headers = await nextHeaders();
      const session = await getBetterAuthSessionFromHeaders(headers);

      if (!session) {
        return null;
      }

      return toSessionUser(session.user);
    } catch (err) {
      Logger.warn('BetterAuthProvider.getCurrentUser failed', {
        error: toError(err).message,
      });
      return null;
    }
  }

  async getUser(userId: string): Promise<AuthUser | null> {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || getUserSuspensionStatus(user).isSuspended) {
        return null;
      }

      return toAuthUser(user as unknown as Record<string, unknown>);
    } catch (err) {
      Logger.warn('BetterAuthProvider.getUser failed', {
        userId,
        error: toError(err).message,
      });
      return null;
    }
  }

  async listUsers(opts?: { emailAddress?: string[]; limit?: number }): Promise<AuthUser[]> {
    try {
      const users = await prisma.user.findMany({
        where: opts?.emailAddress?.length
          ? { email: { in: opts.emailAddress } }
          : undefined,
        take: opts?.limit ?? 100,
      });

      return users
        .filter((user) => !getUserSuspensionStatus(user).isSuspended)
        .map((user) => toAuthUser(user as unknown as Record<string, unknown>));
    } catch (err) {
      Logger.warn('BetterAuthProvider.listUsers failed', {
        error: toError(err).message,
      });
      return [];
    }
  }

  async deleteUser(userId: string): Promise<void> {
    await prisma.user.delete({ where: { id: userId } });
  }

  async updateUser(
    userId: string,
    data: { firstName?: string; lastName?: string; imageUrl?: string }
  ): Promise<AuthUser> {
    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    const currentName = existingUser?.name ?? '';
    const currentParts = currentName.split(' ');
    const firstName = data.firstName ?? currentParts[0] ?? '';
    const lastName = data.lastName ?? currentParts.slice(1).join(' ') ?? '';
    const validatedName = validateAndFormatPersonName({ firstName, lastName });

    if (!validatedName.ok) {
      throw new Error(validatedName.error || 'Invalid name');
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        name: validatedName.fullName,
        ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
      },
    });

    return toAuthUser(updated as unknown as Record<string, unknown>);
  }

  async createOrganization(opts: {
    name: string;
    slug?: string;
    createdByUserId: string;
    maxAllowedMemberships?: number;
    publicMetadata?: Record<string, unknown>;
  }): Promise<AuthOrganization> {
    const publicMetadata = opts.publicMetadata ?? {};
    const organization = await prisma.organization.create({
      data: {
        name: opts.name,
        slug: opts.slug ?? opts.name.toLowerCase().replace(/\s+/g, '-'),
        ownerUserId: opts.createdByUserId,
        seatLimit: opts.maxAllowedMemberships ?? 5,
        planId: typeof publicMetadata.planId === 'string' ? publicMetadata.planId : null,
        tokenPoolStrategy:
          typeof publicMetadata.tokenPoolStrategy === 'string'
            ? publicMetadata.tokenPoolStrategy
            : 'SHARED_FOR_ORG',
        logo: typeof publicMetadata.logo === 'string' ? publicMetadata.logo : null,
        metadata: Object.keys(publicMetadata).length > 0 ? JSON.stringify(publicMetadata) : null,
      },
    });

    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: opts.createdByUserId,
        role: 'org:admin',
      },
    });

    return toAuthOrganization(organization as unknown as Record<string, unknown>);
  }

  async getOrganization(organizationId: string): Promise<AuthOrganization | null> {
    try {
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
      });
      if (!organization) {
        return null;
      }

      return toAuthOrganization(organization as unknown as Record<string, unknown>);
    } catch (err) {
      Logger.warn('BetterAuthProvider.getOrganization failed', {
        organizationId,
        error: toError(err).message,
      });
      return null;
    }
  }

  async updateOrganization(
    organizationId: string,
    data: {
      name?: string;
      slug?: string;
      maxAllowedMemberships?: number;
      publicMetadata?: Record<string, unknown>;
    }
  ): Promise<AuthOrganization> {
    const publicMetadata = data.publicMetadata ?? {};

    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.slug ? { slug: data.slug } : {}),
        ...(data.maxAllowedMemberships !== undefined
          ? { seatLimit: data.maxAllowedMemberships }
          : {}),
        ...(typeof publicMetadata.planId === 'string' ? { planId: publicMetadata.planId } : {}),
        ...(typeof publicMetadata.tokenPoolStrategy === 'string'
          ? { tokenPoolStrategy: publicMetadata.tokenPoolStrategy }
          : {}),
        ...(typeof publicMetadata.logo === 'string' ? { logo: publicMetadata.logo } : {}),
        ...(data.publicMetadata !== undefined
          ? { metadata: Object.keys(publicMetadata).length > 0 ? JSON.stringify(publicMetadata) : null }
          : {}),
      },
    });

    return toAuthOrganization(organization as unknown as Record<string, unknown>);
  }

  async deleteOrganization(organizationId: string): Promise<void> {
    await prisma.organization.delete({ where: { id: organizationId } });
  }

  async createOrganizationMembership(opts: {
    organizationId: string;
    userId: string;
    role: string;
  }): Promise<AuthOrganizationMembership> {
    await prisma.organizationMembership.create({
      data: {
        organizationId: opts.organizationId,
        userId: opts.userId,
        role: opts.role,
      },
    });

    return {
      userId: opts.userId,
      organizationId: opts.organizationId,
      role: opts.role,
    };
  }

  async deleteOrganizationMembership(opts: {
    organizationId: string;
    userId: string;
  }): Promise<void> {
    await prisma.organizationMembership.deleteMany({
      where: {
        organizationId: opts.organizationId,
        userId: opts.userId,
      },
    });
  }

  async listOrganizationMemberships(organizationId: string): Promise<AuthOrganizationMembership[]> {
    const memberships = await prisma.organizationMembership.findMany({
      where: { organizationId },
    });

    return memberships.map((membership) => ({
      userId: membership.userId,
      organizationId: membership.organizationId,
      role: membership.role || 'org:member',
    }));
  }

  async listUserOrganizations(userId: string): Promise<AuthOrganization[]> {
    const organizations = await prisma.organization.findMany({
      where: {
        OR: [
          { ownerUserId: userId },
          { memberships: { some: { userId } } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    return organizations.map((organization) => {
      return toAuthOrganization(organization as unknown as Record<string, unknown>);
    });
  }

  async getUserSessions(userId: string): Promise<AuthSessionInfo[]> {
    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: [{ lastActiveAt: 'desc' }, { expiresAt: 'desc' }, { expires: 'desc' }],
      select: {
        id: true,
        expires: true,
        expiresAt: true,
        lastActiveAt: true,
        userAgent: true,
        ipAddress: true,
        country: true,
        city: true,
      },
    });

    const now = Date.now();

    return sessions.map((session) => {
      const effectiveExpiry = session.expiresAt ?? session.expires;
      const parsedUserAgent = parseUserAgent(session.userAgent);
      const hasActivity = Boolean(
        session.userAgent || session.ipAddress || session.country || session.city
      );

      return {
        id: session.id,
        status: effectiveExpiry.getTime() > now ? 'active' : 'expired',
        lastActiveAt: session.lastActiveAt ?? effectiveExpiry,
        activity: hasActivity
          ? {
              browserName: parsedUserAgent.browserName,
              browserVersion: parsedUserAgent.browserVersion,
              deviceType: parsedUserAgent.deviceType,
              ipAddress: session.ipAddress,
              city: session.city,
              country: session.country,
              isMobile: parsedUserAgent.isMobile,
            }
          : null,
      };
    });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await prisma.session.deleteMany({ where: { id: sessionId } });
  }

  async verifyWebhook(request: {
    body: string | Buffer;
    headers: Record<string, string>;
  }): Promise<AuthWebhookEvent | null> {
    void request;
    Logger.debug('BetterAuthProvider.verifyWebhook skipped', {
      message: 'Local Better Auth does not consume inbound auth webhooks.',
    });
    return null;
  }

  getMiddleware(): unknown {
    // Better Auth request gating is resolved centrally in
    // lib/auth-provider/middleware.ts so the provider instance does not expose
    // a standalone middleware object.
    return null;
  }
}