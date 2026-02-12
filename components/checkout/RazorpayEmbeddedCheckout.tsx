"use client";

import React, { useState } from 'react';
import type { CheckoutComponentProps } from './registry';

declare global {
    interface Window {
        Razorpay?: new (options: RazorpayOptions) => RazorpayHandler;
    }
}

interface RazorpayOptions {
    key: string;
    subscription_id?: string;
    order_id?: string;
    name?: string;
    description?: string;
    image?: string;
    callback_url?: string;
    prefill?: {
        name?: string;
        email?: string;
    };
    notes?: Record<string, string>;
    theme?: {
        color?: string;
    };
    modal?: {
        ondismiss?: () => void;
    };
}

interface RazorpayHandler {
    open: () => void;
}

export default function RazorpayEmbeddedCheckout({
    clientSecret,
    email,
    metadata,
}: CheckoutComponentProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isSubscription = metadata?.checkoutMode === 'subscription' || clientSecret.startsWith('sub_');

    const handleCheckout = () => {
        const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
        if (!keyId) {
            setError('Razorpay key is not configured');
            return;
        }

        if (!window.Razorpay) {
            setError('Razorpay checkout script not loaded');
            return;
        }

        if (!clientSecret) {
            setError('Missing checkout details');
            return;
        }

        setIsLoading(true);
        setError(null);

        const callbackUrl = `${window.location.origin}/checkout/razorpay/callback?provider=razorpay`;

        const options: RazorpayOptions = {
            key: keyId,
            subscription_id: isSubscription ? clientSecret : undefined,
            order_id: isSubscription ? undefined : clientSecret,
            name: metadata?.planName || metadata?.planId || (isSubscription ? 'Subscription' : 'Payment'),
            description: isSubscription ? 'Complete your subscription' : 'Complete your payment',
            callback_url: callbackUrl,
            prefill: {
                name: metadata?.customerName || undefined,
                email: email || undefined,
            },
            notes: metadata,
            theme: {
                color: '#2563eb',
            },
            modal: {
                ondismiss: () => {
                    setIsLoading(false);
                },
            },
        };

        try {
            const rzp = new window.Razorpay(options);
            rzp.open();
        } catch (err) {
            setIsLoading(false);
            setError('Unable to open Razorpay checkout');
            console.error('Razorpay checkout error:', err);
        }
    };

    return (
        <div className="w-full space-y-6">
            <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                <p>
                    {isSubscription
                        ? 'Click below to authorize your subscription with Razorpay.'
                        : 'Click below to complete your payment with Razorpay.'}
                </p>
            </div>

            <button
                onClick={handleCheckout}
                disabled={isLoading}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
                {isLoading ? 'Opening Razorpay...' : 'Pay with Razorpay'}
            </button>

            {error && (
                <div className="text-sm text-red-500 text-center">{error}</div>
            )}

            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z" />
                </svg>
                <span>Secured by Razorpay</span>
            </div>
        </div>
    );
}
