import { NextRequest, NextResponse } from 'next/server';
import { PaymentService } from './service';
import { Logger } from '../logger';
import { rateLimit, RATE_LIMITS, getClientIP } from '../rateLimit';
import { createErrorResponse } from '../secure-errors';
import { toError } from '../runtime-guards';
import { WebhookSignatureVerificationError } from './errors';
import type { PaymentProvider } from './types';
import type { StandardizedWebhookEvent } from './types';

export type WebhookProviderRouteConfig = {
	providerKey: string;
	signatureHeader: string;
	getSecrets: () => string[];
	createProvider: () => PaymentProvider;
};

export async function handleWebhookWithRouting(opts: {
	req: NextRequest;
	routeLabel: string;
	providerConfigs: WebhookProviderRouteConfig[];
	rateLimitNamespace?: string;
}) {
	const { req, routeLabel, providerConfigs } = opts;
	const startTime = Date.now();
	const clientIp = getClientIP(req);
	let matchedProviderKey: string | null = null;
	let matchedSignatureHeader: string | null = null;

	try {
		const rateLimitKey = `webhook:${opts.rateLimitNamespace || routeLabel}:${clientIp}`;
		const rateLimitResult = await rateLimit(rateLimitKey, RATE_LIMITS.WEBHOOK, {
			ip: clientIp,
			route: req.nextUrl.pathname,
			method: req.method,
			userAgent: req.headers.get('user-agent'),
		});

		if (!rateLimitResult.success && !rateLimitResult.allowed) {
			Logger.error(`${routeLabel} webhook rate limiter unavailable`, {
				key: rateLimitKey,
				error: rateLimitResult.error,
			});
			return NextResponse.json(
				{ error: 'Service temporarily unavailable. Please retry shortly.' },
				{ status: 503 },
			);
		}

		if (!rateLimitResult.allowed) {
			const retryAfterSeconds = Math.max(0, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
			Logger.warn(`${routeLabel} webhook rate limit exceeded`, { key: rateLimitKey });
			return NextResponse.json(
				{ error: 'Rate limit exceeded' },
				{
					status: 429,
					headers: {
						'Retry-After': retryAfterSeconds.toString(),
					},
				},
			);
		}

		const userAgent = req.headers.get('user-agent') || '';

		// Read body ONCE. This is important: request bodies are streams.
		const bodyBuffer = Buffer.from(await req.arrayBuffer());
		if (bodyBuffer.length > 1024 * 1024) {
			Logger.warn('Webhook payload too large', { size: bodyBuffer.length, route: req.nextUrl.pathname });
			return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
		}

		const matched = providerConfigs.find(cfg => !!req.headers.get(cfg.signatureHeader));
		if (!matched) {
			Logger.warn('Webhook missing signature', {
				header: providerConfigs.map(c => c.signatureHeader).join('|'),
				userAgent,
				ip: clientIp,
				route: req.nextUrl.pathname,
			});
			return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
		}

		matchedProviderKey = matched.providerKey;
		matchedSignatureHeader = matched.signatureHeader;

		const signature = req.headers.get(matched.signatureHeader) || '';
		const provider = matched.createProvider();
		const service = new PaymentService(provider);

		const secrets = matched.getSecrets();
		if (secrets.length === 0) throw new Error('Missing webhook secrets configuration');

		let event: StandardizedWebhookEvent | null = null;
		let lastErr: Error | null = null;

		for (const secret of secrets) {
			try {
				event = await provider.constructWebhookEvent(bodyBuffer, signature, secret);
				break;
			} catch (err) {
				lastErr = err as Error;
			}
		}

		if (!event) {
			throw lastErr || new Error('No matching webhook secret');
		}

		Logger.info('Webhook event constructed successfully', {
			routeLabel,
			providerKey: matched.providerKey,
			eventType: event.type,
			userAgent,
		});

		await service.processWebhookEvent(event);

		const duration = Date.now() - startTime;
		Logger.info('Webhook processed', {
			routeLabel,
			providerKey: matched.providerKey,
			duration: `${duration}ms`,
			eventType: event.type,
		});

		return NextResponse.json({ received: true, routed: matched.providerKey });
	} catch (error: unknown) {
		const duration = Date.now() - startTime;
		const err = toError(error);

		// Local dev + ngrok tunnels sometimes drop connections mid-body.
		// Node reports this as `Error: aborted` from the HTTP server.
		if (err.message === 'aborted' || err.message.toLowerCase().includes('aborted')) {
			Logger.warn('Webhook request aborted by client', {
				routeLabel,
				providerKey: matchedProviderKey,
				signatureHeader: matchedSignatureHeader,
				duration: `${duration}ms`,
				userAgent: req.headers.get('user-agent'),
				ip: clientIp,
			});
			// Response may never be delivered (client is gone), but returning a
			// non-2xx helps avoid accidental "success" semantics.
			return NextResponse.json({ error: 'Request aborted' }, { status: 499 });
		}

		if (err instanceof WebhookSignatureVerificationError) {
			Logger.warn('Webhook signature verification failed', {
				routeLabel,
				providerKey: matchedProviderKey,
				signatureHeader: matchedSignatureHeader,
				duration: `${duration}ms`,
				userAgent: req.headers.get('user-agent'),
				ip: clientIp,
				error: err.message,
			});
			return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
		}

		Logger.error('Webhook processing error', { routeLabel, error: err.message, stack: err.stack });
		return createErrorResponse(err, 'Webhook processing failed');
	}
}
