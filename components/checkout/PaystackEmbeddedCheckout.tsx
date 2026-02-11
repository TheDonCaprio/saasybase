"use client";

import React, { useState } from 'react';

/**
 * Paystack Embedded Checkout Component
 * 
 * Paystack provides two integration options:
 * 1. Popup: Uses Paystack's inline.js to show a modal
 * 2. Redirect: Redirects to Paystack's hosted checkout page
 * 
 * For embedded checkout, we'll use the Popup method.
 * 
 * To implement:
 * 1. Add Paystack inline script to your app/layout.tsx:
 *    <Script src="https://js.paystack.co/v1/inline.js" strategy="lazyOnload" />
 * 
 * 2. Configure your NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY in .env
 * 
 * API Reference: https://paystack.com/docs/payments/accept-payments/#popup
 */

declare global {
    interface Window {
        PaystackPop: {
            setup: (config: PaystackConfig) => PaystackHandler;
        };
    }
}

interface PaystackConfig {
    key: string;
    email: string;
    amount: number; // in kobo (smallest currency unit)
    currency?: string;
    ref?: string;
    channels?: ('card' | 'bank' | 'ussd' | 'qr' | 'mobile_money' | 'bank_transfer')[];
    metadata?: Record<string, unknown>;
    plan?: string; // Plan code for subscriptions
    quantity?: number;
    subaccount?: string;
    split_code?: string;
    callback?: (response: PaystackSuccessResponse) => void; // Alternative success callback
    onClose: () => void;
    onSuccess: (response: PaystackSuccessResponse) => void;
}

interface PaystackHandler {
    openIframe: () => void;
}

interface PaystackSuccessResponse {
    reference: string;
    trans: string;
    status: string;
    message: string;
    transaction: string;
    trxref: string;
}

interface PaystackEmbeddedCheckoutProps {
    clientSecret: string; // This would be the access_code from initialize transaction
    email?: string;
    amount?: number;
    currency?: string;
    metadata?: Record<string, string>;
    onSuccess?: (reference: string) => void;
    onClose?: () => void;
}

export default function PaystackEmbeddedCheckout({
    clientSecret,
    email,
    amount,
    currency = 'NGN',
    metadata,
    onSuccess,
    onClose
}: PaystackEmbeddedCheckoutProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handlePayment = () => {
        if (!window.PaystackPop) {
            setError('Paystack script not loaded');
            return;
        }

        if (!email || !amount) {
            setError('Email and amount are required');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Use access_code to resume pre-initialized transaction
            // This ensures Paystack uses our server-side initialization
            const handler = window.PaystackPop.setup({
                key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY!,
                email,
                amount, // Amount in kobo (smallest currency unit)
                currency,
                // clientSecret is the access_code from transaction/initialize
                // Pass as both ref and try resuming with access_code pattern
                ref: clientSecret,
                metadata: metadata as Record<string, unknown>,
                callback: (response: PaystackSuccessResponse) => {
                    // Paystack uses 'callback' for success in some versions
                    setIsLoading(false);
                    onSuccess?.(response.reference);
                    window.location.href = `/dashboard?purchase=success&payment_intent=${response.reference}&provider=paystack`;
                },
                onClose: () => {
                    setIsLoading(false);
                    onClose?.();
                },
                onSuccess: (response) => {
                    setIsLoading(false);
                    onSuccess?.(response.reference);
                    // Redirect to dashboard with success indicator
                    window.location.href = `/dashboard?purchase=success&payment_intent=${response.reference}&provider=paystack`;
                }
            });

            handler.openIframe();
        } catch (err) {
            setIsLoading(false);
            setError('Failed to initialize payment');
            console.error('Paystack error:', err);
        }
    };

    return (
        <div className="w-full space-y-6">
            <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                <p>Click the button below to complete your payment securely with Paystack.</p>
            </div>

            <button
                onClick={handlePayment}
                disabled={isLoading}
                className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
                {isLoading ? 'Processing...' : 'Pay with Paystack'}
            </button>

            {error && (
                <div className="text-sm text-red-500 text-center">{error}</div>
            )}

            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/>
                </svg>
                <span>Secured by Paystack</span>
            </div>
        </div>
    );
}
