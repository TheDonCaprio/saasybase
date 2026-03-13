/**
 * Paddle Billing (v2) Payment Provider Implementation
 *
 * Uses Paddle API + webhooks to normalize events into the app's standardized
 * payment/subscription events.
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
	StandardizedPaymentFailed,
	StandardizedSubscription,
	StandardizedWebhookEvent,
	SubscriptionDetails,
	SubscriptionResult,
	SubscriptionUpdateResult,
	UpdateProductOptions,
} from '../types';
import { ConfigurationError, PaymentProviderError, WebhookSignatureVerificationError } from '../errors';
import { asRecord } from '../../runtime-guards';
import { Logger } from '../../logger';

type PaddleEnvelope<T> = {
	data: T;
	meta?: { request_id?: string };
};

type PaddleWebhookEvent = {
	event_id: string;
	event_type: string;
	occurred_at: string;
	data: unknown;
};

type PaddleTransaction = {
	id: string; // txn_
	status: string;
	customer_id: string | null;
	subscription_id: string | null;
	origin?: string | null;
	invoice_id?: string | null;
	invoice_number?: string | null;
	currency_code: string;
	custom_data?: Record<string, unknown> | null;
	items?: Array<{ price_id?: string; quantity?: number }>; // simplified
	details?: {
		line_items?: Array<{
			quantity?: number;
			price?: { id?: string };
			totals?: { total?: string };
		}>;
		totals?: {
			total?: string;
			subtotal?: string;
			discount?: string;
		};
	};
	checkout?: { url?: string | null } | null;
};

type PaddleSubscription = {
	id: string; // sub_
	status: string;
	customer_id: string;
	currency_code: string;
	canceled_at?: string | null;
	current_billing_period?: { starts_at: string; ends_at: string } | null;
	scheduled_change?: { action?: string; effective_at?: string } | null;
	custom_data?: Record<string, unknown> | null;
	items?: Array<{ price?: { id?: string } }>; // simplified
};

type PaddleCustomer = {
	id: string; // ctm_
	email: string;
	name?: string | null;
	custom_data?: Record<string, unknown> | null;
};

type PaddleProduct = {
	id: string; // pro_
	name: string;
	description?: string | null;
};

type PaddlePrice = {
	id: string; // pri_
	product_id: string;
	status?: string;
	unit_price?: { amount: string; currency_code: string };
	billing_cycle?: { interval: string; frequency: number } | null;
};

type PaddleDiscount = {
	id: string; // dsc_
	status: string;
	description: string;
	enabled_for_checkout: boolean;
	code?: string | null;
	type: 'percentage' | 'flat' | 'flat_per_seat' | string;
	amount: string;
	currency_code?: string | null;
	recur?: boolean;
	maximum_recurring_intervals?: number | null;
	expires_at?: string | null;
	custom_data?: Record<string, unknown> | null;
};

function parseAmount(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
	if (typeof value === 'string') {
		const n = Number(value);
		if (Number.isFinite(n)) return Math.round(n);
	}
	return null;
}

function toStringRecord(input: unknown): Record<string, string> | undefined {
	const record = asRecord(input);
	if (!record) return undefined;

	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(record)) {
		if (typeof value === 'string') {
			out[key] = value;
			continue;
		}
		if (typeof value === 'number' || typeof value === 'boolean') {
			out[key] = String(value);
			continue;
		}
		if (value === null || value === undefined) continue;
		try {
			out[key] = JSON.stringify(value);
		} catch {
			out[key] = String(value);
		}
	}

	return Object.keys(out).length > 0 ? out : undefined;
}

function pickFirstString(...candidates: Array<unknown>): string | undefined {
	for (const c of candidates) {
		if (typeof c === 'string' && c.trim()) return c;
	}
	return undefined;
}

function isPaddleRecurringRenewalTransaction(txn: PaddleTransaction): boolean {
	return txn.origin === 'subscription_recurring' && typeof txn.subscription_id === 'string' && txn.subscription_id.length > 0;
}

function buildInvoiceLineItems(txn: PaddleTransaction): Array<{
	priceId?: string;
	priceIdsByProvider?: { paddle: string };
	amount: number;
}> | undefined {
	const lineItems = txn.details?.line_items;
	if (!Array.isArray(lineItems) || lineItems.length === 0) return undefined;

	const normalized = lineItems
		.map((item) => {
			const priceId = typeof item?.price?.id === 'string' ? item.price.id : undefined;
			const amount = parseAmount(item?.totals?.total) ?? 0;
			return {
				priceId,
				priceIdsByProvider: priceId ? { paddle: priceId } : undefined,
				amount,
			};
		})
		.filter((item) => item.amount > 0 || item.priceId);

	return normalized.length > 0 ? normalized : undefined;
}

export class PaddlePaymentProvider implements PaymentProvider {
	name = 'paddle';
	private static readonly DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;
	private apiKey: string;
	private apiBaseUrl: string;
	private debugSubscriptionUpdates: boolean;

	constructor(apiKey: string) {
		if (!apiKey) throw new ConfigurationError('Paddle API key is missing');
		this.apiKey = apiKey;
		this.debugSubscriptionUpdates = process.env.PADDLE_DEBUG_SUBSCRIPTION_UPDATES === '1';

		const explicit = process.env.PADDLE_API_BASE_URL;
		if (explicit) {
			this.apiBaseUrl = explicit.replace(/\/$/, '');
			return;
		}

		const env = (process.env.PADDLE_ENV || '').toLowerCase();
		const isSandbox = env === 'sandbox' || process.env.PADDLE_SANDBOX === '1';
		this.apiBaseUrl = isSandbox ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
	}

	private getSubscriptionItemSummaries(subscription: unknown): Array<{ priceId: string; quantity: number }> {
		const data = asRecord(subscription) || {};
		const rawItems = Array.isArray(data.items) ? data.items : [];
		return rawItems
			.map((item) => {
				const rec = asRecord(item) || {};
				const priceRec = asRecord(rec.price) || {};
				const priceId = typeof priceRec.id === 'string' ? priceRec.id : null;
				const quantityRaw = rec.quantity;
				const quantity = typeof quantityRaw === 'number' && Number.isFinite(quantityRaw)
					? Math.max(1, Math.floor(quantityRaw))
					: 1;
				return priceId ? ({ priceId, quantity }) : null;
			})
			.filter(Boolean) as Array<{ priceId: string; quantity: number }>;
	}

	private summarizeItemIds(items: Array<{ priceId: string; quantity: number }>): Array<{ priceId: string; quantity: number }> {
		// Keep log payloads small and safe.
		return items.slice(0, 10);
	}

	getWebhookSignatureHeader(): string {
		return 'paddle-signature';
	}

	supportsFeature(feature: PaymentProviderFeature): boolean {
		const supported: PaymentProviderFeature[] = [
			'webhooks',
			'coupons',
			'promotion_codes',
			'refunds',
			'customer_portal',
			'proration',
			'subscription_updates',
		];
		return supported.includes(feature);
	}

	private buildUpdatedSubscriptionItems(
		subscription: unknown,
		newPriceId: string,
	): Array<{ price_id: string; quantity: number }> {
		const parsedItems = this.getSubscriptionItemSummaries(subscription).map((i) => ({ price_id: i.priceId, quantity: i.quantity }));

		if (parsedItems.length === 0) {
			throw new PaymentProviderError('SUBSCRIPTION_ITEMS_NOT_FOUND');
		}

		// We currently don't support add-ons or seat-based quantities.
		// Always collapse to a single item with quantity=1 to avoid unintended doubled renewals.
		return [{ price_id: newPriceId, quantity: 1 }];
	}

	private async request<T>(path: string, init?: RequestInit): Promise<T> {
		const url = `${this.apiBaseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
		const res = await fetch(url, {
			...init,
			headers: {
				'Authorization': `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
				...(init?.headers || {}),
			},
		});

		let body: unknown = null;
		try {
			body = await res.json();
		} catch {
			body = null;
		}

		if (!res.ok) {
			const bodyRecord = asRecord(body) || {};
			const errorRecord = asRecord(bodyRecord.error) || {};
			const msg = typeof errorRecord.detail === 'string'
				? errorRecord.detail
				: typeof errorRecord.message === 'string'
					? errorRecord.message
					: typeof bodyRecord.message === 'string'
						? bodyRecord.message
						: `Paddle API request failed (${res.status})`;
			throw new PaymentProviderError(msg, body);
		}

		return (body as T) ?? ({} as T);
	}

	// Checkout
	async createCheckoutSession(opts: CheckoutOptions): Promise<CheckoutSessionResult> {
		if (!opts.priceId) {
			throw new PaymentProviderError('Paddle checkout requires a catalog priceId (pri_...)');
		}

		let customerId = opts.customerId;
		if (!customerId) {
			const email = opts.customerEmail;
			if (!email) {
				throw new PaymentProviderError('Paddle checkout requires a customerId (ctm_...) or customerEmail');
			}
			// Create customer on-demand. Mapping will be persisted by webhook processing.
			customerId = await this.createCustomer(opts.userId, email);
		}

		try {
			const customData: Record<string, unknown> = {
				...(opts.metadata || {}),
				userId: opts.userId,
			};
			if (opts.dedupeKey) customData.dedupeKey = opts.dedupeKey;

			// For catalog purchases, Paddle infers currency from the price.
			// Passing a mismatched currency_code (e.g. NGN from another provider) can cause a 4xx.
			const currencyCode = undefined;

			const body: Record<string, unknown> = {
				items: [{ price_id: opts.priceId, quantity: 1 }],
				customer_id: customerId,
				currency_code: currencyCode,
				custom_data: customData,
			};

			// Paddle discounts can be applied to a transaction by discount_id (dsc_...).
			// We reuse CheckoutOptions.promotionCodeId to carry the provider discount id.
			if (opts.promotionCodeId) {
				body.discount_id = opts.promotionCodeId;
			}

			const response = await this.request<PaddleEnvelope<PaddleTransaction>>('/transactions', {
				method: 'POST',
				body: JSON.stringify(body),
			});

			const txn = response.data;
			return {
				id: txn.id,
				url: txn.checkout?.url || null,
			};
		} catch (err) {
			// Preserve Paddle's original validation/config error message when available.
			if (err instanceof PaymentProviderError) throw err;
			throw new PaymentProviderError('Failed to create Paddle checkout transaction', err);
		}
	}

	async getCheckoutSession(sessionId: string): Promise<CheckoutSessionDetails> {
		try {
			const response = await this.request<PaddleEnvelope<PaddleTransaction>>(`/transactions/${encodeURIComponent(sessionId)}`);
			const txn = response.data;

			const totals = txn.details?.totals;
			const amountTotal = parseAmount(totals?.total);
			const amountSubtotal = parseAmount(totals?.subtotal);

			return {
				id: txn.id,
				clientReferenceId: undefined,
				metadata: toStringRecord(txn.custom_data),
				paymentIntentId: txn.id,
				subscriptionId: txn.subscription_id || undefined,
				amountTotal: amountTotal ?? undefined,
				amountSubtotal: amountSubtotal ?? undefined,
				amountDiscount: parseAmount(totals?.discount) ?? undefined,
				paymentStatus: txn.status,
				lineItems: (txn.items || []).map(i => ({ priceId: i.price_id })),
			};
		} catch (err) {
			throw new PaymentProviderError(`Failed to get Paddle transaction ${sessionId}`, err);
		}
	}

	// Customer Management
	async createCustomer(userId: string, email: string, name?: string): Promise<string> {
		try {
			const response = await this.request<PaddleEnvelope<PaddleCustomer>>('/customers', {
				method: 'POST',
				body: JSON.stringify({
					email,
					name: name || null,
					custom_data: { userId },
				}),
			});
			return response.data.id;
		} catch (err) {
			// Paddle returns a 409-ish request_error with code=customer_already_exists
			// when a customer with this email already exists.
			// In that case, we can safely reuse the existing customer id.
			if (err instanceof PaymentProviderError) {
				const root = asRecord(err.originalError) || {};
				const providerError = asRecord(root.error) || {};
				const code = typeof providerError.code === 'string' ? providerError.code : '';
				if (code === 'customer_already_exists') {
					const detail = typeof providerError.detail === 'string'
						? providerError.detail
						: typeof providerError.message === 'string'
							? providerError.message
							: '';
					const match = detail.match(/\bctm_[a-z0-9]+\b/i);
					if (match?.[0]) {
						return match[0];
					}
				}
			}
			throw new PaymentProviderError('Failed to create Paddle customer', err);
		}
	}

	async updateCustomer(customerId: string, data: { email?: string; name?: string }): Promise<void> {
		try {
			await this.request<PaddleEnvelope<PaddleCustomer>>(`/customers/${encodeURIComponent(customerId)}`, {
				method: 'PATCH',
				body: JSON.stringify({
					email: data.email,
					name: data.name,
				}),
			});
		} catch (err) {
			throw new PaymentProviderError('Failed to update Paddle customer', err);
		}
	}

	async createCustomerPortalSession(_customerId: string, _returnUrl: string): Promise<string> {
		if (typeof _customerId !== 'string' || !_customerId.startsWith('ctm_')) {
			throw new PaymentProviderError('Paddle customer portal requires a customer id (ctm_...)');
		}
		void _returnUrl;

		try {
			const response = await this.request<PaddleEnvelope<unknown>>(
				`/customers/${encodeURIComponent(_customerId)}/portal-sessions`,
				{
					method: 'POST',
					// Paddle validates this endpoint strictly and does not accept arbitrary fields.
					// As of current API behavior, return_url/returnUrl are rejected as unknown.
					// Use an empty body and rely on Paddle's portal configuration.
					body: JSON.stringify({}),
				},
			);

			const data = asRecord(response.data) || {};
			const urls = asRecord(data.urls) || {};
			const general = asRecord(urls.general) || urls;
			const url = pickFirstString(
				data.url,
				urls.url,
				general.url,
				general.overview,
				general.portal,
				general.href,
			);

			if (!url) {
				throw new PaymentProviderError('Paddle customer portal session created but no URL was returned');
			}

			return url;
		} catch (err) {
			// Preserve the underlying Paddle API error detail (request() already throws PaymentProviderError)
			// so callers/logs can see the actual reason (e.g. permissions, invalid params, missing feature).
			if (err instanceof PaymentProviderError) throw err;
			throw new PaymentProviderError('Failed to create Paddle customer portal session', err);
		}
	}

	// Subscription Management
	async cancelSubscription(subscriptionId: string, immediately?: boolean): Promise<SubscriptionResult> {
		try {
			const response = await this.request<PaddleEnvelope<PaddleSubscription>>(
				`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
				{
					method: 'POST',
					body: JSON.stringify({
						effective_from: immediately ? 'immediately' : undefined,
					}),
				},
			);
			const sub = response.data;

			return {
				id: sub.id,
				status: sub.status,
				canceledAt: sub.canceled_at ? new Date(sub.canceled_at) : null,
				expiresAt: sub.current_billing_period?.ends_at ? new Date(sub.current_billing_period.ends_at) : null,
				currentPeriodEnd: sub.current_billing_period?.ends_at ? new Date(sub.current_billing_period.ends_at) : null,
			};
		} catch (err) {
			throw new PaymentProviderError('Failed to cancel Paddle subscription', err);
		}
	}

	async undoCancelSubscription(subscriptionId: string): Promise<SubscriptionResult> {
		try {
			// Paddle allows removing a scheduled change by PATCHing scheduled_change: null
			const response = await this.request<PaddleEnvelope<PaddleSubscription>>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
				method: 'PATCH',
				body: JSON.stringify({
					scheduled_change: null,
				}),
			});
			const sub = response.data;
			return {
				id: sub.id,
				status: sub.status,
				canceledAt: sub.canceled_at ? new Date(sub.canceled_at) : null,
				expiresAt: sub.current_billing_period?.ends_at ? new Date(sub.current_billing_period.ends_at) : null,
				currentPeriodEnd: sub.current_billing_period?.ends_at ? new Date(sub.current_billing_period.ends_at) : null,
			};
		} catch (err) {
			throw new PaymentProviderError('Failed to undo Paddle subscription cancellation', err);
		}
	}

	async getSubscription(subscriptionId: string): Promise<SubscriptionDetails> {
		try {
			const response = await this.request<PaddleEnvelope<PaddleSubscription>>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
			const sub = response.data;

			const start = sub.current_billing_period?.starts_at
				? new Date(sub.current_billing_period.starts_at)
				: new Date();
			const end = sub.current_billing_period?.ends_at
				? new Date(sub.current_billing_period.ends_at)
				: new Date();

			const firstPriceId = sub.items?.[0]?.price?.id;

			return {
				id: sub.id,
				status: sub.status,
				providerId: sub.id,
				subscriptionIdsByProvider: { paddle: sub.id },
				currentPeriodStart: start,
				currentPeriodEnd: end,
				cancelAtPeriodEnd: sub.scheduled_change?.action === 'cancel',
				canceledAt: sub.canceled_at ? new Date(sub.canceled_at) : null,
				metadata: toStringRecord(sub.custom_data),
				priceId: firstPriceId,
				priceIdsByProvider: firstPriceId ? { paddle: firstPriceId } : undefined,
				customerId: sub.customer_id,
				customerIdsByProvider: { paddle: sub.customer_id },
				latestInvoice: null,
			};
		} catch (err) {
			throw new PaymentProviderError('Failed to retrieve Paddle subscription', err);
		}
	}

	// Webhooks
	async constructWebhookEvent(requestBody: Buffer, signatureHeader: string, secret: string): Promise<StandardizedWebhookEvent> {
		const signature = signatureHeader || '';
		const parsed = this.parsePaddleSignature(signature);
		if (!parsed) throw new WebhookSignatureVerificationError('Missing Paddle webhook signature parts');

		const timestampSeconds = Number(parsed.ts);
		if (!Number.isFinite(timestampSeconds)) {
			throw new WebhookSignatureVerificationError('Invalid Paddle webhook timestamp');
		}

		const toleranceSeconds = this.getWebhookToleranceSeconds();
		const nowSeconds = Math.floor(Date.now() / 1000);
		if (Math.abs(nowSeconds - Math.trunc(timestampSeconds)) > toleranceSeconds) {
			throw new WebhookSignatureVerificationError('Expired Paddle webhook signature');
		}

		// Paddle signs the raw request payload with a timestamp prefix.
		// Compute against raw bytes to avoid any accidental string normalization.
		const expected = crypto
			.createHmac('sha256', secret)
			.update(parsed.ts, 'utf8')
			.update(':', 'utf8')
			.update(requestBody)
			.digest('hex');

		const expectedBuf = Buffer.from(expected.toLowerCase(), 'utf8');
		const isValid = parsed.h1.some(h => {
			const actualBuf = Buffer.from(h.toLowerCase(), 'utf8');
			if (actualBuf.length !== expectedBuf.length) return false;
			return crypto.timingSafeEqual(actualBuf, expectedBuf);
		});

		if (!isValid) {
			throw new WebhookSignatureVerificationError('Invalid Paddle webhook signature');
		}

		let evt: PaddleWebhookEvent;
		try {
			evt = JSON.parse(requestBody.toString('utf8')) as PaddleWebhookEvent;
		} catch (err) {
			throw new PaymentProviderError('Failed to parse Paddle webhook JSON', err);
		}

		return this.normalizeWebhookEvent(evt);
	}

	private getWebhookToleranceSeconds(): number {
		const raw = Number(process.env.PADDLE_WEBHOOK_TOLERANCE_SECONDS);
		if (Number.isFinite(raw) && raw > 0) {
			return Math.trunc(raw);
		}

		return PaddlePaymentProvider.DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
	}

	private parsePaddleSignature(header: string): { ts: string; h1: string[] } | null {
		if (!header) return null;
		const parts = header.split(';').map(p => p.trim()).filter(Boolean);
		let ts: string | null = null;
		const h1: string[] = [];
		for (const p of parts) {
			const eq = p.indexOf('=');
			if (eq <= 0) continue;
			const k = p.slice(0, eq);
			const v = p.slice(eq + 1);
			if (!k || !v) continue;
			if (k === 'ts') ts = v;
			if (k === 'h1') {
				for (const candidate of v.split(',').map(s => s.trim()).filter(Boolean)) {
					h1.push(candidate);
				}
			}
		}
		if (!ts || h1.length === 0) return null;
		return { ts, h1 };
	}

	private normalizeWebhookEvent(event: PaddleWebhookEvent): StandardizedWebhookEvent {
		const type = event.event_type;

		switch (type) {
			case 'adjustment.created':
			case 'adjustment.updated': {
				// Paddle represents refunds as "adjustments" with action=refund.
				// Refund adjustments are often created as pending_approval and later updated to approved.
				// Our internal `refund.processed` handler marks a payment as REFUNDED immediately, so we
				// only emit a refund event for approved adjustments.
				const adj = asRecord(event.data) || {};
				const action = typeof adj.action === 'string' ? adj.action.toLowerCase() : '';
				if (action !== 'refund') {
					return { type: 'ignored', payload: adj, originalEvent: event };
				}

				const status = typeof adj.status === 'string' ? adj.status.toLowerCase() : '';
				if (status !== 'approved') {
					return { type: 'ignored', payload: adj, originalEvent: event };
				}

				const id = typeof adj.id === 'string' ? adj.id : '';
				const transactionId = typeof adj.transaction_id === 'string' ? adj.transaction_id : '';
				const currency = typeof adj.currency_code === 'string' ? adj.currency_code : 'USD';
				const totals = asRecord(adj.totals) || {};
				const amount = parseAmount(totals.total) ?? 0;
				const reason = typeof adj.reason === 'string' ? adj.reason : undefined;

				return {
					type: 'refund.processed',
					payload: {
						id: id || `refund_${transactionId || Date.now()}`,
						paymentIntentId: transactionId || undefined,
						amount,
						currency,
						status: 'succeeded',
						reason,
						metadata: {},
					},
					originalEvent: event,
				};
			}

			case 'transaction.completed': {
				const txn = event.data as PaddleTransaction;
				const custom = (txn.custom_data || {}) as Record<string, unknown>;
				const userId = pickFirstString(custom.userId);
				const amountTotal = parseAmount(txn.details?.totals?.total);
				const amountSubtotal = parseAmount(txn.details?.totals?.subtotal);
				const amountDiscount = parseAmount(txn.details?.totals?.discount) ?? 0;

				if (isPaddleRecurringRenewalTransaction(txn)) {
					const invoiceId = txn.invoice_id || txn.id;
					return {
						type: 'invoice.payment_succeeded',
						payload: {
							id: invoiceId,
							providerId: invoiceId,
							invoiceIdsByProvider: { paddle: invoiceId },
							amountPaid: amountTotal ?? 0,
							amountDue: 0,
							amountDiscount,
							subtotal: amountSubtotal ?? amountTotal ?? 0,
							total: amountTotal ?? 0,
							currency: txn.currency_code,
							status: 'paid',
							paymentIntentId: txn.id,
							subscriptionId: txn.subscription_id || undefined,
							customerId: txn.customer_id || undefined,
							metadata: toStringRecord(custom),
							lineItems: buildInvoiceLineItems(txn),
							billingReason: txn.origin || undefined,
						},
						originalEvent: event,
					};
				}

				const payload: StandardizedCheckoutSession = {
					id: txn.id,
					userId,
					customerId: txn.customer_id || undefined,
					customerIdsByProvider: txn.customer_id ? { paddle: txn.customer_id } : undefined,
					mode: txn.subscription_id ? 'subscription' : 'payment',
					providerId: txn.id,
					subscriptionId: txn.subscription_id || undefined,
					metadata: toStringRecord(custom),
					paymentIntentId: txn.id,
					transactionId: txn.id,
					amountTotal: amountTotal ?? undefined,
					amountSubtotal: amountSubtotal ?? undefined,
					currency: txn.currency_code,
					paymentStatus: 'paid',
					lineItems: (txn.items || []).map(i => ({
						priceId: i.price_id,
						priceIdsByProvider: i.price_id ? { paddle: i.price_id } : undefined,
						quantity: i.quantity,
					})),
				};

				return { type: 'checkout.completed', payload, originalEvent: event };
			}

			case 'subscription.created':
			case 'subscription.updated': {
				const sub = event.data as PaddleSubscription;
				const start = sub.current_billing_period?.starts_at
					? new Date(sub.current_billing_period.starts_at)
					: new Date();
				const end = sub.current_billing_period?.ends_at
					? new Date(sub.current_billing_period.ends_at)
					: new Date();

				const priceId = sub.items?.[0]?.price?.id;

				const payload: StandardizedSubscription = {
					id: sub.id,
					status: sub.status,
					providerId: sub.id,
					subscriptionIdsByProvider: { paddle: sub.id },
					currentPeriodStart: start,
					currentPeriodEnd: end,
					canceledAt: sub.canceled_at ? new Date(sub.canceled_at) : null,
					cancelAtPeriodEnd: sub.scheduled_change?.action === 'cancel',
					customerId: sub.customer_id,
					customerIdsByProvider: { paddle: sub.customer_id },
					priceId,
					priceIdsByProvider: priceId ? { paddle: priceId } : undefined,
					metadata: toStringRecord(sub.custom_data),
				};

				return {
					type: type === 'subscription.created' ? 'subscription.created' : 'subscription.updated',
					payload,
					originalEvent: event,
				};
			}

			case 'transaction.payment_failed': {
				const txn = event.data as PaddleTransaction;
				const custom = (txn.custom_data || {}) as Record<string, unknown>;
				const amountTotal = parseAmount(txn.details?.totals?.total) ?? 0;
				const amountSubtotal = parseAmount(txn.details?.totals?.subtotal) ?? amountTotal;
				const amountDiscount = parseAmount(txn.details?.totals?.discount) ?? 0;

				if (isPaddleRecurringRenewalTransaction(txn)) {
					const invoiceId = txn.invoice_id || txn.id;
					return {
						type: 'invoice.payment_failed',
						payload: {
							id: invoiceId,
							providerId: invoiceId,
							invoiceIdsByProvider: { paddle: invoiceId },
							amountPaid: 0,
							amountDue: amountTotal,
							amountDiscount,
							subtotal: amountSubtotal,
							total: amountTotal,
							currency: txn.currency_code,
							status: 'unpaid',
							paymentIntentId: txn.id,
							subscriptionId: txn.subscription_id || undefined,
							customerId: txn.customer_id || undefined,
							metadata: toStringRecord(custom),
							lineItems: buildInvoiceLineItems(txn),
							billingReason: txn.origin || undefined,
						},
						originalEvent: event,
					};
				}

				const payload: StandardizedPaymentFailed = {
					id: txn.id,
					status: 'failed',
					amount: amountTotal || undefined,
					currency: txn.currency_code,
					errorMessage: 'Paddle transaction payment failed',
					customerId: txn.customer_id || undefined,
					subscriptionId: txn.subscription_id || undefined,
					metadata: toStringRecord(custom),
					userId: pickFirstString(custom.userId),
				};
				return { type: 'payment.failed', payload, originalEvent: event };
			}

			default:
				return { type: 'ignored', payload: asRecord(event.data) || {}, originalEvent: event };
		}
	}

	// Admin / Product Management
	private getDefaultTaxCategory(): string {
		const cat = process.env.PADDLE_DEFAULT_TAX_CATEGORY || process.env.PADDLE_TAX_CATEGORY;
		if (!cat) {
			throw new ConfigurationError('Missing PADDLE_DEFAULT_TAX_CATEGORY (required to create products in Paddle)');
		}
		return cat;
	}

	async createProduct(options: CreateProductOptions): Promise<string> {
		try {
			const description = typeof options.description === 'string' && options.description.trim().length > 0
				? options.description
				: options.name;

			const response = await this.request<PaddleEnvelope<PaddleProduct>>('/products', {
				method: 'POST',
				body: JSON.stringify({
					name: options.name,
					description,
					tax_category: this.getDefaultTaxCategory(),
					custom_data: options.metadata || undefined,
				}),
			});
			return response.data.id;
		} catch (err) {
			throw new PaymentProviderError('Failed to create Paddle product', err);
		}
	}

	async updateProduct(productId: string, options: UpdateProductOptions): Promise<void> {
		try {
			await this.request<PaddleEnvelope<PaddleProduct>>(`/products/${encodeURIComponent(productId)}`, {
				method: 'PATCH',
				body: JSON.stringify({
					name: options.name,
					description: options.description,
					custom_data: options.metadata,
				}),
			});
		} catch (err) {
			throw new PaymentProviderError('Failed to update Paddle product', err);
		}
	}

	async findProduct(name: string): Promise<string | null> {
		try {
			const response = await this.request<PaddleEnvelope<PaddleProduct[]>>('/products');
			const match = response.data?.find(p => p.name === name);
			return match?.id || null;
		} catch {
			return null;
		}
	}

	async createPrice(options: CreatePriceOptions): Promise<PriceDetails> {
		try {
			const derivedDescription =
				(typeof options.metadata?.name === 'string' && options.metadata.name.trim().length > 0)
					? options.metadata.name
					: 'Plan price';

			const recurring = options.recurring
				? {
					billing_cycle: {
						interval: options.recurring.interval,
						frequency: options.recurring.intervalCount || 1,
					},
				}
				: {};

			// Prevent customers from changing quantities in overlay checkout by default.
			// Paddle defaults to 1-100 if omitted, which exposes a quantity stepper.
			const quantity = options.quantity || { minimum: 1, maximum: 1 };

			const response = await this.request<PaddleEnvelope<PaddlePrice>>('/prices', {
				method: 'POST',
				body: JSON.stringify({
					product_id: options.productId,
					description: derivedDescription,
					unit_price: {
						amount: String(Math.round(options.unitAmount)),
						currency_code: options.currency.toUpperCase(),
					},
					quantity: {
						minimum: Math.max(1, Math.floor(quantity.minimum)),
						maximum: Math.max(1, Math.floor(quantity.maximum)),
					},
					custom_data: options.metadata || undefined,
					...recurring,
				}),
			});

			const price = response.data;
			return {
				id: price.id,
				unitAmount: parseAmount(price.unit_price?.amount),
				currency: price.unit_price?.currency_code || null,
				recurring: price.billing_cycle
					? { interval: price.billing_cycle.interval, intervalCount: price.billing_cycle.frequency }
					: null,
				productId: price.product_id || null,
				type: price.billing_cycle ? 'recurring' : 'one_time',
			};
		} catch (err) {
			throw new PaymentProviderError('Failed to create Paddle price', err);
		}
	}

	async verifyPrice(priceId: string): Promise<PriceDetails> {
		try {
			const response = await this.request<PaddleEnvelope<PaddlePrice>>(`/prices/${encodeURIComponent(priceId)}`);
			const price = response.data;
			return {
				id: price.id,
				unitAmount: parseAmount(price.unit_price?.amount),
				currency: price.unit_price?.currency_code || null,
				recurring: price.billing_cycle
					? { interval: price.billing_cycle.interval, intervalCount: price.billing_cycle.frequency }
					: null,
				productId: price.product_id || null,
				type: price.billing_cycle ? 'recurring' : 'one_time',
			};
		} catch (err) {
			throw new PaymentProviderError('Failed to verify Paddle price', err);
		}
	}

	async archivePrice(priceId: string): Promise<void> {
		try {
			await this.request<PaddleEnvelope<PaddlePrice>>(`/prices/${encodeURIComponent(priceId)}`, {
				method: 'PATCH',
				body: JSON.stringify({ status: 'archived' }),
			});
		} catch (err) {
			throw new PaymentProviderError('Failed to archive Paddle price', err);
		}
	}

	async createCoupon(opts: CreateCouponOptions): Promise<string> {
		// Map our Stripe-like coupon model to Paddle discounts.
		// Stripe: coupon + promotion code
		// Paddle: discount (optionally with a code). We create the discount here and attach a code in createPromotionCode.
		try {
			const hasPercent = typeof opts.percentOff === 'number' && Number.isFinite(opts.percentOff);
			const hasAmount = typeof opts.amountOff === 'number' && Number.isFinite(opts.amountOff);
			if (!hasPercent && !hasAmount) {
				throw new PaymentProviderError('Coupon must specify percentOff or amountOff');
			}

			let type: 'percentage' | 'flat' = 'percentage';
			let amount: string;
			let currency_code: string | undefined;

			if (hasPercent) {
				type = 'percentage';
				amount = String(opts.percentOff);
			} else {
				type = 'flat';
				amount = String(Math.round(opts.amountOff!));
				currency_code = (opts.currency || 'USD').toUpperCase();
			}

			const recur = opts.duration === 'repeating' || opts.duration === 'forever';
			const maximum_recurring_intervals = opts.duration === 'repeating'
				? (typeof opts.durationInMonths === 'number' && Number.isFinite(opts.durationInMonths) ? Math.max(1, Math.floor(opts.durationInMonths)) : null)
				: (opts.duration === 'forever' ? null : undefined);

			const response = await this.request<PaddleEnvelope<PaddleDiscount>>('/discounts', {
				method: 'POST',
				body: JSON.stringify({
					type,
					amount,
					currency_code,
					description: 'App coupon',
					enabled_for_checkout: false,
					recur: recur ? true : false,
					maximum_recurring_intervals,
				}),
			});

			return response.data.id;
		} catch (err) {
			throw new PaymentProviderError('Failed to create Paddle discount for coupon', err);
		}
	}

	async deleteCoupon(couponId: string): Promise<void> {
		// Paddle doesn't delete discounts; archive them.
		try {
			await this.request<PaddleEnvelope<PaddleDiscount>>(`/discounts/${encodeURIComponent(couponId)}`, {
				method: 'PATCH',
				body: JSON.stringify({ status: 'archived' }),
			});
		} catch (err) {
			throw new PaymentProviderError('Failed to archive Paddle discount', err);
		}
	}

	async createPromotionCode(opts: CreatePromotionCodeOptions): Promise<string> {
		// Paddle codes live on the discount itself.
		// We enable checkout redemption and set the code.
		try {
			await this.request<PaddleEnvelope<PaddleDiscount>>(`/discounts/${encodeURIComponent(opts.couponId)}`, {
				method: 'PATCH',
				body: JSON.stringify({
					enabled_for_checkout: true,
					code: opts.code,
					expires_at: opts.expiresAt ? opts.expiresAt.toISOString() : undefined,
					custom_data: opts.metadata || undefined,
				}),
			});

			// Reuse discount id as the promotion code identifier for Paddle.
			return opts.couponId;
		} catch (err) {
			throw new PaymentProviderError('Failed to create Paddle discount code for coupon', err);
		}
	}

	async updatePromotionCode(id: string, active: boolean): Promise<void> {
		// Toggle redemption by archiving/reactivating the discount.
		// Note: Paddle treats this as discount status, not a separate promo entity.
		try {
			await this.request<PaddleEnvelope<PaddleDiscount>>(`/discounts/${encodeURIComponent(id)}`, {
				method: 'PATCH',
				body: JSON.stringify({
					status: active ? 'active' : 'archived',
					enabled_for_checkout: Boolean(active),
				}),
			});
		} catch (err) {
			throw new PaymentProviderError('Failed to update Paddle discount promotion state', err);
		}
	}

	// Proration & Updates
	async getProrationPreview(subscriptionId: string, newPriceId: string, userId: string): Promise<ProrationPreviewResult> {
		void userId;
		if (typeof subscriptionId !== 'string' || !subscriptionId.startsWith('sub_')) {
			throw new PaymentProviderError('Paddle proration preview requires a subscription id (sub_...)');
		}
		if (typeof newPriceId !== 'string' || !newPriceId.startsWith('pri_')) {
			throw new PaymentProviderError('Paddle proration preview requires a catalog price id (pri_...)');
		}
		try {
			const subResponse = await this.request<PaddleEnvelope<PaddleSubscription>>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
			const sub = subResponse.data;
			const updatedItems = this.buildUpdatedSubscriptionItems(sub, newPriceId);

			const previewResponse = await this.request<PaddleEnvelope<unknown>>(
				`/subscriptions/${encodeURIComponent(subscriptionId)}/preview`,
				{
					method: 'PATCH',
					body: JSON.stringify({
						proration_billing_mode: 'prorated_immediately',
						items: updatedItems,
					}),
				},
			);

			const data = asRecord(previewResponse.data) || {};
			const immediate = asRecord(data.immediate_transaction) || null;
			const details = immediate ? (asRecord(immediate.details) || {}) : {};
			const totals = asRecord(details.totals) || {};
			const amountDue = parseAmount(totals.total) ?? 0;
			const currency = typeof data.currency_code === 'string'
				? data.currency_code
				: (typeof sub.currency_code === 'string' ? sub.currency_code : 'USD');

			const rawLines = Array.isArray(details.line_items) ? details.line_items : [];
			const lineItems = rawLines.map((line) => {
				const rec = asRecord(line) || {};
				const desc = typeof rec.description === 'string'
					? rec.description
					: (typeof rec.name === 'string' ? rec.name : null);
				const lineTotals = asRecord(rec.totals) || {};
				const lineTotal = parseAmount(lineTotals.total) ?? 0;
				const proration = rec.proration != null;
				return { description: desc, amount: lineTotal, proration };
			});

			return {
				prorationEnabled: true,
				amountDue,
				currency,
				nextPaymentAttempt: null,
				lineItems,
			};
		} catch (err) {
			if (err instanceof PaymentProviderError) throw err;
			throw new PaymentProviderError('Failed to get Paddle proration preview', err);
		}
	}

	async updateSubscriptionPlan(subscriptionId: string, newPriceId: string, userId: string): Promise<SubscriptionUpdateResult> {
		void userId;
		if (typeof subscriptionId !== 'string' || !subscriptionId.startsWith('sub_')) {
			throw new PaymentProviderError('Paddle subscription update requires a subscription id (sub_...)');
		}
		if (typeof newPriceId !== 'string' || !newPriceId.startsWith('pri_')) {
			throw new PaymentProviderError('Paddle subscription update requires a catalog price id (pri_...)');
		}

		try {
			const subResponse = await this.request<PaddleEnvelope<PaddleSubscription>>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
			const sub = subResponse.data;
			const updatedItems = this.buildUpdatedSubscriptionItems(sub, newPriceId);

			// Best-effort: compute the expected immediate prorated charge for UI feedback.
			let expectedAmountPaid: number | undefined;
			try {
				const previewResponse = await this.request<PaddleEnvelope<unknown>>(
					`/subscriptions/${encodeURIComponent(subscriptionId)}/preview`,
					{
						method: 'PATCH',
						body: JSON.stringify({
							proration_billing_mode: 'prorated_immediately',
							items: updatedItems,
						}),
					},
				);
				const data = asRecord(previewResponse.data) || {};
				const immediate = asRecord(data.immediate_transaction) || null;
				const details = immediate ? (asRecord(immediate.details) || {}) : {};
				const totals = asRecord(details.totals) || {};
				expectedAmountPaid = parseAmount(totals.total) ?? undefined;
			} catch {
				expectedAmountPaid = undefined;
			}

			const updateResponse = await this.request<PaddleEnvelope<PaddleSubscription>>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
				method: 'PATCH',
				body: JSON.stringify({
					proration_billing_mode: 'prorated_immediately',
					items: updatedItems,
					on_payment_failure: 'prevent_change',
				}),
			});
			const updated = updateResponse.data;

			const endRaw = updated.current_billing_period?.ends_at || null;
			const nextRaw = (asRecord(updated as unknown)?.next_billed_at as unknown) || null;
			const newPeriodEnd = typeof endRaw === 'string'
				? new Date(endRaw)
				: (typeof nextRaw === 'string' ? new Date(nextRaw) : undefined);

			// Extract transaction ID from the immediate proration transaction.
			const updatedRaw = asRecord(updateResponse.data as unknown) || {};
			const immediateTxn = asRecord(updatedRaw.immediate_transaction);
			const transactionId = typeof immediateTxn?.id === 'string' ? immediateTxn.id : undefined;

			return {
				success: true,
				newPeriodEnd,
				amountPaid: expectedAmountPaid,
				invoiceId: transactionId,
			};
		} catch (err) {
			if (err instanceof PaymentProviderError) throw err;
			throw new PaymentProviderError('Failed to update Paddle subscription plan', err);
		}
	}

	async scheduleSubscriptionPlanChange(subscriptionId: string, newPriceId: string, userId: string): Promise<SubscriptionUpdateResult> {
		void userId;
		if (typeof subscriptionId !== 'string' || !subscriptionId.startsWith('sub_')) {
			throw new PaymentProviderError('Paddle scheduled plan change requires a subscription id (sub_...)');
		}
		if (typeof newPriceId !== 'string' || !newPriceId.startsWith('pri_')) {
			throw new PaymentProviderError('Paddle scheduled plan change requires a catalog price id (pri_...)');
		}

		try {
			const subResponse = await this.request<PaddleEnvelope<PaddleSubscription>>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
			const sub = subResponse.data;
			const beforeItems = this.getSubscriptionItemSummaries(sub);
			const updatedItems = this.buildUpdatedSubscriptionItems(sub, newPriceId);

			if (this.debugSubscriptionUpdates) {
				Logger.info('Paddle scheduled plan change: updating subscription items', {
					subscriptionId,
					newPriceId,
					beforeItems: this.summarizeItemIds(beforeItems),
					payloadItems: updatedItems,
				});
			}

			const patchBody = {
				// IMPORTANT: We use 'do_not_bill' instead of 'full_next_billing_period'.
				// With 'full_next_billing_period', Paddle appends new items alongside old ones
				// (deferring the billing delta to renewal) which causes doubled renewal charges.
				// With 'do_not_bill', Paddle replaces items immediately without any charge.
				// The next regular renewal then bills the new plan at full price — achieving
				// the same "switch at end of cycle" semantics without item duplication.
				proration_billing_mode: 'do_not_bill',
				items: updatedItems,
				on_payment_failure: 'prevent_change',
			} as const;

			let updateResponse = await this.request<PaddleEnvelope<PaddleSubscription>>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
				method: 'PATCH',
				body: JSON.stringify(patchBody),
			});
			let updated = updateResponse.data;

			// Defensive: if Paddle still reports multiple recurring items after a scheduled switch,
			// retry once with the same payload. If it still doesn't normalize, attempt to revert.
			const afterItems = this.getSubscriptionItemSummaries(updated);
			const hasMultiple = afterItems.length > 1;
			const hasUnexpectedPrice = afterItems.some((i) => i.priceId !== newPriceId);
			if (hasMultiple || hasUnexpectedPrice) {
				Logger.warn('Paddle scheduled plan change returned unexpected items; retrying once', {
					subscriptionId,
					newPriceId,
					afterItems: this.summarizeItemIds(afterItems),
					payloadItems: updatedItems,
				});

				updateResponse = await this.request<PaddleEnvelope<PaddleSubscription>>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
					method: 'PATCH',
					body: JSON.stringify(patchBody),
				});
				updated = updateResponse.data;

				const afterRetryItems = this.getSubscriptionItemSummaries(updated);
				const stillMultiple = afterRetryItems.length > 1;
				const stillUnexpected = afterRetryItems.some((i) => i.priceId !== newPriceId);
				if (stillMultiple || stillUnexpected) {
					Logger.error('Paddle scheduled plan change could not normalize subscription items; attempting revert', {
						subscriptionId,
						newPriceId,
						afterRetryItems: this.summarizeItemIds(afterRetryItems),
						beforeItems: this.summarizeItemIds(beforeItems),
					});

					try {
						await this.request<PaddleEnvelope<PaddleSubscription>>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
							method: 'PATCH',
							body: JSON.stringify({
								proration_billing_mode: 'do_not_bill',
								items: beforeItems.map((i) => ({ price_id: i.priceId, quantity: i.quantity })),
								on_payment_failure: 'prevent_change',
							}),
						});
					} catch (revertErr) {
						Logger.error('Paddle scheduled plan change revert failed', revertErr, { subscriptionId });
					}

					throw new PaymentProviderError('PADDLE_SUBSCRIPTION_ITEM_NORMALIZATION_FAILED');
				}
			}

			const endRaw = updated.current_billing_period?.ends_at || null;
			const nextRaw = (asRecord(updated as unknown)?.next_billed_at as unknown) || null;
			const newPeriodEnd = typeof endRaw === 'string'
				? new Date(endRaw)
				: (typeof nextRaw === 'string' ? new Date(nextRaw) : undefined);

			return {
				success: true,
				newPeriodEnd,
			};
		} catch (err) {
			if (err instanceof PaymentProviderError) throw err;
			throw new PaymentProviderError('Failed to schedule Paddle subscription plan change', err);
		}
	}

	// Billing & Refunds
	async refundPayment(_paymentId: string, _amount?: number, _reason?: string): Promise<{ id: string; amount: number; status: string; created: Date }> {
		void _amount; // Admin UI currently issues full refunds only.
		if (typeof _paymentId !== 'string' || !_paymentId.startsWith('txn_')) {
			throw new PaymentProviderError('Paddle refund requires a transaction id (txn_...)');
		}

		const reason = typeof _reason === 'string' && _reason.trim().length > 0
			? _reason.trim()
			: 'requested_by_customer';

		try {
			const response = await this.request<PaddleEnvelope<unknown>>('/adjustments', {
				method: 'POST',
				body: JSON.stringify({
					action: 'refund',
					transaction_id: _paymentId,
					reason,
					type: 'full',
				}),
			});

			const rec = asRecord(response.data) || {};
			const id = typeof rec.id === 'string' ? rec.id : `adj_${Date.now()}`;
			const status = typeof rec.status === 'string' ? rec.status : 'pending';
			const createdRaw = typeof rec.created_at === 'string' ? rec.created_at : null;
			const created = createdRaw ? new Date(createdRaw) : new Date();

			// Amounts on Paddle adjustments can be complex (items/tax). Our callers already know
			// the local payment amount for full refunds, so returning 0 here is acceptable.
			return { id, amount: 0, status, created };
		} catch (err) {
			throw new PaymentProviderError('Failed to refund Paddle transaction', err);
		}
	}

	async getRefundDetails(_paymentId: string): Promise<{ id: string; amount: number; status: string; created: Date } | null> {
		if (typeof _paymentId !== 'string' || !_paymentId.startsWith('txn_')) return null;
		try {
			const response = await this.request<PaddleEnvelope<unknown>>(
				`/adjustments?per_page=10&transaction_id=${encodeURIComponent(_paymentId)}`
			);
			const data = (response as unknown as { data?: unknown }).data;
			if (!Array.isArray(data)) return null;

			const refunds = data
				.map(item => asRecord(item) || {})
				.filter(r => (typeof r.action === 'string' ? r.action : '').toLowerCase() === 'refund');

			if (refunds.length === 0) return null;

			refunds.sort((a, b) => {
				const ad = typeof a.created_at === 'string' ? new Date(a.created_at).getTime() : 0;
				const bd = typeof b.created_at === 'string' ? new Date(b.created_at).getTime() : 0;
				return bd - ad;
			});

			const latest = refunds[0];
			const id = typeof latest.id === 'string' ? latest.id : '';
			if (!id) return null;
			const status = typeof latest.status === 'string' ? latest.status : 'unknown';
			const created = typeof latest.created_at === 'string' ? new Date(latest.created_at) : new Date();
			return { id, amount: 0, status, created };
		} catch (err) {
			throw new PaymentProviderError('Failed to retrieve Paddle refund details', err);
		}
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
		const env = (process.env.PADDLE_ENV || '').toLowerCase();
		const base = env === 'sandbox' ? 'https://sandbox-vendors.paddle.com' : 'https://vendors.paddle.com';
		const id = encodeURIComponent(_id);

		switch (_type) {
			case 'payment':
				return `${base}/transactions-v2/${id}`;
			case 'subscription':
				return `${base}/subscriptions-v2/${id}`;
			case 'customer':
				return `${base}/customers-v2/${id}`;
			default:
				return base;
		}
	}

	// Elements / Embedded Checkout
	async createPaymentIntent(_opts: CheckoutOptions): Promise<{ clientSecret: string; paymentIntentId: string }> {
		void _opts;
		throw new PaymentProviderError('Paddle does not support embedded Elements in this integration (redirect only)');
	}

	async createSubscriptionIntent(_opts: CheckoutOptions): Promise<{ clientSecret: string; subscriptionId: string }> {
		void _opts;
		throw new PaymentProviderError('Paddle does not support embedded Elements in this integration (redirect only)');
	}

	async getPaymentIntent(_paymentIntentId: string): Promise<PaymentIntentDetails> {
		void _paymentIntentId;
		throw new PaymentProviderError('Paddle PaymentIntent retrieval is not implemented');
	}
}
