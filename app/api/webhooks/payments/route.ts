import { NextRequest } from 'next/server';
import { Logger } from '../../../../lib/logger';
import { createWebhookProviderConfigs, handleWebhookWithRouting } from '../../../../lib/payment/webhook-router';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
	Logger.info('Payments webhook request received', {
		path: req.nextUrl.pathname,
		hasStripeSignature: !!req.headers.get('stripe-signature'),
		hasPaystackSignature: !!req.headers.get('x-paystack-signature'),
		hasPaddleSignature: !!req.headers.get('paddle-signature'),
		hasRazorpaySignature: !!req.headers.get('x-razorpay-signature'),
	});

	return handleWebhookWithRouting({
		req,
		routeLabel: 'payments',
		rateLimitNamespace: 'payments',
		providerConfigs: createWebhookProviderConfigs(['razorpay', 'paddle', 'stripe', 'paystack']),
	});
}
