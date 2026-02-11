import { NextRequest } from 'next/server';
import { StripePaymentProvider } from '../../../../lib/payment/providers/stripe';
import { PaystackPaymentProvider } from '../../../../lib/payment/providers/paystack';
import { PaddlePaymentProvider } from '../../../../lib/payment/providers/paddle';
import { RazorpayPaymentProvider } from '../../../../lib/payment/providers/razorpay';
import { Logger } from '../../../../lib/logger';
import { handleWebhookWithRouting } from '../../../../lib/payment/webhook-router';

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
		providerConfigs: [
			{
				providerKey: 'razorpay',
				signatureHeader: 'x-razorpay-signature',
				getSecrets: () => (process.env.RAZORPAY_WEBHOOK_SECRET || '').split(',').map(s => s.trim()).filter(Boolean),
				createProvider: () => {
					if (!process.env.RAZORPAY_KEY_ID) throw new Error('RAZORPAY_KEY_ID is not defined');
					if (!process.env.RAZORPAY_KEY_SECRET) throw new Error('RAZORPAY_KEY_SECRET is not defined');
					return new RazorpayPaymentProvider(process.env.RAZORPAY_KEY_SECRET);
				},
			},
			{
				providerKey: 'paddle',
				signatureHeader: 'paddle-signature',
				getSecrets: () => (process.env.PADDLE_WEBHOOK_SECRET || '').split(',').map(s => s.trim()).filter(Boolean),
				createProvider: () => {
					if (!process.env.PADDLE_API_KEY) throw new Error('PADDLE_API_KEY is not defined');
					return new PaddlePaymentProvider(process.env.PADDLE_API_KEY);
				},
			},
			{
				providerKey: 'stripe',
				signatureHeader: 'stripe-signature',
				getSecrets: () => (process.env.STRIPE_WEBHOOK_SECRET || '').split(',').map(s => s.trim()).filter(Boolean),
				createProvider: () => {
					if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not defined');
					return new StripePaymentProvider(process.env.STRIPE_SECRET_KEY);
				},
			},
			{
				providerKey: 'paystack',
				signatureHeader: 'x-paystack-signature',
				getSecrets: () => (process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY || '')
					.split(',')
					.map(s => s.trim())
					.filter(Boolean),
				createProvider: () => {
					if (!process.env.PAYSTACK_SECRET_KEY) throw new Error('PAYSTACK_SECRET_KEY is not defined');
					return new PaystackPaymentProvider(process.env.PAYSTACK_SECRET_KEY);
				},
			},
		],
	});
}
