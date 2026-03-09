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
  AuthUser,
  AuthOrganization,
  AuthOrganizationMembership,
  AuthWebhookEvent,
} from '../types';
import { Logger } from '../../logger';
import { toError } from '../../runtime-guards';
import { ACTIVE_ORG_COOKIE } from '../../active-organization';
import { validateAndFormatPersonName } from '../../name-validation';

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
    // Note: organizations, session_management, user_profile_ui,
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

      // Read the active organization from the cookie
      let orgId: string | null = null;
      try {
        const { cookies } = await import('next/headers');
        const jar = await cookies();
        const activeOrg = jar.get(ACTIVE_ORG_COOKIE)?.value;
        if (activeOrg) {
          // Validate the user still has membership in this org
          const prisma = await getPrisma();
          const membership = await prisma.organizationMembership.findFirst({
            where: {
              organizationId: activeOrg,
              userId: session.user.id,
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
        userId: session.user.id,
        orgId,
        sessionId: null, // session token is httpOnly, not exposed
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
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
      });

      if (!user) return null;
      return toAuthUser(user as unknown as Record<string, unknown>);
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

  // ── Webhooks ───────────────────────────────────────────────────────
  // NextAuth uses callbacks, not inbound webhooks. This is a no-op.

  async verifyWebhook(_request: {
    body: string | Buffer;
    headers: Record<string, string>;
  }): Promise<AuthWebhookEvent | null> {
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
