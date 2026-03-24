import { PaymentProvider } from './types';
import { StripePaymentProvider } from './providers/stripe';
import { PaystackPaymentProvider } from './providers/paystack';
import { PaddlePaymentProvider } from './providers/paddle';
import { RazorpayPaymentProvider } from './providers/razorpay';
import { getSetting, getSettingCached } from '../settings';

type ProviderConstructor = new (secretKey: string) => PaymentProvider;

interface ProviderConfig {
    Class: ProviderConstructor;
    envVarCheck: () => void;
    instantiate: () => PaymentProvider;
    /** Default currency for this provider (e.g., 'usd' for Stripe, 'NGN' for Paystack) */
    defaultCurrency: string;
    /** Supported currencies for this provider (empty = all currencies supported) */
    supportedCurrencies?: string[];
}

export const PAYMENT_PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
    stripe: {
        Class: StripePaymentProvider,
        envVarCheck: () => {
            if (!process.env.STRIPE_SECRET_KEY) {
                throw new Error('STRIPE_SECRET_KEY is not defined');
            }
        },
        instantiate: () => {
            // We know STRIPE_SECRET_KEY is defined because envVarCheck passed
            return new StripePaymentProvider(process.env.STRIPE_SECRET_KEY!);
        },
        defaultCurrency: 'usd',
        // Stripe supports 135+ currencies, no need to list them all
    },
    paystack: {
        Class: PaystackPaymentProvider,
        envVarCheck: () => {
            if (!process.env.PAYSTACK_SECRET_KEY) {
                throw new Error('PAYSTACK_SECRET_KEY is not defined');
            }
        },
        instantiate: () => {
            return new PaystackPaymentProvider(process.env.PAYSTACK_SECRET_KEY!);
        },
        defaultCurrency: 'NGN',
        supportedCurrencies: ['NGN', 'GHS', 'ZAR', 'KES', 'USD'], // USD requires merchant approval; set PAYSTACK_CURRENCY=USD to use it as default
    },
    paddle: {
        Class: PaddlePaymentProvider,
        envVarCheck: () => {
            if (!process.env.PADDLE_API_KEY) {
                throw new Error('PADDLE_API_KEY is not defined');
            }
        },
        instantiate: () => {
            return new PaddlePaymentProvider(process.env.PADDLE_API_KEY!);
        },
        defaultCurrency: 'USD',
        // Paddle supports many currencies for automatic collection.
        // We do not restrict supportedCurrencies here.
    },
    razorpay: {
        Class: RazorpayPaymentProvider,
        envVarCheck: () => {
            if (!process.env.RAZORPAY_KEY_ID) {
                throw new Error('RAZORPAY_KEY_ID is not defined');
            }
            if (!process.env.RAZORPAY_KEY_SECRET) {
                throw new Error('RAZORPAY_KEY_SECRET is not defined');
            }
            // Webhooks are optional in local dev, but required for production correctness.
        },
        instantiate: () => {
            return new RazorpayPaymentProvider(process.env.RAZORPAY_KEY_SECRET!);
        },
        defaultCurrency: 'INR',
        // Razorpay supports many currencies, but INR is the primary.
    },
};

function normalizeCurrencyCode(raw: unknown, fallback: string): string {
    const value = typeof raw === 'string' ? raw : '';
    // Accept values like `"USD"`, `'USD'`, or ` USD ` from .env parsing.
    const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
    const resolved = trimmed || fallback;
    return resolved.trim().toUpperCase() || fallback.toUpperCase();
}

/**
 * Global payments currency used as the *requested* currency for providers.
 *
 * Priority:
 * 1) PAYMENTS_CURRENCY (recommended)
 * 2) USD
 */
export function getPaymentsDefaultCurrency(): string {
    return normalizeCurrencyCode(
        process.env.PAYMENTS_CURRENCY,
        'USD'
    );
}

/**
 * Get the appropriate currency for a provider.
 * Falls back to provider's default currency if the requested currency isn't supported.
 * 
 * Priority:
 * 1. Requested currency (if supported by provider)
 * 2. Provider's default currency
 */
export function getProviderCurrency(providerName: string, requestedCurrency?: string): string {
    const config = PAYMENT_PROVIDER_REGISTRY[providerName];

	// If the caller doesn't specify a requested currency, use the global payments default.
	let effectiveRequestedCurrency = requestedCurrency ?? getPaymentsDefaultCurrency();

        // Provider-specific overrides are advanced exceptions for multi-provider deployments.
    if (providerName === 'paddle' && process.env.PADDLE_CURRENCY) {
		effectiveRequestedCurrency = process.env.PADDLE_CURRENCY;
    }
    if (providerName === 'paystack' && process.env.PAYSTACK_CURRENCY) {
		effectiveRequestedCurrency = process.env.PAYSTACK_CURRENCY;
    }
	if (providerName === 'razorpay' && process.env.RAZORPAY_CURRENCY) {
		effectiveRequestedCurrency = process.env.RAZORPAY_CURRENCY;
	}
    
    // If provider unknown, try to use requested currency or fall back to Stripe's default
    if (!config) {
		return normalizeCurrencyCode(effectiveRequestedCurrency, 'USD');
    }

	const currency = normalizeCurrencyCode(effectiveRequestedCurrency, config.defaultCurrency);
    
    // If provider has specific supported currencies, check if requested is supported
    if (config.supportedCurrencies && config.supportedCurrencies.length > 0) {
        const isSupported = config.supportedCurrencies.some(c => c.toUpperCase() === currency);
        if (!isSupported) {
            return config.defaultCurrency;
        }
    }
    
    return currency;
}

/**
 * Get the provider's hard-coded default currency (e.g. NGN for Paystack, INR for Razorpay).
 * Ignores environment overrides; useful as a fallback when the provider rejects the configured currency.
 */
export function getProviderDefaultCurrency(providerName: string): string {
    const config = PAYMENT_PROVIDER_REGISTRY[providerName];
    return config ? config.defaultCurrency.toUpperCase() : 'USD';
}

/**
 * Get the default currency for the currently active payment provider.
 * 
 * NOTE: This function uses server-only environment variables and should only
 * be called on the server (e.g., in page.tsx, API routes, or server actions).
 * For client components, pass the currency as a prop from the server.
 */
export function getActiveCurrency(): string {
    const activeProvider = process.env.PAYMENT_PROVIDER || 'stripe';
    // Check sync cache for admin-configured DEFAULT_CURRENCY (populated
    // after any getSetting/setSetting call for this key).
    const cachedDbCurrency = getSettingCached('DEFAULT_CURRENCY');
    if (cachedDbCurrency) {
        return getProviderCurrency(activeProvider, cachedDbCurrency);
    }
	return getProviderCurrency(activeProvider);
}

/**
 * Async variant of getActiveCurrency that reads the admin-configured DEFAULT_CURRENCY
 * from the database before falling back to environment variables.
 *
 * Use this in server components / API routes where `await` is available.
 */
export async function getActiveCurrencyAsync(): Promise<string> {
    const dbCurrency = await getSetting('DEFAULT_CURRENCY');
    const activeProvider = process.env.PAYMENT_PROVIDER || 'stripe';
    if (dbCurrency) {
        return getProviderCurrency(activeProvider, dbCurrency);
    }
    return getProviderCurrency(activeProvider);
}
