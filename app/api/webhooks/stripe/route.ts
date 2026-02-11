import { NextRequest } from 'next/server';
import { StripePaymentProvider } from '../../../../lib/payment/providers/stripe';
import { PaystackPaymentProvider } from '../../../../lib/payment/providers/paystack';
import { Logger } from '../../../../lib/logger';
import { handleWebhookWithRouting } from '../../../../lib/payment/webhook-router';

export const runtime = 'nodejs';

// Supported Stripe webhook events (see README for full recommended list):
// - checkout.session.completed
// - checkout.session.async_payment_succeeded
// - checkout.session.async_payment_failed
// - invoice.payment_succeeded
// - invoice.payment_failed
// - customer.subscription.*
// - payment_intent.succeeded / payment_intent.payment_failed
// - charge.refunded, charge.dispute.*

export async function POST(req: NextRequest) {
	Logger.info('Webhook request received', {
		path: req.nextUrl.pathname,
		hasSignature: !!req.headers.get('stripe-signature') || !!req.headers.get('x-paystack-signature')
	});

	return handleWebhookWithRouting({
		req,
		routeLabel: 'stripe',
		rateLimitNamespace: 'stripe',
		providerConfigs: [
			{
				providerKey: 'stripe',
				signatureHeader: 'stripe-signature',
				getSecrets: () => (process.env.STRIPE_WEBHOOK_SECRET || '').split(',').map(s => s.trim()).filter(Boolean),
				createProvider: () => {
					if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not defined');
					return new StripePaymentProvider(process.env.STRIPE_SECRET_KEY);
				}
			},
			{
				providerKey: 'paystack',
				signatureHeader: 'x-paystack-signature',
				getSecrets: () => (process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY || '').split(',').map(s => s.trim()).filter(Boolean),
				createProvider: () => {
					if (!process.env.PAYSTACK_SECRET_KEY) throw new Error('PAYSTACK_SECRET_KEY is not defined');
					return new PaystackPaymentProvider(process.env.PAYSTACK_SECRET_KEY);
				}
			},
		]
	});
}
