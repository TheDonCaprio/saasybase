/**
 * Auth Provider — Public API
 * ===========================
 * Import from `@/lib/auth-provider` to access the abstraction layer.
 *
 * Examples:
 *   import { authService } from '@/lib/auth-provider';
 *   import type { AuthProvider, AuthSession } from '@/lib/auth-provider';
 */

// Types
export type {
  AuthProvider,
  AuthProviderFeature,
  AuthSession,
  AuthUser,
  AuthSessionInfo,
  AuthOrganization,
  AuthOrganizationMembership,
  AuthOrganizationInvite,
  AuthWebhookEvent,
  AuthWebhookEventType,
} from './types';

// Factory
export { AuthProviderFactory } from './factory';

// Registry
export {
  AUTH_PROVIDER_REGISTRY,
  getRegisteredAuthProviderNames,
  isAuthProviderConfigured,
} from './registry';
export type { AuthProviderConfig } from './registry';

// Service (singleton)
export { authService, resetAuthProvider } from './service';
