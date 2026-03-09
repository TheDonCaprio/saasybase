import { NextRequest } from 'next/server';
import { Logger } from '../../../../lib/logger';
import { createWebhookProviderConfigs, handleWebhookWithRouting } from '../../../../lib/payment/webhook-router';

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
		providerConfigs: createWebhookProviderConfigs(['stripe', 'paystack'])
	});
}
