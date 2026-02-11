"use client";

import React, { useState } from 'react';
import type { CheckoutComponentProps } from './registry';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

// Ensure we only load Stripe once
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function StripeCheckoutForm({ returnUrl }: { returnUrl?: string }) {
    const stripe = useStripe();
    const elements = useElements();
    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) {
            return;
        }

        setIsLoading(true);

        const { error } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: returnUrl || `${window.location.origin}/dashboard?purchase=success`,
            },
        });

        if (error.type === "card_error" || error.type === "validation_error") {
            setMessage(error.message || "An unexpected error occurred.");
        } else {
            setMessage("An unexpected error occurred.");
        }

        setIsLoading(false);
    };

    return (
        <form id="payment-form" onSubmit={handleSubmit} className="space-y-6">
            <PaymentElement id="payment-element" options={{ layout: "tabs" }} />
            <button
                disabled={isLoading || !stripe || !elements}
                id="submit"
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
                <span id="button-text">
                    {isLoading ? "Processing..." : "Pay now"}
                </span>
            </button>
            {message && <div id="payment-message" className="text-sm text-red-500 text-center">{message}</div>}
        </form>
    );
}

export default function StripeEmbeddedCheckout({ clientSecret }: CheckoutComponentProps) {
    const appearance = {
        theme: 'stripe' as const,
        variables: {
            colorPrimary: '#2563eb',
        },
    };
    const options = {
        clientSecret,
        appearance,
    };

    return (
        <div className="w-full">
            <Elements options={options} stripe={stripePromise}>
                <StripeCheckoutForm />
            </Elements>
        </div>
    );
}
