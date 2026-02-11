import { ComponentType } from 'react';
import StripeEmbeddedCheckout from './StripeEmbeddedCheckout';
import PaystackEmbeddedCheckout from './PaystackEmbeddedCheckout';

export type CheckoutComponentProps = {
    clientSecret: string;
    email?: string;
    amount?: number;
    currency?: string;
    metadata?: Record<string, string>;
};

export const CHECKOUT_COMPONENT_REGISTRY: Record<string, ComponentType<CheckoutComponentProps>> = {
    stripe: StripeEmbeddedCheckout,
    paystack: PaystackEmbeddedCheckout,
};
