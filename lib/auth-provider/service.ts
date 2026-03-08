/**
 * Auth Provider Service
 * ======================
 * Mirrors `lib/payment/service.ts` in purpose (though much lighter).
 *
 * Provides a singleton `authService` instance with convenience methods
 * that delegate to the active `AuthProvider`.
 *
 * This is the ONLY import the rest of the app needs:
 *
 *   import { authService } from '@/lib/auth-provider/service';
 *   const session = await authService.getSession();
 *
 * All vendor-specific logic is hidden behind the provider adapter.
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
} from './types';
import { AuthProviderFactory } from './factory';
import { Logger } from '../logger';
import { toError } from '../runtime-guards';

// ---------------------------------------------------------------------------
// Singleton with lazy init (like PaymentService)
// ---------------------------------------------------------------------------

let _provider: AuthProvider | null = null;

function getProvider(): AuthProvider {
  if (!_provider) {
    _provider = AuthProviderFactory.getProvider();
  }
  return _provider;
}

/**
 * Reset the cached provider — useful in tests or after env changes.
 */
export function resetAuthProvider(): void {
  _provider = null;
}

// ---------------------------------------------------------------------------
// Service Class
// ---------------------------------------------------------------------------

class AuthService {
  // ── Provider Info ────────────────────────────────────────────────────

  /** Name of the active provider (e.g. 'clerk'). */
  get providerName(): string {
    return getProvider().name;
  }

  /** Runtime feature check. */
  supportsFeature(feature: AuthProviderFeature): boolean {
    return getProvider().supportsFeature(feature);
  }

  // ── Session ──────────────────────────────────────────────────────────

  /**
   * Get the current session. Safe to call in any server context —
   * returns `{ userId: null }` when unauthenticated or when the
   * provider throws.
   */
  async getSession(): Promise<AuthSession> {
    try {
      return await getProvider().getSession();
    } catch (err) {
      Logger.debug('authService.getSession failed', { error: toError(err) });
      return { userId: null, orgId: null, sessionId: null };
    }
  }

  /**
   * Require an authenticated session. Returns the `userId` or throws.
   */
  async requireUserId(): Promise<string> {
    const session = await this.getSession();
    if (!session.userId) {
      throw new Error('Unauthenticated');
    }
    return session.userId;
  }

  // ── Current User ─────────────────────────────────────────────────────

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      return await getProvider().getCurrentUser();
    } catch (err) {
      Logger.debug('authService.getCurrentUser failed', { error: toError(err) });
      return null;
    }
  }

  // ── User Management ──────────────────────────────────────────────────

  async getUser(userId: string): Promise<AuthUser | null> {
    return getProvider().getUser(userId);
  }

  async listUsers(opts?: { emailAddress?: string[]; limit?: number }): Promise<AuthUser[]> {
    return getProvider().listUsers(opts);
  }

  async deleteUser(userId: string): Promise<void> {
    return getProvider().deleteUser(userId);
  }

  async updateUser(userId: string, data: { firstName?: string; lastName?: string; imageUrl?: string }): Promise<AuthUser> {
    return getProvider().updateUser(userId, data);
  }

  // ── Organization Management ──────────────────────────────────────────

  async createOrganization(opts: {
    name: string;
    slug?: string;
    createdByUserId: string;
    maxAllowedMemberships?: number;
    publicMetadata?: Record<string, unknown>;
  }): Promise<AuthOrganization> {
    const provider = getProvider();
    if (!provider.createOrganization) {
      throw new Error(`Auth provider "${provider.name}" does not support organizations`);
    }
    return provider.createOrganization(opts);
  }

  async getOrganization(organizationId: string): Promise<AuthOrganization | null> {
    const provider = getProvider();
    if (!provider.getOrganization) return null;
    return provider.getOrganization(organizationId);
  }

  async updateOrganization(organizationId: string, data: {
    name?: string;
    slug?: string;
    maxAllowedMemberships?: number;
    publicMetadata?: Record<string, unknown>;
  }): Promise<AuthOrganization> {
    const provider = getProvider();
    if (!provider.updateOrganization) {
      throw new Error(`Auth provider "${provider.name}" does not support organization updates`);
    }
    return provider.updateOrganization(organizationId, data);
  }

  async deleteOrganization(organizationId: string): Promise<void> {
    const provider = getProvider();
    if (!provider.deleteOrganization) {
      throw new Error(`Auth provider "${provider.name}" does not support organization deletion`);
    }
    return provider.deleteOrganization(organizationId);
  }

  async createOrganizationMembership(opts: {
    organizationId: string;
    userId: string;
    role: string;
  }): Promise<AuthOrganizationMembership> {
    const provider = getProvider();
    if (!provider.createOrganizationMembership) {
      throw new Error(`Auth provider "${provider.name}" does not support organization memberships`);
    }
    return provider.createOrganizationMembership(opts);
  }

  async deleteOrganizationMembership(opts: {
    organizationId: string;
    userId: string;
  }): Promise<void> {
    const provider = getProvider();
    if (!provider.deleteOrganizationMembership) {
      throw new Error(`Auth provider "${provider.name}" does not support organization membership removal`);
    }
    return provider.deleteOrganizationMembership(opts);
  }

  async listOrganizationMemberships(organizationId: string): Promise<AuthOrganizationMembership[]> {
    const provider = getProvider();
    if (!provider.listOrganizationMemberships) return [];
    return provider.listOrganizationMemberships(organizationId);
  }

  // ── Session Management ───────────────────────────────────────────────

  async getUserSessions(userId: string): Promise<AuthSessionInfo[]> {
    const provider = getProvider();
    if (!provider.getUserSessions) return [];
    return provider.getUserSessions(userId);
  }

  async revokeSession(sessionId: string): Promise<void> {
    const provider = getProvider();
    if (!provider.revokeSession) {
      throw new Error(`Auth provider "${provider.name}" does not support session revocation`);
    }
    return provider.revokeSession(sessionId);
  }

  // ── Webhooks ─────────────────────────────────────────────────────────

  async verifyWebhook(request: {
    body: string | Buffer;
    headers: Record<string, string>;
  }): Promise<AuthWebhookEvent | null> {
    const provider = getProvider();
    if (!provider.verifyWebhook) return null;
    return provider.verifyWebhook(request);
  }

  // ── Advanced: Direct Provider Access ─────────────────────────────────
  // Escape hatch for call-sites that genuinely need vendor-specific APIs
  // (e.g. Clerk UI component props). Prefer using the typed methods above.

  /**
   * Return the underlying provider instance.
   * Use sparingly — this couples your code to a specific vendor.
   */
  getProviderInstance(): AuthProvider {
    return getProvider();
  }

  /**
   * Get a provider by name (for multi-provider scenarios or admin tools).
   */
  getProviderByName(name: string): AuthProvider | null {
    return AuthProviderFactory.getProviderByName(name);
  }
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

export const authService = new AuthService();
