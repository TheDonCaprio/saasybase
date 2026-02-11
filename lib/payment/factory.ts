import { PaymentProvider } from './types';
import { PAYMENT_PROVIDER_REGISTRY } from './registry';

export class PaymentProviderFactory {
    static getProvider(): PaymentProvider {
        const providerName = process.env.PAYMENT_PROVIDER || 'stripe';
        const providerConfig = PAYMENT_PROVIDER_REGISTRY[providerName];

        if (!providerConfig) {
            throw new Error(
                `Unsupported payment provider: ${providerName}. ` +
                    `If you previously used Lemon Squeezy, note that it has been deregistered/archived in this repo.`
            );
        }

        providerConfig.envVarCheck();
        return providerConfig.instantiate();
    }

    /**
     * Get all providers that have valid API keys configured.
     * Returns an array of { name, provider } objects.
     */
    static getAllConfiguredProviders(): Array<{ name: string; provider: PaymentProvider }> {
        const providers: Array<{ name: string; provider: PaymentProvider }> = [];

        for (const [name, config] of Object.entries(PAYMENT_PROVIDER_REGISTRY)) {
            try {
                config.envVarCheck();
                providers.push({ name, provider: config.instantiate() });
            } catch {
                // Provider not configured (missing API key), skip
            }
        }

        return providers;
    }

    /**
     * Get a specific provider by name if it's configured.
     * Returns null if the provider is not configured or doesn't exist.
     */
    static getProviderByName(name: string): PaymentProvider | null {
        const config = PAYMENT_PROVIDER_REGISTRY[name];
        if (!config) return null;

        try {
            config.envVarCheck();
            return config.instantiate();
        } catch {
            return null;
        }
    }
}
