import { NextRequest } from 'next/server';
import { Logger } from '../../../../lib/logger';
import { createWebhookProviderConfigs, handleWebhookWithRouting } from '../../../../lib/payment/webhook-router';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
	Logger.info('Paddle webhook request received', {
		path: req.nextUrl.pathname,
		hasSignature: !!req.headers.get('paddle-signature'),
	});

	return handleWebhookWithRouting({
		req,
		routeLabel: 'paddle',
		rateLimitNamespace: 'paddle',
		providerConfigs: createWebhookProviderConfigs(['paddle']),
	});
}
