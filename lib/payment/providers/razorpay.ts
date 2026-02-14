/**
 * Razorpay Payment Provider Implementation
 *
 * Goals ("minimum working" for this repo):
 * - Embedded checkout for one-time payments (Orders + checkout.js)
 * - Embedded checkout for subscriptions (Subscriptions + checkout.js)
 * - Redirect checkout for legacy flows (Payment Links / subscription short_url)
 * - Webhook verification + normalization into our StandardizedWebhookEvent
 * - Subscription cancel/resume + refunds
 *
 * Notes:
 * - Razorpay uses Basic Auth with key_id + key_secret.
 * - Webhook signature header: X-Razorpay-Signature (HMAC SHA256 hex of raw body).
 */

import crypto from 'crypto';
import {
	CheckoutOptions,
	CheckoutSessionDetails,
	CheckoutSessionResult,
	CreateCouponOptions,
	CreatePriceOptions,
	CreateProductOptions,
	CreatePromotionCodeOptions,
	PaymentIntentDetails,
	PaymentProvider,
	PaymentProviderFeature,
	PriceDetails,
	ProrationPreviewResult,
	StandardizedCheckoutSession,
	StandardizedPayment,
	StandardizedRefund,
	StandardizedSubscription,
	StandardizedWebhookEvent,
	SubscriptionDetails,
	SubscriptionResult,
	SubscriptionUpdateResult,
	UpdateProductOptions,
} from '../types';
import { asRecord } from '../../runtime-guards';
import { Logger } from '../../logger';
import { ConfigurationError, PaymentProviderError, WebhookSignatureVerificationError } from '../errors';

type RazorpayEnvelope<T> = T;

type RazorpayPaymentLink = {
	id: string; // plink_...
	short_url?: string;
	amount?: number;
	currency?: string;
	status?: string; // created/paid/...
	notes?: Record<string, string | number | boolean>;
	customer?: { name?: string; email?: string };
};

type RazorpaySubscription = {
	id: string; // sub_...
	short_url?: string;
	status?: string; // created/active/paused/cancelled/completed
	plan_id?: string;
	customer_id?: string;
	start_at?: number;
	end_at?: number;
	current_start?: number;
	current_end?: number;
	paid_count?: number;
	notes?: Record<string, string | number | boolean>;
};

type RazorpayOrder = {
	id: string; // order_...
	amount: number;
	currency: string;
	status?: string; // created/paid/attempted
	receipt?: string;
	notes?: Record<string, string | number | boolean>;
};

type RazorpayRefund = {
	id: string; // rfnd_...
	payment_id?: string;
	amount: number;
	currency: string;
	status: string;
	created_at?: number;
};

type RazorpayCustomer = {
	id: string;
	email?: string;
	name?: string;
};

type RazorpayItem = { id: string; name: string; description?: string; active?: boolean };

type RazorpayPlan = {
	id: string;
	item: { id: string };
	period: 'daily' | 'weekly' | 'monthly' | 'yearly' | string;
	interval: number;
	currency: string;
	amount: number;
};

function toSecondsDate(sec: unknown): Date | null {
	if (typeof sec !== 'number' || !Number.isFinite(sec)) return null;
	return new Date(sec * 1000);
}

function toStringRecord(input: unknown): Record<string, string> | undefined {
	const record = asRecord(input);
	if (!record) return undefined;
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(record)) {
		if (typeof value === 'string') out[key] = value;
		else if (typeof value === 'number' || typeof value === 'boolean') out[key] = String(value);
		else if (value == null) continue;
		else {
			try {
				out[key] = JSON.stringify(value);
			} catch {
				out[key] = String(value);
			}
		}
	}
	return Object.keys(out).length ? out : undefined;
}

function mapSubscriptionStatus(status: string | undefined): string {
	const s = (status || '').toLowerCase();
	// Keep close to Stripe semantics used by PaymentService.
	if (s === 'active') return 'active';
	if (s === 'authenticated' || s === 'created') return 'incomplete';
	if (s === 'cancelled' || s === 'canceled') return 'canceled';
	if (s === 'completed' || s === 'expired') return 'expired';
	if (s === 'paused') return 'paused';
	return status || 'unknown';
}

function truncateText(value: string, maxLen: number): string {
	if (value.length <= maxLen) return value;
	return `${value.slice(0, maxLen)}…`;
}

function parseJsonOrNull(text: string): unknown {
	const trimmed = text.trim();
	if (!trimmed) return null;
	try {
		return JSON.parse(trimmed) as unknown;
	} catch {
		return null;
	}
}

function extractRazorpayError(body: unknown): {
	code?: string;
	description?: string;
	field?: string;
	source?: string;
	step?: string;
	reason?: string;
} | null {
	const record = asRecord(body);
	const errorRecord = asRecord(record?.error);
	if (!errorRecord) return null;
	return {
		code: typeof errorRecord.code === 'string' ? errorRecord.code : undefined,
		description: typeof errorRecord.description === 'string' ? errorRecord.description : undefined,
		field: typeof errorRecord.field === 'string' ? errorRecord.field : undefined,
		source: typeof errorRecord.source === 'string' ? errorRecord.source : undefined,
		step: typeof errorRecord.step === 'string' ? errorRecord.step : undefined,
		reason: typeof errorRecord.reason === 'string' ? errorRecord.reason : undefined,
	};
}

function summarizeRazorpayRequestPayload(path: string, payload: unknown): Record<string, unknown> | null {
	const obj = asRecord(payload);
	if (!obj) return null;

	const summary: Record<string, unknown> = {
		keys: Object.keys(obj).slice(0, 30),
	};

	const withIf = (key: string, value: unknown) => {
		if (value == null) return;
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') summary[key] = value;
	};

	// Common safe fields
	withIf('currency', obj.currency);
	withIf('amount', obj.amount);
	withIf('plan_id', obj.plan_id);
	withIf('total_count', obj.total_count);
	withIf('quantity', obj.quantity);
	withIf('reference_id', obj.reference_id);
	withIf('description', typeof obj.description === 'string' ? truncateText(obj.description, 160) : undefined);

	if (/\/plans/i.test(path)) {
		withIf('period', obj.period);
		withIf('interval', obj.interval);
		const item = asRecord(obj.item);
		if (item) {
			summary.item = {
				id: typeof item.id === 'string' ? item.id : undefined,
				name: typeof item.name === 'string' ? truncateText(item.name, 120) : undefined,
				amount: typeof item.amount === 'number' ? item.amount : undefined,
				currency: typeof item.currency === 'string' ? item.currency : undefined,
			};
		}
	}

	if (/\/items/i.test(path)) {
		withIf('name', typeof obj.name === 'string' ? truncateText(obj.name, 120) : undefined);
		withIf('description', typeof obj.description === 'string' ? truncateText(obj.description, 160) : undefined);
		withIf('active', obj.active);
	}

	if (/payment_links/i.test(path)) {
		// Avoid logging customer PII.
		summary.hasCustomer = Boolean(obj.customer);
		const notes = asRecord(obj.notes);
		if (notes) summary.notesKeys = Object.keys(notes).slice(0, 30);
	}

	return summary;
}

export class RazorpayPaymentProvider implements PaymentProvider {
	name = 'razorpay';
	private keyId: string;
	private keySecret: string;
	private baseUrl = 'https://api.razorpay.com/v1';

	constructor(keySecret: string) {
		if (!keySecret) throw new ConfigurationError('Razorpay key secret is missing');
		const keyId = process.env.RAZORPAY_KEY_ID;
		if (!keyId) throw new ConfigurationError('RAZORPAY_KEY_ID is not defined');
		this.keyId = keyId;
		this.keySecret = keySecret;
	}

	getWebhookSignatureHeader(): string {
		return 'x-razorpay-signature';
	}

	supportsFeature(feature: PaymentProviderFeature): boolean {
		const supported: PaymentProviderFeature[] = [
			'webhooks',
			'refunds',
			'cancel_at_period_end',
			'subscription_updates',
			// Razorpay doesn't have a Stripe-style portal, but we can provide a
			// hosted subscription management link (subscription.short_url).
			'customer_portal',
			// Embedded checkout is possible, but we implement redirect-only first.
		];
		return supported.includes(feature);
	}

	private authHeader(): string {
		const token = Buffer.from(`${this.keyId}:${this.keySecret}`, 'utf8').toString('base64');
		return `Basic ${token}`;
	}

	private async request<T>(path: string, init: RequestInit): Promise<T> {
		const url = `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
		const method = String(init.method || 'GET').toUpperCase();
		const requestPayloadText = typeof init.body === 'string' ? init.body : '';
		const requestPayloadParsed = requestPayloadText ? parseJsonOrNull(requestPayloadText) : null;
		const requestPayloadSummary = requestPayloadParsed ? summarizeRazorpayRequestPayload(path, requestPayloadParsed) : null;
		const requestPayloadFallback = !requestPayloadSummary && requestPayloadText ? truncateText(requestPayloadText, 400) : null;

		const res = await fetch(url, {
			...init,
			headers: {
				Authorization: this.authHeader(),
				'Content-Type': 'application/json',
				...(init.headers || {}),
			},
		});
		const requestId = (() => {
			const headers = (res as unknown as { headers?: { get?: (key: string) => string | null } }).headers;
			if (!headers || typeof headers.get !== 'function') return null;
			// Call as a method to preserve `this` (undici/WHATWG Headers methods throw on illegal invocation when detached).
			return headers.get('x-razorpay-request-id') || headers.get('X-Razorpay-Request-Id');
		})();

		let parsed: unknown = null;
		let body: unknown = null;
		if (typeof (res as unknown as { text?: () => Promise<string> }).text === 'function') {
			const responseText = await (res as unknown as { text: () => Promise<string> }).text();
			parsed = parseJsonOrNull(responseText);
			body = parsed ?? (responseText ? responseText : null);
		} else if (typeof (res as unknown as { json?: () => Promise<unknown> }).json === 'function') {
			try {
				parsed = await (res as unknown as { json: () => Promise<unknown> }).json();
			} catch {
				parsed = null;
			}
			body = parsed;
		}

		if (!res.ok) {
			const rpError = extractRazorpayError(parsed);
			const detailBits: string[] = [];
			if (rpError?.code) detailBits.push(rpError.code);
			if (rpError?.description) detailBits.push(rpError.description);
			const detail = detailBits.join(': ');
			const fieldSuffix = rpError?.field ? ` (field: ${rpError.field})` : '';
			const msg = detail
				? `Razorpay API request failed (${res.status}): ${truncateText(detail, 260)}${fieldSuffix}`
				: `Razorpay API request failed (${res.status})`;

			const responseBodySummary = (() => {
				const record = asRecord(parsed);
				if (record && record.error) return { error: record.error };
				if (typeof body === 'string') return truncateText(body, 800);
				return body;
			})();

			throw new PaymentProviderError(msg, {
				status: res.status,
				url,
				path,
				method,
				requestId,
				body: parsed,
				razorpayError: rpError,
				request: requestPayloadSummary ?? (requestPayloadFallback ? { raw: requestPayloadFallback } : null),
				response: responseBodySummary,
			});
		}

		if (parsed == null) return {} as T;
		return parsed as T;
	}

	private isOfferIdFieldUnsupported(err: unknown): boolean {
		if (!(err instanceof PaymentProviderError)) return false;
		const original = err.originalError;
		const originalRecord = asRecord(original);
		const status = typeof originalRecord?.status === 'number' ? originalRecord.status : undefined;
		const body = originalRecord?.body;
		if (status !== 400 && status !== 422) return false;
		const text = (() => {
			try {
				return JSON.stringify(body || {});
			} catch {
				return String(body || '');
			}
		})();
		// Only fall back when it's likely an API schema/field issue.
		return /offer_id/i.test(text) && /(unknown|unexpected|not\s+allowed|invalid\s+parameter|extra\s+keys)/i.test(text);
	}

	// ============== Checkout (redirect-only) ==============

	async createCheckoutSession(opts: CheckoutOptions): Promise<CheckoutSessionResult> {
		const currency = String(opts.currency || process.env.RAZORPAY_CURRENCY || 'INR')
			.trim()
			.replace(/^['\"]|['\"]$/g, '')
			.toUpperCase();
		const metadata: Record<string, string> = {
			userId: opts.userId,
			...(opts.metadata || {}),
		};
		if (opts.dedupeKey) metadata.dedupeKey = opts.dedupeKey;
		if (opts.mode) metadata.checkoutMode = opts.mode;
		if (opts.priceId) metadata.priceId = opts.priceId;

		if (opts.mode === 'subscription') {
			if (!opts.priceId) throw new PaymentProviderError('Razorpay subscription checkout requires a priceId (plan_id)');

			const payload: Record<string, unknown> = {
				plan_id: opts.priceId,
				// Razorpay requires total_count. Use a large number as "until canceled" semantics.
				total_count: 1200,
				quantity: 1,
				customer_notify: 1,
				notes: metadata,
			};

			// Optional: Razorpay Offers for subscriptions.
			// If enabled and a valid offer id is provided in metadata, attempt to apply it.
			const offerId = typeof opts.metadata?.razorpayOfferId === 'string' ? opts.metadata.razorpayOfferId.trim() : '';
			const enableOffers = process.env.RAZORPAY_ENABLE_OFFERS === 'true';
			if (enableOffers && offerId && /^offer_[A-Za-z0-9]+$/.test(offerId)) {
				payload.offer_id = offerId;
			}

			let res: RazorpayEnvelope<RazorpaySubscription>;
			try {
				res = await this.request<RazorpayEnvelope<RazorpaySubscription>>('/subscriptions', {
					method: 'POST',
					body: JSON.stringify(payload),
				});
			} catch (err) {
				// Fall back only when offer_id is rejected as an unknown/unsupported field.
				if (payload.offer_id && this.isOfferIdFieldUnsupported(err)) {
					const retryPayload: Record<string, unknown> = { ...payload };
					delete retryPayload['offer_id'];
					res = await this.request<RazorpayEnvelope<RazorpaySubscription>>('/subscriptions', {
						method: 'POST',
						body: JSON.stringify(retryPayload),
					});
				} else {
					throw err;
				}
			}

			return { id: res.id, url: res.short_url || null };
		}

		// One-time payment: use Payment Links for redirect.
		if (!opts.amount || !Number.isFinite(opts.amount) || opts.amount <= 0) {
			throw new PaymentProviderError('Razorpay payment checkout requires a positive amount');
		}

		const payload: Record<string, unknown> = {
			amount: Math.round(opts.amount),
			currency,
			description: opts.metadata?.description || 'Payment',
			reference_id: opts.dedupeKey || metadata.dedupeKey || undefined,
			customer: {
				name: opts.customerEmail ? (opts.metadata?.customerName || undefined) : undefined,
				email: opts.customerEmail || undefined,
			},
			notify: { sms: false, email: Boolean(opts.customerEmail) },
			notes: metadata,
			callback_url: opts.successUrl,
			callback_method: 'get',
		};

		// Optional: Razorpay Offers for Payment Links.
		// This is intentionally opt-in and best-effort because Offers do not map 1:1 to our
		// coupon model (bank/issuer rules, cashback-style offers, etc.).
		const offerId = typeof opts.metadata?.razorpayOfferId === 'string' ? opts.metadata.razorpayOfferId.trim() : '';
		const enableOffers = process.env.RAZORPAY_ENABLE_OFFERS === 'true';
		if (enableOffers && offerId && /^offer_[A-Za-z0-9]+$/.test(offerId)) {
			payload.offer_id = offerId;
		}

		let res: RazorpayEnvelope<RazorpayPaymentLink>;
		try {
			res = await this.request<RazorpayEnvelope<RazorpayPaymentLink>>('/payment_links', {
				method: 'POST',
				body: JSON.stringify(payload),
			});
		} catch (err) {
			// Fall back only when offer_id is rejected as an unknown/unsupported field.
			if (payload.offer_id && this.isOfferIdFieldUnsupported(err)) {
				const retryPayload: Record<string, unknown> = { ...payload };
				delete retryPayload['offer_id'];
				res = await this.request<RazorpayEnvelope<RazorpayPaymentLink>>('/payment_links', {
					method: 'POST',
					body: JSON.stringify(retryPayload),
				});
			} else {
				throw err;
			}
		}

		return { id: res.id, url: res.short_url || null };
	}

	async getCheckoutSession(sessionId: string): Promise<CheckoutSessionDetails> {
		if (!sessionId) throw new PaymentProviderError('Missing checkout session id');

		if (sessionId.startsWith('plink_')) {
			const link = await this.request<RazorpayPaymentLink>(`/payment_links/${encodeURIComponent(sessionId)}`, { method: 'GET' });
			const metadata = toStringRecord(link.notes);
			return {
				id: link.id,
				clientReferenceId: metadata?.userId,
				metadata,
				paymentIntentId: link.id,
				subscriptionId: undefined,
				amountTotal: typeof link.amount === 'number' ? link.amount : undefined,
				amountSubtotal: typeof link.amount === 'number' ? link.amount : undefined,
				paymentStatus: link.status === 'paid' ? 'paid' : 'unpaid',
				lineItems: metadata?.priceId ? [{ priceId: metadata.priceId }] : undefined,
			};
		}

		if (sessionId.startsWith('order_')) {
			const order = await this.request<RazorpayOrder>(`/orders/${encodeURIComponent(sessionId)}`, { method: 'GET' });
			const metadata = toStringRecord(order.notes);
			const status = (order.status || '').toLowerCase();
			return {
				id: order.id,
				clientReferenceId: metadata?.userId,
				metadata,
				paymentIntentId: order.id,
				subscriptionId: undefined,
				amountTotal: typeof order.amount === 'number' ? order.amount : undefined,
				amountSubtotal: typeof order.amount === 'number' ? order.amount : undefined,
				currency: order.currency,
				paymentStatus: status === 'paid' ? 'paid' : 'unpaid',
				lineItems: metadata?.priceId ? [{ priceId: metadata.priceId }] : undefined,
			};
		}

		if (sessionId.startsWith('sub_')) {
			const sub = await this.request<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(sessionId)}`, { method: 'GET' });
			const metadata = toStringRecord(sub.notes);
			const periodStart = toSecondsDate(sub.current_start) || toSecondsDate(sub.start_at);
			const periodEnd = toSecondsDate(sub.current_end) || toSecondsDate(sub.end_at);
			return {
				id: sub.id,
				clientReferenceId: metadata?.userId,
				metadata,
				paymentIntentId: sub.id,
				subscriptionId: sub.id,
				amountTotal: undefined,
				amountSubtotal: undefined,
				amountDiscount: undefined,
				paymentStatus: mapSubscriptionStatus(sub.status),
				lineItems: sub.plan_id ? [{ priceId: sub.plan_id }] : undefined,
				paymentIntent: periodEnd && periodStart ? { amount: undefined, amountReceived: undefined } : undefined,
			};
		}

		// Unknown id type.
		return {
			id: sessionId,
			paymentStatus: 'unknown',
		};
	}

	// ============== Customers ==============

	async createCustomer(userId: string, email: string, name?: string): Promise<string> {
		if (!email) throw new PaymentProviderError('Razorpay customer creation requires an email');
		const payload: Record<string, unknown> = {
			email,
			name: name || undefined,
			notes: { userId },
		};
		const res = await this.request<RazorpayCustomer>('/customers', { method: 'POST', body: JSON.stringify(payload) });
		return res.id;
	}

	async updateCustomer(customerId: string, data: { email?: string; name?: string }): Promise<void> {
		if (!customerId) throw new PaymentProviderError('Missing customer id');
		const payload: Record<string, unknown> = {};
		if (typeof data.email === 'string' && data.email) payload.email = data.email;
		if (typeof data.name === 'string' && data.name) payload.name = data.name;
		if (!Object.keys(payload).length) return;
		await this.request(`/customers/${encodeURIComponent(customerId)}`, { method: 'PUT', body: JSON.stringify(payload) });
	}

	async createCustomerPortalSession(_customerId: string, _returnUrl: string): Promise<string> {
		void _returnUrl;
		// We use this hook to return a hosted management URL.
		// For Razorpay subscriptions, the API returns subscription.short_url.
		if (typeof _customerId !== 'string' || !_customerId.startsWith('sub_')) {
			throw new PaymentProviderError('Razorpay customer portal requires an active subscription id (sub_...)');
		}

		const sub = await this.request<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(_customerId)}`, { method: 'GET' });
		if (typeof sub?.short_url === 'string' && sub.short_url) return sub.short_url;
		throw new PaymentProviderError('Razorpay subscription returned no short_url to manage');
	}

	// ============== Subscriptions ==============

	async cancelSubscription(subscriptionId: string, immediately?: boolean): Promise<SubscriptionResult> {
		if (!subscriptionId) throw new PaymentProviderError('Missing subscription id');
		// Razorpay cancel endpoint supports optional cancel_at_cycle_end. We map immediately=false to cancel at period end.
		const payload: Record<string, unknown> = {
			cancel_at_cycle_end: immediately === false ? 1 : 0,
		};
		const sub = await this.request<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
			method: 'POST',
			body: JSON.stringify(payload),
		});

		return {
			id: sub.id,
			status: mapSubscriptionStatus(sub.status),
			canceledAt: new Date(),
			expiresAt: toSecondsDate(sub.current_end) || toSecondsDate(sub.end_at) || null,
			currentPeriodEnd: toSecondsDate(sub.current_end) || toSecondsDate(sub.end_at) || null,
		};
	}

	async undoCancelSubscription(subscriptionId: string): Promise<SubscriptionResult> {
		if (!subscriptionId) throw new PaymentProviderError('Missing subscription id');
		const sub = await this.request<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}/resume`, {
			method: 'POST',
			body: JSON.stringify({}),
		});

		return {
			id: sub.id,
			status: mapSubscriptionStatus(sub.status),
			canceledAt: null,
			expiresAt: toSecondsDate(sub.current_end) || toSecondsDate(sub.end_at) || null,
			currentPeriodEnd: toSecondsDate(sub.current_end) || toSecondsDate(sub.end_at) || null,
		};
	}

	async getSubscription(subscriptionId: string): Promise<SubscriptionDetails> {
		if (!subscriptionId) throw new PaymentProviderError('Missing subscription id');
		const sub = await this.request<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'GET' });
		const start = toSecondsDate(sub.current_start) || toSecondsDate(sub.start_at) || new Date();
		const end = toSecondsDate(sub.current_end) || toSecondsDate(sub.end_at) || new Date();
		const metadata = toStringRecord(sub.notes);

		return {
			id: sub.id,
			status: mapSubscriptionStatus(sub.status),
			providerId: sub.id,
			subscriptionIdsByProvider: { razorpay: sub.id },
			currentPeriodStart: start,
			currentPeriodEnd: end,
			cancelAtPeriodEnd: false,
			canceledAt: null,
			metadata,
			priceId: sub.plan_id,
			priceIdsByProvider: sub.plan_id ? { razorpay: sub.plan_id } : undefined,
			customerId: sub.customer_id,
			customerIdsByProvider: sub.customer_id ? { razorpay: sub.customer_id } : undefined,
			latestInvoice: null,
		};
	}

	// ============== Webhooks ==============

	async constructWebhookEvent(requestBody: Buffer, signature: string, secret: string): Promise<StandardizedWebhookEvent> {
		if (!secret) throw new WebhookSignatureVerificationError('Missing webhook secret');
		const expected = crypto.createHmac('sha256', secret).update(requestBody).digest('hex');
		const actual = (signature || '').trim();
		if (!actual) throw new WebhookSignatureVerificationError('Missing webhook signature');

		const expectedBuf = Buffer.from(expected, 'utf8');
		const actualBuf = Buffer.from(actual, 'utf8');
		if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
			throw new WebhookSignatureVerificationError('Invalid webhook signature');
		}

		let evt: unknown;
		try {
			evt = JSON.parse(requestBody.toString('utf8')) as unknown;
		} catch (err) {
			throw new PaymentProviderError('Invalid Razorpay webhook JSON', err);
		}

		return await this.normalizeWebhookEvent(evt);
	}

	private async normalizeWebhookEvent(evt: unknown): Promise<StandardizedWebhookEvent> {
		const evtRecord = asRecord(evt);
		const eventName = typeof evtRecord?.event === 'string' ? evtRecord.event : '';
		const payload = asRecord(evtRecord?.payload) || {};

		// Helpers to extract metadata/userId from notes.
		const paymentLinkEntity = asRecord(asRecord(payload.payment_link)?.entity);
		const subscriptionEntity = asRecord(asRecord(payload.subscription)?.entity);
		const paymentEntity = asRecord(asRecord(payload.payment)?.entity);
		const refundEntity = asRecord(asRecord(payload.refund)?.entity);

		let notes =
			toStringRecord(paymentEntity?.notes)
			|| toStringRecord(paymentLinkEntity?.notes)
			|| toStringRecord(subscriptionEntity?.notes)
			|| undefined;

		const paymentLinkId = typeof paymentEntity?.payment_link_id === 'string' ? paymentEntity.payment_link_id : undefined;
		const subscriptionId = typeof paymentEntity?.subscription_id === 'string' ? paymentEntity.subscription_id : undefined;
		const orderId = typeof paymentEntity?.order_id === 'string' ? paymentEntity.order_id : undefined;

		// Razorpay doesn't always include payment_link/subscription/order entities on payment.captured.
		// When notes are missing, fetch the related object to recover notes/userId.
		if (!notes && (eventName === 'payment.captured' || eventName === 'payment.failed')) {

			if (paymentLinkId) {
				try {
					const link = await this.request<unknown>(`/payment_links/${encodeURIComponent(paymentLinkId)}`, { method: 'GET' });
					const linkRecord = asRecord(link);
					const linkNotes = toStringRecord(linkRecord?.notes);
					if (linkNotes) notes = linkNotes;
				} catch {
					// Best-effort only; fallback handling occurs in PaymentService.
				}
			}

			if (!notes && subscriptionId) {
				try {
					const sub = await this.request<unknown>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'GET' });
					const subRecord = asRecord(sub);
					const subNotes = toStringRecord(subRecord?.notes);
					if (subNotes) notes = subNotes;
				} catch {
					// Best-effort only.
				}
			}

			if (!notes && orderId) {
				try {
					const order = await this.request<unknown>(`/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });
					const orderRecord = asRecord(order);
					const orderNotes = toStringRecord(orderRecord?.notes);
					if (orderNotes) notes = orderNotes;
				} catch {
					// Best-effort only.
				}
			}
		}

		const invoiceId = typeof paymentEntity?.invoice_id === 'string' ? paymentEntity.invoice_id : undefined;
		const customerId = typeof paymentEntity?.customer_id === 'string' ? paymentEntity.customer_id : undefined;

		const userId = notes?.userId;
		const mode = notes?.checkoutMode || (eventName.startsWith('subscription.') ? 'subscription' : 'payment');
		const augmentedNotes: Record<string, string> | undefined = (() => {
			const base = notes ? { ...notes } : undefined;
			const meta = base ?? {};
			let changed = false;
			if (paymentLinkId && meta.paymentLinkId !== paymentLinkId) {
				meta.paymentLinkId = paymentLinkId;
				changed = true;
			}
			if (subscriptionId && meta.subscriptionId !== subscriptionId) {
				meta.subscriptionId = subscriptionId;
				changed = true;
			}
			if (orderId && meta.orderId !== orderId) {
				meta.orderId = orderId;
				changed = true;
			}
			if (invoiceId && meta.invoiceId !== invoiceId) {
				meta.invoiceId = invoiceId;
				changed = true;
			}
			if (customerId && meta.customerId !== customerId) {
				meta.customerId = customerId;
				changed = true;
			}
			return changed ? meta : base;
		})();

		if (eventName === 'payment_link.paid') {
			const linkCustomer = asRecord(paymentLinkEntity?.customer);
			const link: RazorpayPaymentLink = {
				id: typeof paymentLinkEntity?.id === 'string' ? paymentLinkEntity.id : 'plink',
				amount: typeof paymentLinkEntity?.amount === 'number' ? paymentLinkEntity.amount : undefined,
				currency: typeof paymentLinkEntity?.currency === 'string' ? paymentLinkEntity.currency : undefined,
				status: typeof paymentLinkEntity?.status === 'string' ? paymentLinkEntity.status : undefined,
				notes: augmentedNotes,
			};

			const session: StandardizedCheckoutSession = {
				id: link.id,
				userId,
				userEmail: typeof linkCustomer?.email === 'string' ? linkCustomer.email : undefined,
				customerId: typeof paymentEntity?.customer_id === 'string' ? paymentEntity.customer_id : undefined,
				mode: 'payment',
				paymentStatus: 'paid',
				amountTotal: link.amount,
				amountSubtotal: link.amount,
				currency: link.currency,
				metadata: augmentedNotes,
				paymentIntentId: typeof paymentEntity?.id === 'string' ? paymentEntity.id : link.id,
				lineItems: notes?.priceId ? [{ priceId: notes.priceId, quantity: 1 }] : undefined,
			};

			return { type: 'checkout.completed', payload: session, originalEvent: evt };
		}

		if (eventName === 'subscription.activated') {
			const subId = typeof subscriptionEntity?.id === 'string' ? subscriptionEntity.id : 'sub';
			const planId = typeof subscriptionEntity?.plan_id === 'string' ? subscriptionEntity.plan_id : notes?.priceId;
			const paymentId = typeof paymentEntity?.id === 'string' ? paymentEntity.id : undefined;
			const paymentAmount = typeof paymentEntity?.amount === 'number' ? paymentEntity.amount : undefined;
			const paymentCurrency = typeof paymentEntity?.currency === 'string' ? paymentEntity.currency : undefined;
			const session: StandardizedCheckoutSession = {
				id: subId,
				userId,
				mode: 'subscription',
				paymentStatus: 'paid',
				subscriptionId: subId,
				paymentIntentId: paymentId,
				amountTotal: paymentAmount,
				amountSubtotal: paymentAmount,
				currency: paymentCurrency,
				customerId: typeof paymentEntity?.customer_id === 'string' ? paymentEntity.customer_id : undefined,
				metadata: augmentedNotes,
				lineItems: planId ? [{ priceId: planId, quantity: 1 }] : undefined,
			};
			return { type: 'checkout.completed', payload: session, originalEvent: evt };
		}

		if (eventName === 'subscription.updated') {
			const sub: StandardizedSubscription = {
				id: typeof subscriptionEntity?.id === 'string' ? subscriptionEntity.id : 'sub',
				status: mapSubscriptionStatus(typeof subscriptionEntity?.status === 'string' ? subscriptionEntity.status : undefined),
				providerId: typeof subscriptionEntity?.id === 'string' ? subscriptionEntity.id : undefined,
				subscriptionIdsByProvider: typeof subscriptionEntity?.id === 'string' ? { razorpay: subscriptionEntity.id } : undefined,
				currentPeriodStart: toSecondsDate(subscriptionEntity?.current_start) || new Date(),
				currentPeriodEnd: toSecondsDate(subscriptionEntity?.current_end) || new Date(),
				canceledAt: null,
				cancelAtPeriodEnd: false,
				customerId: typeof subscriptionEntity?.customer_id === 'string' ? subscriptionEntity.customer_id : undefined,
				customerIdsByProvider: typeof subscriptionEntity?.customer_id === 'string' ? { razorpay: subscriptionEntity.customer_id } : undefined,
				priceId: typeof subscriptionEntity?.plan_id === 'string' ? subscriptionEntity.plan_id : undefined,
				priceIdsByProvider: typeof subscriptionEntity?.plan_id === 'string' ? { razorpay: subscriptionEntity.plan_id } : undefined,
				metadata: augmentedNotes,
			};
			return { type: 'subscription.updated', payload: sub, originalEvent: evt };
		}

		if (eventName === 'refund.processed' || eventName === 'payment.refunded') {
			const refund: StandardizedRefund = {
				id: typeof refundEntity?.id === 'string' ? refundEntity.id : 'refund',
				paymentIntentId: typeof refundEntity?.payment_id === 'string' ? refundEntity.payment_id : undefined,
				amount: typeof refundEntity?.amount === 'number' ? refundEntity.amount : 0,
				currency: typeof refundEntity?.currency === 'string' ? refundEntity.currency : 'INR',
				status: 'succeeded',
				metadata: augmentedNotes,
			};
			return { type: 'refund.processed', payload: refund, originalEvent: evt };
		}

		if (eventName === 'payment.captured') {
			let subscriptionId = typeof paymentEntity?.subscription_id === 'string' ? paymentEntity.subscription_id : undefined;

			// Razorpay may not include subscription_id in the webhook payload for:
			//   1. The first subscription payment (timing / eventual consistency)
			//   2. Subscription renewals (payment.captured often lacks subscription_id)
			// Try one API fetch to resolve it when:
			//   - The checkout notes indicate subscription mode, OR
			//   - The payment has a customer_id (likely a renewal for a known customer)
			if (!subscriptionId) {
				const shouldTryResolve = notes?.checkoutMode === 'subscription'
					|| typeof paymentEntity?.customer_id === 'string';
				const payId = typeof paymentEntity?.id === 'string' ? paymentEntity.id : undefined;
				if (shouldTryResolve && payId) {
					try {
						const detail = await this.request<unknown>(`/payments/${encodeURIComponent(payId)}`, { method: 'GET' });
						const detailRec = asRecord(detail);
						if (typeof detailRec?.subscription_id === 'string' && detailRec.subscription_id) {
							subscriptionId = detailRec.subscription_id;
							Logger.info('Resolved subscription_id from Razorpay API for payment', {
								paymentId: payId,
								subscriptionId,
								trigger: notes?.checkoutMode === 'subscription' ? 'checkoutMode' : 'customer_id',
							});
						}
					} catch {
						// Best-effort; handlePaymentSucceeded will handle fallback.
					}
				}
			}

			const invoiceId =
				typeof paymentEntity?.invoice_id === 'string'
					? paymentEntity.invoice_id
					: typeof paymentEntity?.order_id === 'string'
						? paymentEntity.order_id
						: (typeof paymentEntity?.id === 'string' ? paymentEntity.id : 'invoice');

			// Subscription renewals often arrive as payment.captured without notes/metadata.
			// Prefer routing these through the invoice flow so PaymentService can correlate
			// by provider subscription id (no userId required on the webhook payload).
			if (subscriptionId) {
				const amount = typeof paymentEntity?.amount === 'number' ? paymentEntity.amount : 0;
				const currency = typeof paymentEntity?.currency === 'string' ? paymentEntity.currency : 'INR';
				const invoice: import('../types').StandardizedInvoice = {
					id: invoiceId,
					providerId: invoiceId,
					invoiceIdsByProvider: { razorpay: invoiceId },
					amountPaid: amount,
					amountDue: 0,
					amountDiscount: 0,
					subtotal: amount,
					total: amount,
					currency,
					status: 'paid',
					paymentIntentId: typeof paymentEntity?.id === 'string' ? paymentEntity.id : undefined,
					subscriptionId,
					customerId: typeof paymentEntity?.customer_id === 'string' ? paymentEntity.customer_id : undefined,
					metadata: augmentedNotes,
				};
				return { type: 'invoice.payment_succeeded', payload: invoice, originalEvent: evt };
			}

			const payment: StandardizedPayment = {
				id: typeof paymentEntity?.id === 'string' ? paymentEntity.id : 'payment',
				amount: typeof paymentEntity?.amount === 'number' ? paymentEntity.amount : 0,
				currency: typeof paymentEntity?.currency === 'string' ? paymentEntity.currency : 'INR',
				status: 'succeeded',
				providerId: typeof paymentEntity?.id === 'string' ? paymentEntity.id : undefined,
				metadata: augmentedNotes,
				userId,
			};
			return { type: 'payment.succeeded', payload: payment, originalEvent: evt };
		}

		if (eventName === 'payment.failed') {
			const subscriptionId = typeof paymentEntity?.subscription_id === 'string' ? paymentEntity.subscription_id : undefined;
			const invoiceId =
				typeof paymentEntity?.invoice_id === 'string'
					? paymentEntity.invoice_id
					: typeof paymentEntity?.order_id === 'string'
						? paymentEntity.order_id
						: (typeof paymentEntity?.id === 'string' ? paymentEntity.id : 'invoice');

			// Subscription failures should route through invoice.payment_failed so we can update
			// subscription state without requiring userId metadata/notes.
			if (subscriptionId) {
				const amount = typeof paymentEntity?.amount === 'number' ? paymentEntity.amount : 0;
				const currency = typeof paymentEntity?.currency === 'string' ? paymentEntity.currency : 'INR';
				const invoice: import('../types').StandardizedInvoice = {
					id: invoiceId,
					providerId: invoiceId,
					invoiceIdsByProvider: { razorpay: invoiceId },
					amountPaid: 0,
					amountDue: amount,
					amountDiscount: 0,
					subtotal: amount,
					total: amount,
					currency,
					status: 'unpaid',
					paymentIntentId: typeof paymentEntity?.id === 'string' ? paymentEntity.id : undefined,
					subscriptionId,
					customerId: typeof paymentEntity?.customer_id === 'string' ? paymentEntity.customer_id : undefined,
					metadata: augmentedNotes,
				};
				return { type: 'invoice.payment_failed', payload: invoice, originalEvent: evt };
			}

			const failed: import('../types').StandardizedPaymentFailed = {
				id: typeof paymentEntity?.id === 'string' ? paymentEntity.id : 'payment',
				amount: typeof paymentEntity?.amount === 'number' ? paymentEntity.amount : 0,
				currency: typeof paymentEntity?.currency === 'string' ? paymentEntity.currency : 'INR',
				status: 'failed',
				errorMessage: 'Razorpay payment failed',
				customerId: typeof paymentEntity?.customer_id === 'string' ? paymentEntity.customer_id : undefined,
				subscriptionId: undefined,
				metadata: augmentedNotes,
				userId,
			};
			return { type: 'payment.failed', payload: failed, originalEvent: evt };
		}

		// Ignore everything else for now.
		void mode;
		return { type: 'other', payload: (evtRecord || {}) as Record<string, unknown>, originalEvent: evtRecord || evt };
	}

	// ============== Admin / Catalog ==============

	async createProduct(options: CreateProductOptions): Promise<string> {
		// Map "product" to Razorpay Item.
		const payload: Record<string, unknown> = {
			name: options.name,
			description: options.description || options.name,
		};
		const res = await this.request<RazorpayItem>('/items', { method: 'POST', body: JSON.stringify(payload) });
		return res.id;
	}

	async updateProduct(productId: string, options: UpdateProductOptions): Promise<void> {
		if (!productId) throw new PaymentProviderError('Missing product id');
		const payload: Record<string, unknown> = {};
		if (typeof options.name === 'string') payload.name = options.name;
		if (typeof options.description === 'string') payload.description = options.description;
		if (!Object.keys(payload).length) return;
		await this.request(`/items/${encodeURIComponent(productId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
	}

	async findProduct(_name: string): Promise<string | null> {
		void _name;
		// Razorpay item search is not a simple name lookup via API without listing.
		return null;
	}

	async createPrice(options: CreatePriceOptions): Promise<PriceDetails> {
		// Map "price" to Razorpay Plan.
		const recurring = options.recurring;
		if (!recurring) {
			// Razorpay Plans are for subscriptions; for one-time use Payment Links.
			throw new PaymentProviderError('Razorpay does not support one-time catalog prices; use amount-based checkout');
		}

		const normalizedCurrency = String(options.currency || process.env.RAZORPAY_CURRENCY || 'INR')
			.trim()
			.replace(/^['\"]|['\"]$/g, '')
			.toUpperCase() || 'INR';

		const periodMap: Record<string, string> = {
			day: 'daily',
			week: 'weekly',
			month: 'monthly',
			year: 'yearly',
		};

		const period = periodMap[recurring.interval] || 'monthly';
		const intervalCount = Math.max(1, Math.floor(recurring.intervalCount || 1));
		// Razorpay enforces minimum interval constraints for some periods (e.g., daily requires >= 7).
		// Our app generally models "interval" without a count; defaulting to 1 would create invalid plans.
		if (period === 'daily' && intervalCount < 7) {
			throw new PaymentProviderError(
				'Razorpay does not support daily billing intervals below 7 days. Use weekly/monthly/yearly, or add intervalCount support.',
			);
		}

		const item: Record<string, unknown> = {
			name: options.metadata?.name || 'Plan',
			amount: Math.round(options.unitAmount),
			currency: normalizedCurrency,
			description: options.metadata?.description || undefined,
		};

		// If a provider-side Item exists, link it. Otherwise, let Razorpay create one.
		if (typeof options.productId === 'string' && options.productId.trim()) {
			item.id = options.productId;
		}

		const payload: Record<string, unknown> = {
			period,
			interval: intervalCount,
			item,
		};

		const res = await this.request<RazorpayPlan>('/plans', { method: 'POST', body: JSON.stringify(payload) });

		return {
			id: res.id,
			unitAmount: res.amount,
			currency: res.currency,
			recurring: {
				interval: recurring.interval,
				intervalCount: Math.max(1, Math.floor(recurring.intervalCount || 1)),
			},
			productId: res.item?.id || options.productId,
			type: 'recurring',
		};
	}

	async verifyPrice(priceId: string): Promise<PriceDetails> {
		if (!priceId) throw new PaymentProviderError('Missing price id');
		const plan = await this.request<RazorpayPlan>(`/plans/${encodeURIComponent(priceId)}`, { method: 'GET' });

		const intervalMap: Record<string, 'day' | 'week' | 'month' | 'year'> = {
			daily: 'day',
			weekly: 'week',
			monthly: 'month',
			yearly: 'year',
		};
		const interval = intervalMap[plan.period] || 'month';

		return {
			id: plan.id,
			unitAmount: plan.amount,
			currency: plan.currency,
			recurring: { interval, intervalCount: plan.interval || 1 },
			productId: plan.item?.id || null,
			type: 'recurring',
		};
	}

	async archivePrice(priceId: string): Promise<void> {
		// Razorpay does not provide a simple "archive plan" API akin to Stripe prices.
		void priceId;
	}

	async createCoupon(_opts: CreateCouponOptions): Promise<string> {
		void _opts;
		throw new PaymentProviderError('Razorpay coupons/promotion codes are not implemented yet');
	}

	async deleteCoupon(_couponId: string): Promise<void> {
		void _couponId;
		throw new PaymentProviderError('Razorpay coupons are not implemented yet');
	}

	async createPromotionCode(_opts: CreatePromotionCodeOptions): Promise<string> {
		void _opts;
		throw new PaymentProviderError('Razorpay promotion codes are not implemented yet');
	}

	async updatePromotionCode(_id: string, _active: boolean): Promise<void> {
		void _id;
		void _active;
		throw new PaymentProviderError('Razorpay promotion codes are not implemented yet');
	}

	// ============== Proration & Updates ==============

	async getProrationPreview(_subscriptionId: string, _newPriceId: string, _userId: string): Promise<ProrationPreviewResult> {
		void _subscriptionId;
		void _newPriceId;
		void _userId;
		throw new PaymentProviderError('Razorpay proration preview is not implemented yet');
	}

	async updateSubscriptionPlan(_subscriptionId: string, _newPriceId: string, _userId: string): Promise<SubscriptionUpdateResult> {
		void _userId;
		if (!_subscriptionId) throw new PaymentProviderError('Missing subscription id');
		if (!_newPriceId) throw new PaymentProviderError('Missing new plan id');

		const payload: Record<string, unknown> = {
			plan_id: _newPriceId,
			// Explicitly set to avoid ambiguity.
			schedule_change_at: 'now',
		};

		const sub = await this.request<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(_subscriptionId)}`, {
			method: 'PATCH',
			body: JSON.stringify(payload),
		});

		const newPeriodEnd = toSecondsDate(sub.current_end) || toSecondsDate(sub.end_at) || undefined;
		return {
			success: true,
			newPeriodEnd,
		};
	}

	async scheduleSubscriptionPlanChange(_subscriptionId: string, _newPriceId: string, _userId: string): Promise<SubscriptionUpdateResult> {
		void _userId;
		if (!_subscriptionId) throw new PaymentProviderError('Missing subscription id');
		if (!_newPriceId) throw new PaymentProviderError('Missing new plan id');

		const payload: Record<string, unknown> = {
			plan_id: _newPriceId,
			schedule_change_at: 'cycle_end',
		};

		const sub = await this.request<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(_subscriptionId)}`, {
			method: 'PATCH',
			body: JSON.stringify(payload),
		});

		const newPeriodEnd = toSecondsDate(sub.current_end) || toSecondsDate(sub.end_at) || undefined;
		return {
			success: true,
			newPeriodEnd,
		};
	}

	// ============== Billing & Refunds ==============

	async refundPayment(paymentId: string, amount?: number, _reason?: string): Promise<{ id: string; amount: number; status: string; created: Date }> {
		void _reason;
		if (!paymentId) throw new PaymentProviderError('Missing payment id');

		// Razorpay refund API only accepts pay_ prefixed payment IDs.
		// Payments created via the subscription fallback path may have stored a
		// subscription (sub_) or order (order_) ID instead. Attempt resolution.
		let resolvedPaymentId = paymentId;

		if (!paymentId.startsWith('pay_')) {
			if (paymentId.startsWith('order_')) {
				// Fetch payments associated with this order and pick the captured one.
				try {
					const orderPayments = await this.request<{ items?: Array<{ id: string; status?: string }> }>(
						`/orders/${encodeURIComponent(paymentId)}/payments`,
						{ method: 'GET' },
					);
					const items = Array.isArray(orderPayments?.items) ? orderPayments.items : (Array.isArray(orderPayments) ? (orderPayments as unknown as Array<{ id: string; status?: string }>) : []);
					const captured = items.find(p => p.status === 'captured') || items[0];
					if (captured?.id?.startsWith('pay_')) {
						resolvedPaymentId = captured.id;
					}
				} catch {
					// Best-effort; fall through to validation below.
				}
			}

			if (!resolvedPaymentId.startsWith('pay_')) {
				throw new PaymentProviderError(
					`Cannot refund: "${paymentId}" is not a valid Razorpay payment ID (expected pay_ prefix). ` +
					'The stored payment reference may be a subscription or order ID. ' +
					'Please locate the actual Razorpay payment ID (pay_xxx) for this transaction.',
				);
			}
		}

		const payload: Record<string, unknown> = {};
		if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) payload.amount = Math.round(amount);

		const refund = await this.request<RazorpayRefund>(`/payments/${encodeURIComponent(resolvedPaymentId)}/refund`, {
			method: 'POST',
			body: JSON.stringify(payload),
		});

		return {
			id: refund.id,
			amount: refund.amount,
			status: refund.status,
			created: toSecondsDate(refund.created_at) || new Date(),
		};
	}

	async getRefundDetails(refundId: string): Promise<{ id: string; amount: number; status: string; created: Date } | null> {
		if (!refundId) return null;
		const refund = await this.request<RazorpayRefund>(`/refunds/${encodeURIComponent(refundId)}`, { method: 'GET' });
		return {
			id: refund.id,
			amount: refund.amount,
			status: refund.status,
			created: toSecondsDate(refund.created_at) || new Date(),
		};
	}

	async getPaymentReceiptUrl(_paymentId: string): Promise<string | null> {
		void _paymentId;
		return null;
	}

	async getInvoiceUrl(_invoiceId: string): Promise<string | null> {
		void _invoiceId;
		return null;
	}

	getDashboardUrl(_type: 'payment' | 'subscription' | 'customer', _id: string): string {
		void _type;
		void _id;
		// Razorpay dashboard URLs vary by account and are not stable as simple patterns.
		return 'https://dashboard.razorpay.com';
	}

	// ============== Elements / Embedded Checkout ==============

	async createPaymentIntent(_opts: CheckoutOptions): Promise<{ clientSecret: string; paymentIntentId: string }> {
		const opts = _opts;
		if (!opts.amount || !Number.isFinite(opts.amount) || opts.amount <= 0) {
			throw new PaymentProviderError('Razorpay payment checkout requires a positive amount');
		}

		const currency = String(opts.currency || process.env.RAZORPAY_CURRENCY || 'INR')
			.trim()
			.replace(/^['"]|['"]$/g, '')
			.toUpperCase();
		const metadata: Record<string, string> = {
			userId: opts.userId,
			checkoutMode: 'payment',
			...(opts.metadata || {}),
		};
		if (opts.dedupeKey) metadata.dedupeKey = opts.dedupeKey;
		if (opts.priceId) metadata.priceId = opts.priceId;

		const payload: Record<string, unknown> = {
			amount: Math.round(opts.amount),
			currency,
			receipt: opts.dedupeKey || metadata.dedupeKey || undefined,
			payment_capture: 1,
			notes: metadata,
		};

		const res = await this.request<RazorpayEnvelope<RazorpayOrder>>('/orders', {
			method: 'POST',
			body: JSON.stringify(payload),
		});

		return {
			clientSecret: res.id,
			paymentIntentId: res.id,
		};
	}

	async createSubscriptionIntent(_opts: CheckoutOptions): Promise<{ clientSecret: string; subscriptionId: string }> {
		const opts = _opts;
		if (!opts.priceId) {
			throw new PaymentProviderError('Razorpay subscription checkout requires a priceId (plan_id)');
		}

		const metadata: Record<string, string> = {
			userId: opts.userId,
			...(opts.metadata || {}),
		};
		if (opts.dedupeKey) metadata.dedupeKey = opts.dedupeKey;
		if (opts.mode) metadata.checkoutMode = opts.mode;
		if (opts.priceId) metadata.priceId = opts.priceId;

		const payload: Record<string, unknown> = {
			plan_id: opts.priceId,
			// Razorpay requires total_count. Use a large number as "until canceled" semantics.
			total_count: 1200,
			quantity: 1,
			customer_notify: 1,
			notes: metadata,
		};

		const offerId = typeof opts.metadata?.razorpayOfferId === 'string' ? opts.metadata.razorpayOfferId.trim() : '';
		const enableOffers = process.env.RAZORPAY_ENABLE_OFFERS === 'true';
		if (enableOffers && offerId && /^offer_[A-Za-z0-9]+$/.test(offerId)) {
			payload.offer_id = offerId;
		}

		let res: RazorpayEnvelope<RazorpaySubscription>;
		try {
			res = await this.request<RazorpayEnvelope<RazorpaySubscription>>('/subscriptions', {
				method: 'POST',
				body: JSON.stringify(payload),
			});
		} catch (err) {
			if (payload.offer_id && this.isOfferIdFieldUnsupported(err)) {
				const retryPayload: Record<string, unknown> = { ...payload };
				delete retryPayload['offer_id'];
				res = await this.request<RazorpayEnvelope<RazorpaySubscription>>('/subscriptions', {
					method: 'POST',
					body: JSON.stringify(retryPayload),
				});
			} else {
				throw err;
			}
		}

		return {
			clientSecret: res.id,
			subscriptionId: res.id,
		};
	}

	async getPaymentIntent(_paymentIntentId: string): Promise<PaymentIntentDetails> {
		if (!_paymentIntentId) throw new PaymentProviderError('Missing Razorpay order id');
		const order = await this.request<RazorpayOrder>(`/orders/${encodeURIComponent(_paymentIntentId)}`, { method: 'GET' });
		const status = (order.status || '').toLowerCase();
		return {
			id: order.id,
			status: status === 'paid'
				? 'succeeded'
				: status === 'attempted'
					? 'processing'
					: 'requires_payment_method',
			amount: typeof order.amount === 'number' ? order.amount : 0,
			currency: order.currency || 'INR',
			metadata: toStringRecord(order.notes),
		};
	}
}
