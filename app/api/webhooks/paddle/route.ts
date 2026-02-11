import { NextRequest } from 'next/server';
import { Logger } from '../../../../lib/logger';
import { handleWebhookWithRouting } from '../../../../lib/payment/webhook-router';
import { PaddlePaymentProvider } from '../../../../lib/payment/providers/paddle';

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
		providerConfigs: [
			{
				providerKey: 'paddle',
				signatureHeader: 'paddle-signature',
				getSecrets: () => (process.env.PADDLE_WEBHOOK_SECRET || '').split(',').map(s => s.trim()).filter(Boolean),
				createProvider: () => {
					if (!process.env.PADDLE_API_KEY) throw new Error('PADDLE_API_KEY is not defined');
					return new PaddlePaymentProvider(process.env.PADDLE_API_KEY);
				},
			},
		],
	});
}
