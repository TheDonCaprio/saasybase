import { NextRequest } from 'next/server';
import { Logger } from '../../../../lib/logger';
import { createWebhookProviderConfigs, handleWebhookWithRouting } from '../../../../lib/payment/webhook-router';

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
  Logger.info('Legacy webhook request received', {
    path: req.nextUrl.pathname,
    hasSignature: !!req.headers.get('stripe-signature') || !!req.headers.get('x-paystack-signature')
  });

	return handleWebhookWithRouting({
		req,
		routeLabel: 'legacy-stripe',
		rateLimitNamespace: 'legacy',
		providerConfigs: createWebhookProviderConfigs(['stripe', 'paystack'])
	});
}