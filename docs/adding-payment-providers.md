# Adding a New Payment Provider

This guide walks through the process of adding a new payment gateway to the application. The payment system uses a provider-agnostic architecture that makes it straightforward to add support for new providers like PayPal, Razorpay, Flutterwave, etc.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Step 1: Create the Provider Implementation](#step-1-create-the-provider-implementation)
3. [Step 2: Register the Provider](#step-2-register-the-provider)
4. [Step 3: Create Webhook Route](#step-3-create-webhook-route)
5. [Step 4: Add Client-Side Scripts](#step-4-add-client-side-scripts)
6. [Step 5: Environment Variables](#step-5-environment-variables)
7. [Step 6: Testing](#step-6-testing)
8. [Provider Feature Matrix](#provider-feature-matrix)
9. [Common Patterns](#common-patterns)

---

## Status Update (March 2026)

The payment architecture now supports **multi-provider ID mappings** using JSON strings (for SQLite compatibility) instead of single-provider columns. This allows a single record (User, Plan, Subscription) to track IDs across multiple providers simultaneously.

### Plural field mapping
| Old Field | New Plural Field | Type | Description |
|-----------|-----------------|------|-------------|
| `externalPriceId` | `externalPriceIds` | JSON String | Map of provider -> price ID |
| `externalProductId` | `externalProductIds` | JSON String | Map of provider -> product ID |
| `externalSubscriptionId` | `externalSubscriptionIds` | JSON String | Map of provider -> subscription ID |
| `externalCustomerId` | `externalCustomerIds` | JSON String | Map of provider -> customer ID |

---

## Architecture Overview

The payment system consists of:

```
lib/payment/
├── types.ts          # PaymentProvider interface & standardized types
├── factory.ts        # PaymentProviderFactory for provider instantiation
├── registry.ts       # Provider registration and configuration
├── service.ts        # PaymentService orchestration layer
└── providers/
    ├── stripe.ts     # Stripe implementation
    ├── paystack.ts   # Paystack implementation
    ├── paddle.ts     # Paddle implementation
    └── razorpay.ts   # Razorpay implementation
```

All providers implement the `PaymentProvider` interface, which defines standardized methods for:
- Customer management
- Checkout sessions
- Subscriptions
- Payments & refunds
- Webhooks
- Products & prices

---

## Step 1: Create the Provider Implementation

Create a new file at `lib/payment/providers/your-provider.ts`:

```typescript
import {
    PaymentProvider,
    PaymentProviderFeature,
    StandardizedWebhookEvent,
    SubscriptionDetails,
    CreateCheckoutOptions,
    // ... other types
} from '../types';

export class YourProvider implements PaymentProvider {
    name = 'your-provider';
    
    private secretKey: string;
    
    constructor(secretKey: string) {
        this.secretKey = secretKey;
    }

    // ============== Feature Detection ==============
    
    supportsFeature(feature: PaymentProviderFeature): boolean {
        const supportedFeatures: PaymentProviderFeature[] = [
            'refunds',
            'webhooks',
            'elements',
            // Add features your provider supports
        ];
        return supportedFeatures.includes(feature);
    }

    // ============== Customer Management ==============
    
    async createCustomer(options: { email: string; name?: string; metadata?: Record<string, string> }): Promise<string> {
        // Call your provider's API to create a customer
        // Return the provider's customer ID
        const response = await this.request('/customers', {
            method: 'POST',
            body: JSON.stringify({
                email: options.email,
                name: options.name,
                metadata: options.metadata
            })
        });
        return response.data.id;
    }

    async getCustomer(customerId: string): Promise<{ id: string; email?: string; name?: string }> {
        const response = await this.request(`/customers/${customerId}`);
        return {
            id: response.data.id,
            email: response.data.email,
            name: response.data.name
        };
    }

    async updateCustomer(customerId: string, updates: { email?: string; name?: string }): Promise<void> {
        await this.request(`/customers/${customerId}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    }

    // ============== Checkout & Sessions ==============
    
    async createCheckoutSession(options: CreateCheckoutOptions): Promise<{ url: string; sessionId: string }> {
        // Implement checkout session creation
        // This should redirect users to the provider's checkout page
        // or return data for client-side elements integration
    }

    // ============== Subscriptions ==============
    
    async getSubscription(subscriptionId: string): Promise<SubscriptionDetails> {
        // Fetch and normalize subscription data
        const response = await this.request(`/subscriptions/${subscriptionId}`);
        const sub = response.data;
        
        return {
            id: sub.id,
            status: this.normalizeStatus(sub.status),
            currentPeriodStart: new Date(sub.period_start),
            currentPeriodEnd: new Date(sub.period_end),
            cancelAtPeriodEnd: sub.cancel_at_period_end || false,
            canceledAt: sub.canceled_at ? new Date(sub.canceled_at) : null,
            priceId: sub.price_id,
            customerId: sub.customer_id,
            metadata: sub.metadata
        };
    }

    async cancelSubscription(subscriptionId: string, immediately?: boolean): Promise<SubscriptionResult> {
        // Cancel the subscription
        // If immediately=false, set to cancel at period end (if supported)
    }

    async undoCancelSubscription(subscriptionId: string): Promise<SubscriptionResult> {
        // Undo a pending cancellation (if supported)
    }

    // ============== Payments & Refunds ==============
    
    async getPaymentIntent(paymentIntentId: string): Promise<PaymentIntentDetails> {
        // Fetch payment intent/transaction details
    }

    async createRefund(options: RefundOptions): Promise<RefundResult> {
        // Process a refund
    }

    // ============== Webhooks ==============
    
    async constructWebhookEvent(payload: string, signature: string): Promise<unknown> {
        // Verify webhook signature and return raw event
        // Throw an error if signature is invalid
        const isValid = this.verifySignature(payload, signature);
        if (!isValid) {
            throw new Error('Invalid webhook signature');
        }
        return JSON.parse(payload);
    }

    normalizeEvent(event: unknown): StandardizedWebhookEvent {
        // Transform provider-specific event into standardized format
        const providerEvent = event as YourProviderEvent;
        
        switch (providerEvent.type) {
            case 'payment.success':
                return {
                    type: 'payment.succeeded',
                    payload: {
                        id: providerEvent.data.id,
                        amount: providerEvent.data.amount,
                        currency: providerEvent.data.currency,
                        status: 'succeeded',
                        userId: providerEvent.data.metadata?.userId,
                        metadata: providerEvent.data.metadata
                    },
                    originalEvent: event
                };
            
            case 'subscription.created':
                return {
                    type: 'subscription.created',
                    payload: {
                        id: providerEvent.data.id,
                        status: this.normalizeStatus(providerEvent.data.status),
                        // ... other fields
                    },
                    originalEvent: event
                };
            
            // Handle other event types...
            
            default:
                return {
                    type: 'other',
                    payload: providerEvent.data,
                    originalEvent: event
                };
        }
    }

    // ============== Products & Prices ==============
    
    async createProduct(options: CreateProductOptions): Promise<string> {
        // Create a product in the provider's system
    }

    async createPrice(options: CreatePriceOptions): Promise<string> {
        // Create a price/plan in the provider's system
    }

    async getPrice(priceId: string): Promise<PriceDetails> {
        // Fetch price details
    }

    // ============== Customer Portal (optional) ==============
    
    async createPortalSession?(customerId: string, returnUrl: string): Promise<string> {
        // If your provider supports a customer portal, implement this
        throw new Error('Customer portal not supported');
    }

    // ============== Helper Methods ==============
    
    private async request<T>(path: string, options?: RequestInit): Promise<T> {
        const response = await fetch(`https://api.yourprovider.com/v1${path}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json',
                ...options?.headers
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'API request failed');
        }
        
        return response.json();
    }

    private normalizeStatus(providerStatus: string): string {
        // Map provider-specific status to standard status
        const statusMap: Record<string, string> = {
            'active': 'active',
            'cancelled': 'canceled',
            'past_due': 'past_due',
            // ... map all provider statuses
        };
        return statusMap[providerStatus] || providerStatus;
    }

    private verifySignature(payload: string, signature: string): boolean {
        // Implement signature verification per provider docs
    }
}
```

---

## Step 2: Register the Provider

Update `lib/payment/registry.ts`:

```typescript
import { PaymentProvider } from './types';
import { StripePaymentProvider } from './providers/stripe';
import { PaystackProvider } from './providers/paystack';
import { YourProvider } from './providers/your-provider';

interface ProviderConfig {
    envVarCheck: () => void;
    instantiate: () => PaymentProvider;
}

export const PAYMENT_PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
    stripe: {
        envVarCheck: () => {
            if (!process.env.STRIPE_SECRET_KEY) {
                throw new Error('STRIPE_SECRET_KEY is required');
            }
        },
        instantiate: () => new StripePaymentProvider(process.env.STRIPE_SECRET_KEY!)
    },
    paystack: {
        envVarCheck: () => {
            if (!process.env.PAYSTACK_SECRET_KEY) {
                throw new Error('PAYSTACK_SECRET_KEY is required');
            }
        },
        instantiate: () => new PaystackProvider(process.env.PAYSTACK_SECRET_KEY!)
    },
    // Add your provider here
    'your-provider': {
        envVarCheck: () => {
            if (!process.env.YOUR_PROVIDER_SECRET_KEY) {
                throw new Error('YOUR_PROVIDER_SECRET_KEY is required');
            }
        },
        instantiate: () => new YourProvider(process.env.YOUR_PROVIDER_SECRET_KEY!)
    }
};
```

---

## Step 3: Create Webhook Route

Use the single unified payments webhook endpoint:

- **Canonical webhook URL:** `/api/webhooks/payments`
- This endpoint routes to the correct provider based on which signature header is present (e.g. `stripe-signature`, `x-paystack-signature`).

### Provider dashboard setup (recommended)

Point each provider’s webhook configuration to the same URL:

- **Stripe:** set your webhook endpoint URL to `/api/webhooks/payments`
    - Signature header: `stripe-signature`
    - Secret env var: `STRIPE_WEBHOOK_SECRET` (supports comma-separated rotation)
- **Paystack:** set your webhook endpoint URL to `/api/webhooks/payments`
    - Signature header: `x-paystack-signature`
    - Secret env var: `PAYSTACK_WEBHOOK_SECRET` (supports comma-separated rotation; falls back to `PAYSTACK_SECRET_KEY`)

### How to add a new provider to the unified webhook

1. Decide your provider's signature header name (example: `x-your-provider-signature`).
2. Add a new entry to the routing config in the payments webhook route:

- [app/api/webhooks/payments/route.ts](app/api/webhooks/payments/route.ts)

That entry should specify:
- `signatureHeader`
- `createProvider()` (uses env vars)
- `getSecrets()` (reads webhook secrets from env)

### Backward-compatible aliases

If you need compatibility with old provider dashboards/URLs, you can keep legacy endpoints (e.g. `/api/webhooks/stripe`, `/api/webhooks/paystack`) as thin wrappers that call the same router.

---

## Provider Notes: Paddle Billing (Redirect-only)

Paddle (Billing v2) is supported as a **redirect-only** provider in this codebase.

### Redirect-only limitation (important)

- The implementation creates Paddle transactions and uses the returned `checkout.url` (payment link) to redirect the user.
- Paddle’s transaction payment links do **not** behave like Stripe Checkout sessions with first-class `success_url` / `cancel_url` parameters.
- Because of this, your application should treat **webhooks as the source of truth** for fulfillment (tokens/subscription status).

Practically: the UI can redirect users back to your app after payment, but the backend should always finalize access based on webhook events.

### Recommended Paddle webhook subscriptions

Configure your Paddle notification destination to send the following events to `POST /api/webhooks/paddle`:

- `transaction.completed` (required) — primary fulfillment signal; normalized to `checkout.completed`.
- `subscription.created` (recommended) — creates/upserts subscriptions.
- `subscription.updated` (recommended) — keeps subscription status and billing period in sync.
- `transaction.payment_failed` (optional) — normalized to `payment.failed` when sent.

### Catalog price requirement

This integration expects Paddle **catalog price IDs** (`pri_...`) for checkout. Amount-only/non-catalog transactions are not wired in this adapter.

## Step 4: Add Client-Side Scripts

If your provider requires client-side JavaScript (for inline checkout, elements, etc.), update `components/PaymentProviderScripts.tsx`:

```typescript
'use client';

import Script from 'next/script';

const provider = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || 'stripe';

export function PaymentProviderScripts() {
    if (provider === 'stripe') {
        return <Script src="https://js.stripe.com/v3/" strategy="lazyOnload" />;
    }
    
    if (provider === 'paystack') {
        return <Script src="https://js.paystack.co/v1/inline.js" strategy="lazyOnload" />;
    }
    
    if (provider === 'your-provider') {
        return (
            <Script 
                src="https://js.yourprovider.com/v1/checkout.js" 
                strategy="lazyOnload" 
            />
        );
    }
    
    return null;
}
```

---

## Step 5: Environment Variables

Add to `.env.example`:

```bash
# Your Provider Configuration
YOUR_PROVIDER_SECRET_KEY=sk_test_...
YOUR_PROVIDER_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_YOUR_PROVIDER_PUBLIC_KEY=pk_test_...
```

Add to your environment validation in `scripts/validate-env.js` or similar.

---

## Step 6: Testing

### Unit Tests

Create `tests/payment/providers/your-provider.test.ts`:

```typescript
import { YourProvider } from '@/lib/payment/providers/your-provider';

describe('YourProvider', () => {
    let provider: YourProvider;

    beforeEach(() => {
        provider = new YourProvider('test_secret_key');
    });

    describe('supportsFeature', () => {
        it('should return true for supported features', () => {
            expect(provider.supportsFeature('refunds')).toBe(true);
            expect(provider.supportsFeature('webhooks')).toBe(true);
        });

        it('should return false for unsupported features', () => {
            expect(provider.supportsFeature('customer_portal')).toBe(false);
        });
    });

    describe('normalizeEvent', () => {
        it('should normalize payment success events', () => {
            const event = {
                type: 'payment.success',
                data: {
                    id: 'pay_123',
                    amount: 1000,
                    currency: 'usd',
                    metadata: { userId: 'user_123' }
                }
            };

            const normalized = provider.normalizeEvent(event);
            
            expect(normalized.type).toBe('payment.succeeded');
            expect(normalized.payload).toMatchObject({
                id: 'pay_123',
                amount: 1000,
                currency: 'usd'
            });
        });
    });
});
```

### Integration Testing

1. Set up test/sandbox credentials
2. Create test checkout sessions
3. Simulate webhooks using provider's testing tools
4. Verify database updates correctly

---

## Provider Feature Matrix

When implementing a new provider, document which features it supports:

```typescript
supportsFeature(feature: PaymentProviderFeature): boolean {
    const supportedFeatures: PaymentProviderFeature[] = [
        // Required - most providers support these
        'webhooks',
        'elements',
        'refunds',
        
        // Optional - check provider capabilities
        // 'coupons',           // Native coupon/discount support
        // 'proration',         // Subscription proration
        // 'cancel_at_period_end', // Delayed cancellation
        // 'customer_portal',   // Hosted billing portal
        // 'invoices',          // Invoice generation
        // 'receipts',          // Receipt hosting
        // 'disputes',          // Chargeback handling
        // 'subscription_updates', // Plan changes
        // 'trial_periods',     // Free trial support
    ];
    return supportedFeatures.includes(feature);
}
```

---

## Common Patterns

### Handling Missing Features

When a provider doesn't support a feature natively, you have options:

1. **Implement in-app**: Handle coupons, proration, etc. in your application layer
2. **Use workarounds**: Like the Paystack cancel-at-period-end via webhooks
3. **Graceful degradation**: Disable the feature in UI when not supported

```typescript
// Check feature support before showing UI
const canUseCoupons = paymentService.provider.supportsFeature('coupons');

// In checkout
if (couponCode && !provider.supportsFeature('coupons')) {
    // Apply discount manually before creating transaction
    amountCents = amountCents - discountCents;
}

**Note (Paddle mapping):** Paddle implements “coupons/promo codes” using **Discount** entities (`dsc_...`) that optionally have a human-entered `code`. In this codebase we reuse the existing “promotion code id” plumbing (`promotionCodeId` / `externalPromotionCodeId`) to store the **Paddle discount id** (`dsc_...`), since that’s the identifier Paddle expects when applying a discount to a transaction (`discount_id`).
```

### Status Normalization

Always normalize provider-specific statuses to standard values:

```typescript
// Standard subscription statuses
type SubscriptionStatus = 
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | 'incomplete'
    | 'incomplete_expired'
    | 'trialing'
    | 'paused';

// Map provider statuses
private normalizeStatus(status: string): SubscriptionStatus {
    const map: Record<string, SubscriptionStatus> = {
        'ACTIVE': 'active',
        'active': 'active',
        'non-renewing': 'active', // Paystack: active but won't renew
        'cancelled': 'canceled',
        'canceled': 'canceled',
        // ... complete the mapping
    };
    return map[status] || 'active';
}
```

### Webhook Event Types

The standardized event types your provider should emit:

```typescript
type StandardizedEventType =
    | 'checkout.completed'
    | 'payment.succeeded'
    | 'payment.failed'
    | 'subscription.created'
    | 'subscription.updated'
    | 'subscription.deleted'
    | 'invoice.paid'
    | 'invoice.payment_failed'
    | 'invoice.upcoming'
    | 'invoice.created'
    | 'refund.processed'
    | 'dispute.created'
    | 'dispute.updated'
    | 'ignored'    // Events we don't need to process
    | 'other';     // Catch-all for unmapped events
```

### Error Handling

Wrap provider API calls with proper error handling:

```typescript
private async request<T>(path: string, options?: RequestInit): Promise<T> {
    try {
        const response = await fetch(`${this.baseUrl}${path}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json',
                ...options?.headers
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(
                error.message || 
                `API error: ${response.status} ${response.statusText}`
            );
        }

        return response.json();
    } catch (err) {
        Logger.error('Provider API error', {
            provider: this.name,
            path,
            error: err instanceof Error ? err.message : 'Unknown error'
        });
        throw err;
    }
}
```

---

## Checklist

Before submitting your provider implementation:

- [ ] Implements all required `PaymentProvider` interface methods
- [ ] Properly maps provider statuses to standard statuses
- [ ] Normalizes all webhook events to standard types
- [ ] Verifies webhook signatures
- [ ] Registered in `PAYMENT_PROVIDER_REGISTRY`
- [ ] Provider added to unified webhook router at `/api/webhooks/payments`
- [ ] Environment variables documented
- [ ] `supportsFeature()` accurately reflects capabilities
- [ ] Error handling with proper logging
- [ ] Unit tests for critical paths
- [ ] Integration tested with sandbox/test credentials
