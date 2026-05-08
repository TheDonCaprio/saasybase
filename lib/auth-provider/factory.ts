/**
 * Auth Provider Factory
 * ======================
 * Mirrors `lib/payment/factory.ts`.
 *
 * Reads `AUTH_PROVIDER` env var (default: 'betterauth'), validates the env,
 * and returns a configured `AuthProvider` instance.
 *
 * Usage:
 *   const auth = AuthProviderFactory.getProvider();     // active provider
 *   const clerk = AuthProviderFactory.getProviderByName('clerk'); // explicit
 */

import type { AuthProvider } from './types';
import { AUTH_PROVIDER_REGISTRY } from './registry';

/** Default provider when AUTH_PROVIDER env var is not set. */
const DEFAULT_AUTH_PROVIDER = 'betterauth';

export class AuthProviderFactory {
  /**
   * Return the active auth provider (determined by `AUTH_PROVIDER` env var).
   * Throws if the provider is unknown or misconfigured.
   */
  static getProvider(): AuthProvider {
    const providerName = (process.env.AUTH_PROVIDER || DEFAULT_AUTH_PROVIDER).toLowerCase();
    const config = AUTH_PROVIDER_REGISTRY[providerName];

    if (!config) {
      const known = Object.keys(AUTH_PROVIDER_REGISTRY).join(', ');
      throw new Error(
        `Unsupported auth provider: "${providerName}". Registered providers: ${known}`
      );
    }

    config.envVarCheck();
    return config.instantiate();
  }

  /**
   * Return a specific provider by name, or `null` if it isn't registered
   * or its required env vars are missing.
   */
  static getProviderByName(name: string): AuthProvider | null {
    const config = AUTH_PROVIDER_REGISTRY[name.toLowerCase()];
    if (!config) return null;

    try {
      config.envVarCheck();
      return config.instantiate();
    } catch {
      return null;
    }
  }

  /**
   * Return all providers that are fully configured (env vars present).
   * Useful for admin panels or diagnostics.
   */
  static getAllConfiguredProviders(): Array<{ name: string; provider: AuthProvider }> {
    const providers: Array<{ name: string; provider: AuthProvider }> = [];

    for (const [name, config] of Object.entries(AUTH_PROVIDER_REGISTRY)) {
      try {
        config.envVarCheck();
        providers.push({ name, provider: config.instantiate() });
      } catch {
        // Provider not configured, skip
      }
    }

    return providers;
  }

  /**
   * Return the name of the currently active provider without instantiating it.
   */
  static getActiveProviderName(): string {
    return (process.env.AUTH_PROVIDER || DEFAULT_AUTH_PROVIDER).toLowerCase();
  }
}
