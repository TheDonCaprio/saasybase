/**
 * Clerk Auth Provider
 * ====================
 * Wraps all `@clerk/nextjs` calls behind the `AuthProvider` interface.
 *
 * This is the first (and currently only) concrete implementation.
 * It does NOT change any runtime behaviour — it simply delegates to the
 * same Clerk SDK functions the codebase already uses, so existing
 * functionality is preserved.
 */

import type {
  AuthProvider,
  AuthProviderFeature,
  AuthSession,
  AuthUser,
  AuthSessionInfo,
  AuthOrganization,
  AuthOrganizationMembership,
  AuthWebhookEvent,
  AuthWebhookEventType,
} from '../types';
import { Logger } from '../../logger';
import { toError } from '../../runtime-guards';

// ---------------------------------------------------------------------------
// Lazy imports — keep the module loadable even when @clerk/nextjs isn't
// installed (e.g. in a future NextAuth-only setup).
// ---------------------------------------------------------------------------

type ClerkServerModule = typeof import('@clerk/nextjs/server');
type ClerkClient = Awaited<ReturnType<ClerkServerModule['clerkClient']>>;

let _clerkServer: ClerkServerModule | null = null;

async function getClerkServer(): Promise<ClerkServerModule> {
  if (!_clerkServer) {
    _clerkServer = await import('@clerk/nextjs/server');
  }
  return _clerkServer;
}

async function getClient(): Promise<ClerkClient> {
  const mod = await getClerkServer();
  return mod.clerkClient();
}

// ---------------------------------------------------------------------------
// Helper: map Clerk user to standardised AuthUser
// ---------------------------------------------------------------------------

function toAuthUser(clerkUser: Record<string, unknown>): AuthUser {
  const emailAddresses = Array.isArray(clerkUser.emailAddresses) ? clerkUser.emailAddresses : [];
  const primaryId = clerkUser.primaryEmailAddressId ?? (clerkUser as Record<string, unknown>).primary_email_address_id;
  let email: string | null = null;
  if (primaryId) {
    const primary = emailAddresses.find((a: Record<string, unknown>) => a?.id === primaryId);
    email = (primary?.emailAddress as string) ?? null;
  }
  if (!email && emailAddresses.length > 0) {
    email = (emailAddresses[0]?.emailAddress as string) ?? null;
  }
  if (!email) {
    email = (clerkUser.emailAddress as string) ?? null;
  }

  const firstName = (clerkUser.firstName as string) ?? null;
  const lastName = (clerkUser.lastName as string) ?? null;
  const fullName = (clerkUser.fullName as string) ?? (firstName && lastName ? `${firstName} ${lastName}` : firstName ?? null);

  let emailVerified = false;
  if (primaryId) {
    const primary = emailAddresses.find((a: Record<string, unknown>) => a?.id === primaryId);
    const verification = primary?.verification as Record<string, unknown> | undefined;
    emailVerified = verification?.status === 'verified';
  }

  return {
    id: clerkUser.id as string,
    email,
    firstName,
    lastName,
    fullName,
    imageUrl: (clerkUser.imageUrl as string) ?? null,
    emailVerified,
  };
}

// ---------------------------------------------------------------------------
// Provider Implementation
// ---------------------------------------------------------------------------

export class ClerkAuthProvider implements AuthProvider {
  readonly name = 'clerk' as const;

  // ── Feature Detection ──────────────────────────────────────────────
  supportsFeature(feature: AuthProviderFeature): boolean {
    const SUPPORTED: AuthProviderFeature[] = [
      'organizations',
      'organization_invites',
      'session_management',
      'user_profile_ui',
      'sign_in_ui',
      'sign_up_ui',
      'organization_switcher_ui',
      'webhooks',
      'middleware',
      'oauth',
      'magic_link',
      'mfa',
    ];
    return SUPPORTED.includes(feature);
  }

  // ── Server-Side Session ────────────────────────────────────────────
  async getSession(): Promise<AuthSession> {
    try {
      const mod = await getClerkServer();
      const result = await mod.auth();
      return {
        userId: (result as Record<string, unknown>).userId as string | null ?? null,
        orgId: (result as Record<string, unknown>).orgId as string | null ?? null,
        sessionId: (result as Record<string, unknown>).sessionId as string | null ?? null,
      };
    } catch (err) {
      Logger.debug('ClerkAuthProvider.getSession failed', { error: toError(err) });
      return { userId: null, orgId: null, sessionId: null };
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const mod = await getClerkServer();
      const user = await mod.currentUser();
      if (!user) return null;
      return toAuthUser(user as unknown as Record<string, unknown>);
    } catch (err) {
      Logger.debug('ClerkAuthProvider.getCurrentUser failed', { error: toError(err) });
      return null;
    }
  }

  // ── User Management ────────────────────────────────────────────────
  async getUser(userId: string): Promise<AuthUser | null> {
    try {
      const client = await getClient();
      const user = await client.users.getUser(userId);
      return toAuthUser(user as unknown as Record<string, unknown>);
    } catch (err) {
      Logger.warn('ClerkAuthProvider.getUser failed', { userId, error: toError(err).message });
      return null;
    }
  }

  async listUsers(opts?: { emailAddress?: string[]; limit?: number }): Promise<AuthUser[]> {
    try {
      const client = await getClient();
      const params: Record<string, unknown> = {};
      if (opts?.emailAddress) params.emailAddress = opts.emailAddress;
      if (opts?.limit) params.limit = opts.limit;
      const result = await client.users.getUserList(params);
      const list = Array.isArray(result) ? result : ((result as Record<string, unknown>).data as unknown[] ?? []);
      return list.map((u) => toAuthUser(u as Record<string, unknown>));
    } catch (err) {
      Logger.warn('ClerkAuthProvider.listUsers failed', { error: toError(err).message });
      return [];
    }
  }

  async deleteUser(userId: string): Promise<void> {
    const client = await getClient();
    await client.users.deleteUser(userId);
  }

  async updateUser(userId: string, data: { firstName?: string; lastName?: string; imageUrl?: string }): Promise<AuthUser> {
    const client = await getClient();
    const updated = await client.users.updateUser(userId, data);
    return toAuthUser(updated as unknown as Record<string, unknown>);
  }

  // ── Organization Management ────────────────────────────────────────
  async createOrganization(opts: {
    name: string;
    slug?: string;
    createdByUserId: string;
    maxAllowedMemberships?: number;
    publicMetadata?: Record<string, unknown>;
  }): Promise<AuthOrganization> {
    const client = await getClient();
    const org = await client.organizations.createOrganization({
      name: opts.name,
      slug: opts.slug,
      createdBy: opts.createdByUserId,
      maxAllowedMemberships: opts.maxAllowedMemberships,
      publicMetadata: opts.publicMetadata,
    });
    return this._toAuthOrg(org);
  }

  async getOrganization(organizationId: string): Promise<AuthOrganization | null> {
    try {
      const client = await getClient();
      const org = await client.organizations.getOrganization({ organizationId });
      return this._toAuthOrg(org);
    } catch (err) {
      Logger.warn('ClerkAuthProvider.getOrganization failed', { organizationId, error: toError(err).message });
      return null;
    }
  }

  async updateOrganization(organizationId: string, data: {
    name?: string;
    slug?: string;
    maxAllowedMemberships?: number;
    publicMetadata?: Record<string, unknown>;
  }): Promise<AuthOrganization> {
    const client = await getClient();
    const org = await client.organizations.updateOrganization(organizationId, data);
    return this._toAuthOrg(org);
  }

  async deleteOrganization(organizationId: string): Promise<void> {
    const client = await getClient();
    await client.organizations.deleteOrganization(organizationId);
  }

  async createOrganizationMembership(opts: {
    organizationId: string;
    userId: string;
    role: string;
  }): Promise<AuthOrganizationMembership> {
    const client = await getClient();
    await client.organizations.createOrganizationMembership({
      organizationId: opts.organizationId,
      userId: opts.userId,
      role: opts.role,
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
    const client = await getClient();
    await client.organizations.deleteOrganizationMembership({
      organizationId: opts.organizationId,
      userId: opts.userId,
    });
  }

  async listOrganizationMemberships(organizationId: string): Promise<AuthOrganizationMembership[]> {
    const client = await getClient();
    const result = await client.organizations.getOrganizationMembershipList({ organizationId });
    const list = Array.isArray(result) ? result : ((result as Record<string, unknown>).data as unknown[] ?? []);
    return list.map((m: unknown) => {
      const rec = m as Record<string, unknown>;
      const publicUserData = rec.publicUserData as Record<string, unknown> | undefined;
      return {
        userId: (publicUserData?.userId as string) ?? (rec.userId as string) ?? '',
        organizationId,
        role: (rec.role as string) ?? 'org:member',
      };
    });
  }

  async listUserOrganizations(userId: string): Promise<AuthOrganization[]> {
    const client = await getClient();
    const rawOrganizations: Record<string, unknown>[] = [];

    const tryList = async (fnName: string, args: Record<string, unknown>) => {
      const collection = client.organizations as unknown as Record<string, unknown>;
      const fn = collection[fnName];
      if (typeof fn !== 'function') return null;
      try {
        return await (fn as (this: unknown, params: Record<string, unknown>) => Promise<unknown>).call(client.organizations, args);
      } catch {
        return null;
      }
    };

    const candidates = [
      await tryList('listOrganizations', { created_by: userId }),
      await tryList('list', { created_by: userId }),
      await tryList('getOrganizationList', { createdBy: userId }),
      await tryList('getOrganizations', { createdBy: userId }),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const items = Array.isArray(candidate)
        ? candidate
        : Array.isArray((candidate as { data?: unknown[] }).data)
          ? (candidate as { data: unknown[] }).data
          : null;
      if (items && items.length > 0) {
        rawOrganizations.push(...(items as Record<string, unknown>[]));
        break;
      }
    }

    if (rawOrganizations.length === 0) {
      try {
        const user = await client.users.getUser(userId);
        const userRecord = user as unknown as Record<string, unknown>;
        const maybeOrganizations = userRecord.organizations || userRecord.organization_memberships || userRecord.orgs;
        if (Array.isArray(maybeOrganizations) && maybeOrganizations.length > 0) {
          rawOrganizations.push(
            ...maybeOrganizations.map((org) => {
              const record = org as Record<string, unknown>;
              return {
                id: record.id ?? record.organization_id ?? record.organizationId,
                name: record.name ?? record.organizationName ?? 'Organization',
                slug: record.slug ?? null,
                createdBy: record.createdBy ?? record.created_by ?? userId,
                maxAllowedMemberships: record.maxAllowedMemberships ?? null,
                publicMetadata: record.publicMetadata ?? {},
              };
            })
          );
        }
      } catch {
        // ignore fallback failures and return what we found above
      }
    }

    const seen = new Set<string>();
    return rawOrganizations
      .map((org) => this._toAuthOrg(org))
      .filter((org) => {
        if (!org.id || seen.has(org.id)) return false;
        seen.add(org.id);
        return true;
      });
  }

  async revokeOrganizationInvitation(opts: {
    organizationId: string;
    invitationId: string;
    requestingUserId: string;
  }): Promise<void> {
    const client = await getClient();
    await client.organizations.revokeOrganizationInvitation({
      organizationId: opts.organizationId,
      invitationId: opts.invitationId,
      requestingUserId: opts.requestingUserId,
    });
  }

  // ── Session Management ─────────────────────────────────────────────
  async getUserSessions(userId: string): Promise<AuthSessionInfo[]> {
    try {
      const client = await getClient();
      const result = await client.sessions.getSessionList({ userId });
      const list = Array.isArray(result) ? result : ((result as Record<string, unknown>).data as unknown[] ?? []);
      return list.map((s: unknown) => {
        const rec = s as Record<string, unknown>;
        const activity = rec.latestActivity as Record<string, unknown> | undefined;
        return {
          id: rec.id as string,
          status: rec.status as string,
          lastActiveAt: rec.lastActiveAt ? new Date(rec.lastActiveAt as string | number) : null,
          activity: activity ? {
            browserName: (activity.browserName as string) ?? null,
            deviceType: (activity.deviceType as string) ?? null,
            ipAddress: (activity.ipAddress as string) ?? null,
            city: (activity.city as string) ?? null,
            country: (activity.country as string) ?? null,
          } : null,
        };
      });
    } catch (err) {
      Logger.warn('ClerkAuthProvider.getUserSessions failed', { userId, error: toError(err).message });
      return [];
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    const client = await getClient();
    await client.sessions.revokeSession(sessionId);
  }

  // ── Webhook Processing ─────────────────────────────────────────────
  async verifyWebhook(request: {
    body: string | Buffer;
    headers: Record<string, string>;
  }): Promise<AuthWebhookEvent | null> {
    try {
      const secret = process.env.CLERK_WEBHOOK_SECRET;
      if (!secret) {
        Logger.warn('ClerkAuthProvider.verifyWebhook: CLERK_WEBHOOK_SECRET not configured');
        return null;
      }

      // Attempt Svix verification first (Clerk's default delivery mechanism)
      const { Webhook } = await import('svix');
      const wh = new Webhook(secret);
      const normalizedHeaders = Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key.toLowerCase(), value]));
      const svixHeaders = {
        'svix-id': normalizedHeaders['svix-id'] ?? normalizedHeaders['webhook-id'] ?? '',
        'svix-timestamp': normalizedHeaders['svix-timestamp'] ?? normalizedHeaders['webhook-timestamp'] ?? '',
        'svix-signature': normalizedHeaders['svix-signature'] ?? normalizedHeaders['clerk-signature'] ?? normalizedHeaders['x-clerk-signature'] ?? normalizedHeaders['webhook-signature'] ?? '',
      };
      if (!svixHeaders['svix-id'] || !svixHeaders['svix-timestamp'] || !svixHeaders['svix-signature']) {
        Logger.warn('ClerkAuthProvider.verifyWebhook: missing required webhook signature headers');
        return null;
      }
      const bodyStr = typeof request.body === 'string' ? request.body : request.body.toString('utf-8');
      const verified = wh.verify(bodyStr, svixHeaders) as Record<string, unknown>;
      const eventType = (verified.type as string) ?? 'other';

      return {
        type: this._normalizeEventType(eventType),
        payload: verified,
        originalEvent: verified,
      };
    } catch (err) {
      Logger.warn('ClerkAuthProvider.verifyWebhook: verification failed', { error: toError(err).message });
      return null;
    }
  }

  // ── Middleware ──────────────────────────────────────────────────────
  getMiddleware(): unknown {
    // Return a reference to the Clerk middleware factory.
    // The actual middleware file (proxy.ts) can call this and configure routes.
    // This is intentionally lazy — only evaluated when called.
    return import('@clerk/nextjs/server').then((mod) => mod.clerkMiddleware);
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private _toAuthOrg(org: unknown): AuthOrganization {
    const rec = org as Record<string, unknown>;
    return {
      id: rec.id as string,
      name: (rec.name as string) ?? '',
      slug: (rec.slug as string) ?? null,
      createdBy: (rec.createdBy as string) ?? (rec.created_by as string) ?? null,
      maxAllowedMemberships: typeof rec.maxAllowedMemberships === 'number' ? rec.maxAllowedMemberships : null,
      publicMetadata: (rec.publicMetadata as Record<string, unknown>) ?? {},
    };
  }

  private _normalizeEventType(raw: string): AuthWebhookEventType {
    const map: Record<string, AuthWebhookEventType> = {
      'user.created': 'user.created',
      'user.updated': 'user.updated',
      'user.deleted': 'user.deleted',
      'organization.created': 'organization.created',
      'organization.updated': 'organization.updated',
      'organization.deleted': 'organization.deleted',
      'organizationMembership.created': 'organizationMembership.created',
      'organizationMembership.updated': 'organizationMembership.updated',
      'organizationMembership.deleted': 'organizationMembership.deleted',
      'organizationInvitation.created': 'organizationInvitation.created',
      'organizationInvitation.accepted': 'organizationInvitation.accepted',
      'organizationInvitation.revoked': 'organizationInvitation.revoked',
      'session.created': 'session.created',
      'session.ended': 'session.ended',
    };
    return map[raw] ?? 'other';
  }
}
