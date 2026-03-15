"use client";

import Script from 'next/script';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

interface ProviderScript {
    src: string;
    strategy?: 'beforeInteractive' | 'afterInteractive' | 'lazyOnload';
}

interface PaymentProviderScriptsProps {
    /** Active payment provider ID */
    provider?: string;
}

/**
 * Dynamically loads payment provider scripts based on the active provider.
 * Only loads scripts on checkout pages to avoid unnecessary script loading.
 * 
 * Usage: Add this component to your root layout:
 * ```tsx
 * <PaymentProviderScripts provider={process.env.PAYMENT_PROVIDER} />
 * ```
 * 
 * Note: This component only loads scripts on the client side for providers
 * that need external scripts (like Paystack). Stripe loads its SDK via npm.
 */
export function PaymentProviderScripts({ provider }: PaymentProviderScriptsProps) {
    const [fetchedScripts, setFetchedScripts] = useState<ProviderScript[]>([]);
    const pathname = usePathname();
    const providerScripts = useMemo(() => (provider ? getProviderScripts(provider) : null), [provider]);

    // Only load payment scripts on checkout pages
    const isCheckoutPage = pathname?.startsWith('/checkout') || pathname?.startsWith('/pricing');

    useEffect(() => {
        if (!isCheckoutPage || providerScripts) return;

        // Fetch provider scripts from API endpoint
        async function loadScripts() {
            try {
                const response = await fetch('/api/internal/payment-scripts');
                if (response.ok) {
                    const data = await response.json();
                    setFetchedScripts(data.scripts || []);
                }
            } catch {
                // Silently fail - scripts are optional for some providers
            }
        }

        loadScripts();
    }, [isCheckoutPage, providerScripts]);

    const scripts = providerScripts ?? fetchedScripts;

    if (!isCheckoutPage || scripts.length === 0) {
        return null;
    }

    return (
        <>
            {scripts.map((script, index) => (
                <Script
                    key={`${script.src}-${index}`}
                    src={script.src}
                    strategy={script.strategy || 'lazyOnload'}
                />
            ))}
        </>
    );
}

/**
 * Get scripts for a known provider (client-side only mapping)
 */
function getProviderScripts(providerId: string): ProviderScript[] {
    switch (providerId) {
        case 'stripe':
            // Stripe uses @stripe/stripe-js npm package, no external script needed
            return [];
        case 'paystack':
            return [
                { src: 'https://js.paystack.co/v1/inline.js', strategy: 'lazyOnload' }
            ];
        case 'razorpay':
            return [
                { src: 'https://checkout.razorpay.com/v1/checkout.js', strategy: 'lazyOnload' }
            ];
        default:
            return [];
    }
}

export default PaymentProviderScripts;
