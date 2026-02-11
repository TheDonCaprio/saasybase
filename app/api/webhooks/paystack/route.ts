import { NextRequest } from 'next/server';
import { PaystackPaymentProvider } from '../../../../lib/payment/providers/paystack';
import { StripePaymentProvider } from '../../../../lib/payment/providers/stripe';
import { Logger } from '../../../../lib/logger';
import { handleWebhookWithRouting } from '../../../../lib/payment/webhook-router';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    Logger.info('Paystack webhook request received', {
        path: req.nextUrl.pathname,
        hasSignature: !!req.headers.get('x-paystack-signature') || !!req.headers.get('stripe-signature'),
    });

	return handleWebhookWithRouting({
		req,
		routeLabel: 'paystack',
		rateLimitNamespace: 'paystack',
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
