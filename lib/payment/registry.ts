import { PaymentProvider } from './types';
import { StripePaymentProvider } from './providers/stripe';
import { PaystackPaymentProvider } from './providers/paystack';
import { PaddlePaymentProvider } from './providers/paddle';
import { RazorpayPaymentProvider } from './providers/razorpay';

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
        supportedCurrencies: ['NGN', 'GHS', 'ZAR', 'KES', 'USD'], // Note: USD only for some Paystack merchants
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
 * 2) NEXT_PUBLIC_CURRENCY (existing display currency; works well for single-currency apps)
 * 3) STRIPE_CURRENCY (legacy)
 * 4) USD
 */
export function getPaymentsDefaultCurrency(): string {
    return normalizeCurrencyCode(
        process.env.PAYMENTS_CURRENCY || process.env.NEXT_PUBLIC_CURRENCY || process.env.STRIPE_CURRENCY,
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

    // Provider-specific overrides (useful in multi-provider deployments where STRIPE_CURRENCY
    // may be set for a different provider than the one being called).
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
 * Get the default currency for the currently active payment provider.
 * 
 * NOTE: This function uses server-only environment variables and should only
 * be called on the server (e.g., in page.tsx, API routes, or server actions).
 * For client components, pass the currency as a prop from the server.
 */
export function getActiveCurrency(): string {
    const activeProvider = process.env.PAYMENT_PROVIDER || 'stripe';
	return getProviderCurrency(activeProvider);
}
