/**
 * NextAuth (Auth.js v5) Auth Provider
 * ======================================
 * Implements the `AuthProvider` interface using NextAuth + Prisma.
 *
 * Key differences from the Clerk provider:
 *   - Users live in our own database (via Prisma adapter)
 *   - No built-in organization primitives (feature-gated)
 *   - No built-in UI components (feature-gated)
 *   - Sessions stored in the database
 *   - Webhooks not applicable (NextAuth uses callbacks)
 */

import type {
  AuthProvider,
  AuthProviderFeature,
  AuthSession,
  AuthSessionInfo,
  AuthUser,
  AuthOrganization,
  AuthOrganizationMembership,
  AuthWebhookEvent,
} from '../types';
import { Logger } from '../../logger';
import { toError } from '../../runtime-guards';
import { ACTIVE_ORG_COOKIE } from '../../active-organization';
import { validateAndFormatPersonName } from '../../name-validation';
import {
  parseUserAgent,
  resolveSessionActivityFromHeaders,
  shouldRefreshSessionActivity,
} from '../../session-activity';

type SessionRecord = {
  id: string;
  userId: string;
  expires: Date;
  lastActiveAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
  country: string | null;
  city: string | null;
};

const SESSION_COOKIE_CANDIDATES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
];

// ---------------------------------------------------------------------------
// Lazy imports — keep the module loadable even if next-auth isn't installed
// ---------------------------------------------------------------------------

type NextAuthConfig = typeof import('../../nextauth.config');
type PrismaClient = typeof import('../../prisma').prisma;

let _nextAuth: NextAuthConfig | null = null;
let _prisma: PrismaClient | null = null;

async function getNextAuth(): Promise<NextAuthConfig> {
  if (!_nextAuth) {
    _nextAuth = await import('../../nextauth.config');
  }
  return _nextAuth;
}

async function getPrisma(): Promise<PrismaClient> {
  if (!_prisma) {
    const mod = await import('../../prisma');
    _prisma = mod.prisma;
  }
  return _prisma;
}

async function getSessionTokenFromCookies(): Promise<string | null> {
  try {
    const { cookies } = await import('next/headers');
    const jar = await cookies();

    for (const candidate of SESSION_COOKIE_CANDIDATES) {
      const direct = jar.get(candidate)?.value;
      if (direct) {
        return direct;
      }

      const chunked = jar
        .getAll()
        .filter((entry) => entry.name.startsWith(`${candidate}.`))
        .map((entry) => ({
          index: Number.parseInt(entry.name.slice(candidate.length + 1), 10),
          value: entry.value,
        }))
        .filter((entry) => Number.isFinite(entry.index))
        .sort((left, right) => left.index - right.index);

      if (chunked.length > 0) {
        return chunked.map((entry) => entry.value).join('');
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function getCurrentSessionRecord(): Promise<SessionRecord | null> {
  const sessionToken = await getSessionTokenFromCookies();
  if (!sessionToken) {
    return null;
  }

  const prisma = await getPrisma();
  const record = await prisma.session.findUnique({
    where: { sessionToken },
    select: {
      id: true,
      userId: true,
      expires: true,
      lastActiveAt: true,
      ipAddress: true,
      userAgent: true,
      country: true,
      city: true,
    },
  });

  if (!record) {
    return null;
  }

  const currentRecord: SessionRecord = {
    id: record.id,
    userId: record.userId,
    expires: record.expires,
    lastActiveAt: record.lastActiveAt,
    ipAddress: record.ipAddress,
    userAgent: record.userAgent,
    country: record.country,
    city: record.city,
  };

  try {
    const { headers } = await import('next/headers');
    const currentHeaders = await headers();
    const resolvedActivity = await resolveSessionActivityFromHeaders(currentHeaders);

    if (!shouldRefreshSessionActivity(currentRecord, resolvedActivity)) {
      return currentRecord;
    }

    const updated = await prisma.session.update({
      where: { id: record.id },
      data: {
        lastActiveAt: new Date(),
        ...(resolvedActivity.userAgent ? { userAgent: resolvedActivity.userAgent } : {}),
        ...(resolvedActivity.ipAddress ? { ipAddress: resolvedActivity.ipAddress } : {}),
        ...(resolvedActivity.country ? { country: resolvedActivity.country } : {}),
        ...(resolvedActivity.city ? { city: resolvedActivity.city } : {}),
      },
      select: {
        id: true,
        userId: true,
        expires: true,
        lastActiveAt: true,
        ipAddress: true,
        userAgent: true,
        country: true,
        city: true,
      },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      expires: updated.expires,
      lastActiveAt: updated.lastActiveAt,
      ipAddress: updated.ipAddress,
      userAgent: updated.userAgent,
      country: updated.country,
      city: updated.city,
    };
  } catch (err) {
    Logger.debug('NextAuthProvider.getCurrentSessionRecord activity sync failed', { error: toError(err) });
    return currentRecord;
  }
}

// ---------------------------------------------------------------------------
// Helper: map DB user to AuthUser
// ---------------------------------------------------------------------------

function toAuthUser(dbUser: Record<string, unknown>): AuthUser {
  const name = (dbUser.name as string) ?? null;
  const nameParts = name?.split(' ') ?? [];

  return {
    id: dbUser.id as string,
    email: (dbUser.email as string) ?? null,
    firstName: nameParts[0] ?? null,
    lastName: nameParts.slice(1).join(' ') || null,
    fullName: name,
    imageUrl: (dbUser.imageUrl as string) ?? (dbUser.image as string) ?? null,
    lastSignInAt: null,
    emailVerified: !!dbUser.emailVerified,
  };
}

// ---------------------------------------------------------------------------
// Provider Implementation
// ---------------------------------------------------------------------------

export class NextAuthProvider implements AuthProvider {
  readonly name = 'nextauth' as const;

  // ── Feature Detection ──────────────────────────────────────────────

  private static readonly SUPPORTED: AuthProviderFeature[] = [
    'oauth',
    'middleware',
    'session_management',
    // Note: organizations, user_profile_ui,
    // sign_in_ui, sign_up_ui, organization_switcher_ui are NOT supported.
    // The consumer code checks supportsFeature() before calling these.
  ];

  supportsFeature(feature: AuthProviderFeature): boolean {
    return NextAuthProvider.SUPPORTED.includes(feature);
  }

  // ── Server-Side Session ────────────────────────────────────────────

  async getSession(): Promise<AuthSession> {
    try {
      const { auth } = await getNextAuth();
      const session = await auth();

      if (!session?.user?.id) {
        return { userId: null, orgId: null, sessionId: null };
      }

      const prisma = await getPrisma();
      const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true },
      });

      if (!dbUser?.id) {
        return { userId: null, orgId: null, sessionId: null };
      }

      const currentSession = await getCurrentSessionRecord();

      // Read the active organization from the cookie
      let orgId: string | null = null;
      try {
        const { cookies } = await import('next/headers');
        const jar = await cookies();
        const activeOrg = jar.get(ACTIVE_ORG_COOKIE)?.value;
        if (activeOrg) {
          // Validate the user still has membership in this org
          const membership = await prisma.organizationMembership.findFirst({
            where: {
              organizationId: activeOrg,
              userId: dbUser.id,
              status: 'ACTIVE',
            },
          });
          if (membership) {
            orgId = activeOrg;
          }
        }
      } catch {
        // Cookie read may fail in some contexts (e.g. middleware); ignore
      }

      return {
        userId: dbUser.id,
        orgId,
        sessionId: currentSession?.userId === dbUser.id ? currentSession.id : null,
      };
    } catch (err) {
      Logger.debug('NextAuthProvider.getSession failed', { error: toError(err) });
      return { userId: null, orgId: null, sessionId: null };
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const { auth } = await getNextAuth();
      const session = await auth();

      if (!session?.user?.id) return null;

      const prisma = await getPrisma();
      const [user, latestSession] = await Promise.all([
        prisma.user.findUnique({
          where: { id: session.user.id },
        }),
        prisma.session.findFirst({
          where: { userId: session.user.id },
          orderBy: [{ lastActiveAt: 'desc' }, { expires: 'desc' }],
          select: {
            lastActiveAt: true,
            expires: true,
          },
        }),
      ]);

      if (!user) return null;
      const authUser = toAuthUser(user as unknown as Record<string, unknown>);
      return {
        ...authUser,
        lastSignInAt: latestSession?.lastActiveAt ?? latestSession?.expires ?? null,
      };
    } catch (err) {
      Logger.debug('NextAuthProvider.getCurrentUser failed', { error: toError(err) });
      return null;
    }
  }

  // ── User Management ────────────────────────────────────────────────

  async getUser(userId: string): Promise<AuthUser | null> {
    try {
      const prisma = await getPrisma();
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return null;
      return toAuthUser(user as unknown as Record<string, unknown>);
    } catch (err) {
      Logger.warn('NextAuthProvider.getUser failed', { userId, error: toError(err).message });
      return null;
    }
  }

  async listUsers(opts?: { emailAddress?: string[]; limit?: number }): Promise<AuthUser[]> {
    try {
      const prisma = await getPrisma();

      const users = await prisma.user.findMany({
        where: opts?.emailAddress?.length
          ? { email: { in: opts.emailAddress } }
          : undefined,
        take: opts?.limit ?? 100,
      });

      return users.map((u: unknown) => toAuthUser(u as Record<string, unknown>));
    } catch (err) {
      Logger.warn('NextAuthProvider.listUsers failed', { error: toError(err).message });
      return [];
    }
  }

  async deleteUser(userId: string): Promise<void> {
    const prisma = await getPrisma();
    // Cascade deletes accounts + sessions via Prisma relations
    await prisma.user.delete({ where: { id: userId } });
  }

  async updateUser(
    userId: string,
    data: { firstName?: string; lastName?: string; imageUrl?: string }
  ): Promise<AuthUser> {
    const prisma = await getPrisma();

    // Build the name from first + last
    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    const currentName = existingUser?.name ?? '';
    const currentParts = currentName.split(' ');
    const firstName = data.firstName ?? currentParts[0] ?? '';
    const lastName = data.lastName ?? currentParts.slice(1).join(' ') ?? '';
    const validatedName = validateAndFormatPersonName({ firstName, lastName });
    if (!validatedName.ok) {
      throw new Error(validatedName.error || 'Invalid name');
    }
    const name = validatedName.fullName;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
      },
    });

    return toAuthUser(updated as unknown as Record<string, unknown>);
  }

  // ── Organization Management ────────────────────────────────────────
  // NextAuth has no built-in org support. These delegate to our own
  // Organization model in Prisma (the same tables Clerk orgs sync to).

  async createOrganization(opts: {
    name: string;
    slug?: string;
    createdByUserId: string;
    maxAllowedMemberships?: number;
    publicMetadata?: Record<string, unknown>;
  }): Promise<AuthOrganization> {
    const prisma = await getPrisma();
    const publicMetadata = opts.publicMetadata ?? {};
    const org = await prisma.organization.create({
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
      },
    });

    // Auto-add the creator as an admin member
    await prisma.organizationMembership.create({
      data: {
        organizationId: org.id,
        userId: opts.createdByUserId,
        role: 'org:admin',
      },
    });

    return this._toAuthOrg(org as unknown as Record<string, unknown>);
  }

  async getOrganization(organizationId: string): Promise<AuthOrganization | null> {
    try {
      const prisma = await getPrisma();
      const org = await prisma.organization.findUnique({ where: { id: organizationId } });
      if (!org) return null;
      return this._toAuthOrg(org as unknown as Record<string, unknown>);
    } catch (err) {
      Logger.warn('NextAuthProvider.getOrganization failed', { organizationId, error: toError(err).message });
      return null;
    }
  }

  async updateOrganization(
    organizationId: string,
    data: { name?: string; slug?: string; maxAllowedMemberships?: number; publicMetadata?: Record<string, unknown> }
  ): Promise<AuthOrganization> {
    const prisma = await getPrisma();
    const publicMetadata = data.publicMetadata ?? {};
    const org = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.slug && { slug: data.slug }),
        ...(data.maxAllowedMemberships !== undefined && { seatLimit: data.maxAllowedMemberships }),
        ...(typeof publicMetadata.planId === 'string' && { planId: publicMetadata.planId }),
        ...(typeof publicMetadata.tokenPoolStrategy === 'string' && { tokenPoolStrategy: publicMetadata.tokenPoolStrategy }),
      },
    });
    return this._toAuthOrg(org as unknown as Record<string, unknown>);
  }

  async deleteOrganization(organizationId: string): Promise<void> {
    const prisma = await getPrisma();
    await prisma.organization.delete({ where: { id: organizationId } });
  }

  async createOrganizationMembership(opts: {
    organizationId: string;
    userId: string;
    role: string;
  }): Promise<AuthOrganizationMembership> {
    const prisma = await getPrisma();
    await prisma.organizationMembership.create({
      data: {
        organizationId: opts.organizationId,
        userId: opts.userId,
        role: opts.role,
      },
    });
    return { userId: opts.userId, organizationId: opts.organizationId, role: opts.role };
  }

  async deleteOrganizationMembership(opts: {
    organizationId: string;
    userId: string;
  }): Promise<void> {
    const prisma = await getPrisma();
    await prisma.organizationMembership.deleteMany({
      where: {
        organizationId: opts.organizationId,
        userId: opts.userId,
      },
    });
  }

  async listOrganizationMemberships(organizationId: string): Promise<AuthOrganizationMembership[]> {
    const prisma = await getPrisma();
    const members = await prisma.organizationMembership.findMany({
      where: { organizationId },
    });
    return members.map((m: unknown) => {
      const rec = m as Record<string, unknown>;
      return {
        userId: rec.userId as string,
        organizationId: rec.organizationId as string,
        role: (rec.role as string) ?? 'org:member',
      };
    });
  }

  async listUserOrganizations(userId: string): Promise<AuthOrganization[]> {
    const prisma = await getPrisma();
    const organizations = await prisma.organization.findMany({ where: { ownerUserId: userId } });
    return organizations.map((org) => this._toAuthOrg(org as unknown as Record<string, unknown>));
  }

  async getUserSessions(userId: string): Promise<AuthSessionInfo[]> {
    const prisma = await getPrisma();
    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: [{ lastActiveAt: 'desc' }, { expires: 'desc' }],
      select: {
        id: true,
        expires: true,
        lastActiveAt: true,
        userAgent: true,
        ipAddress: true,
        country: true,
        city: true,
      },
    });
    const now = Date.now();

    return sessions.map((session) => {
      const parsedUserAgent = parseUserAgent(session.userAgent);
      const hasActivity = Boolean(session.userAgent || session.ipAddress || session.country || session.city);

      return {
        id: session.id,
        status: session.expires.getTime() > now ? 'active' : 'expired',
        lastActiveAt: session.lastActiveAt ?? session.expires,
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
    const prisma = await getPrisma();
    await prisma.session.deleteMany({ where: { id: sessionId } });
  }

  // ── Webhooks ───────────────────────────────────────────────────────
  // NextAuth uses callbacks, not inbound webhooks. This is a no-op.

  async verifyWebhook(request: {
    body: string | Buffer;
    headers: Record<string, string>;
  }): Promise<AuthWebhookEvent | null> {
    void request;
    Logger.debug('NextAuthProvider.verifyWebhook: webhooks not supported by NextAuth');
    return null;
  }

  // ── Middleware ──────────────────────────────────────────────────────

  getMiddleware(): unknown {
    // Return the NextAuth middleware-compatible auth function.
    return getNextAuth().then((mod) => mod.auth);
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private _toAuthOrg(org: Record<string, unknown>): AuthOrganization {
    return {
      id: org.id as string,
      name: (org.name as string) ?? '',
      slug: (org.slug as string) ?? null,
      createdBy: (org.ownerUserId as string) ?? null,
      maxAllowedMemberships: typeof org.seatLimit === 'number' ? org.seatLimit : null,
      publicMetadata: {
        ...(typeof org.planId === 'string' ? { planId: org.planId } : {}),
        ...(typeof org.tokenPoolStrategy === 'string' ? { tokenPoolStrategy: org.tokenPoolStrategy } : {}),
        ...(typeof org.seatLimit === 'number' ? { seatLimit: org.seatLimit } : {}),
      },
    };
  }
}
