/**
 * Lemon Squeezy Payment Provider (API v1)
 *
 * Status: ARCHIVED (kept for reference/tests).
 * This provider is not wired into the active provider registry or the centralized webhook/checkout routes.
 *
 * Notes:
 * - Webhook signature: `X-Signature` is an HMAC SHA256 hex digest of the raw request body.
 * - Discounts: Lemon Squeezy uses a single Discount object (with `code`) instead of Stripe's coupon + promotion code split....
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
	StandardizedInvoice,
	StandardizedRefund,
	StandardizedSubscription,
	StandardizedWebhookEvent,
	SubscriptionDetails,
	SubscriptionResult,
	SubscriptionUpdateResult,
	UpdateProductOptions,
} from '../types';
import { ConfigurationError, PaymentProviderError, WebhookSignatureVerificationError } from '../errors';
import { asRecord, getNestedNumber, getNestedString } from '../../runtime-guards';

type LemonJsonApiEnvelope<T> = {
	data?: T;
	meta?: Record<string, unknown>;
	errors?: unknown;
};

type LemonJsonApiResource<TAttrs extends Record<string, unknown> = Record<string, unknown>> = {
	type?: string;
	id?: string;
	attributes?: TAttrs;
	relationships?: Record<string, unknown>;
	links?: Record<string, unknown>;
};

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

function parseIsoDate(value: unknown): Date | null {
	if (typeof value !== 'string' || !value) return null;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
}

export class LemonSqueezyPaymentProvider implements PaymentProvider {
	name = 'lemonsqueezy';
	private apiKey: string;
	private baseUrl = 'https://api.lemonsqueezy.com/v1';

	constructor(apiKey: string) {
		if (!apiKey) throw new ConfigurationError('Lemon Squeezy API key is missing');
		this.apiKey = apiKey;
	}

	getWebhookSignatureHeader(): string {
		// Next.js normalizes header lookups; we use lowercase for consistency.
		return 'x-signature';
	}

	supportsFeature(feature: PaymentProviderFeature): boolean {
		const supported: PaymentProviderFeature[] = [
			'webhooks',
			'coupons',
			'promotion_codes',
			'customer_portal',
			'refunds',
			'receipts',
		];
		return supported.includes(feature);
	}

	private extractResource<TAttrs extends Record<string, unknown> = Record<string, unknown>>(
		res: unknown,
		errorMessage: string,
	): LemonJsonApiResource<TAttrs> {
		const maybeEnvelope = asRecord(res);
		const data = maybeEnvelope && 'data' in maybeEnvelope ? (maybeEnvelope as LemonJsonApiEnvelope<LemonJsonApiResource>).data : undefined;
		const resource = (data ?? res) as unknown;
		const r = asRecord(resource);
		if (!r) throw new PaymentProviderError(errorMessage);
		return r as LemonJsonApiResource<TAttrs>;
	}

	private getStoreId(): string {
		const storeId = process.env.LEMONSQUEEZY_STORE_ID;
		if (!storeId) throw new ConfigurationError('LEMONSQUEEZY_STORE_ID is not defined');
		return storeId;
	}

	private async request<T>(path: string, init: RequestInit): Promise<T> {
		const res = await fetch(`${this.baseUrl}${path}`, {
			...init,
			headers: {
				Accept: 'application/vnd.api+json',
				'Content-Type': 'application/vnd.api+json',
				Authorization: `Bearer ${this.apiKey}`,
				...(init.headers || {}),
			},
		});

		if (res.status === 204) {
			return {} as T;
		}

		const body = (await res.json().catch(() => ({}))) as T;
		if (!res.ok) {
			throw new PaymentProviderError(`Lemon Squeezy API request failed (${res.status})`, body);
		}
		return body;
	}

	private async listAllPages<TResource>(
		pathWithoutPaging: string,
		options?: { pageSize?: number; maxPages?: number },
	): Promise<TResource[]> {
		const pageSize = options?.pageSize ?? 100;
		const maxPages = options?.maxPages ?? 20;
		const out: TResource[] = [];

		for (let page = 1; page <= maxPages; page += 1) {
			const sep = pathWithoutPaging.includes('?') ? '&' : '?';
			const path = `${pathWithoutPaging}${sep}page[size]=${pageSize}&page[number]=${page}`;
			const res = await this.request<LemonJsonApiEnvelope<TResource[]>>(
				path,
				{ method: 'GET' },
			);

			const envelope = asRecord(res) || {};
			const data = envelope['data'];
			const pageData = Array.isArray(data) ? (data as TResource[]) : [];
			out.push(...pageData);
			if (pageData.length < pageSize) break;
		}

		return out;
	}

	private slugify(value: string): string {
		return value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+/, '')
			.replace(/-+$/, '')
			.slice(0, 64);
	}

	private getCatalogKeyFromMetadata(metadata?: Record<string, string>): string | null {
		// We use `planId` as our stable dedupe key when present.
		// This keeps Lemon catalog sync idempotent across repeated runs.
		return typeof metadata?.planId === 'string' && metadata.planId.trim() ? metadata.planId.trim() : null;
	}

	private getProductSlug(options: CreateProductOptions): string {
		const planId = this.getCatalogKeyFromMetadata(options.metadata);
		if (planId) return `plan-${this.slugify(planId)}`;
		return this.slugify(options.name || 'product');
	}

	private getVariantSlug(options: CreatePriceOptions): string {
		const planId = this.getCatalogKeyFromMetadata(options.metadata);
		if (planId) return `plan-${this.slugify(planId)}`;
		return this.slugify(options.metadata?.name || 'variant');
	}

	// ============== Checkout ==============
	async createCheckoutSession(opts: CheckoutOptions): Promise<CheckoutSessionResult> {
		// Lemon Squeezy checkouts require a variant id.
		// In our system, `priceId` maps to a provider-native price identifier.
		// For Lemon, we treat it as the Variant ID.
		const variantId = opts.priceId;
		if (!variantId) {
			throw new PaymentProviderError('Lemon Squeezy checkout requires a priceId (variant id)');
		}

		const storeId = this.getStoreId();

		// Lemon's redirect URL is static (no session placeholder support).
		// Our dashboard confirmation flow supports a webhook-driven fallback via `recent=1`.
		// We intentionally redirect without a session id.
		let redirectUrl = opts.successUrl;
		try {
			const url = new URL(opts.successUrl);
			url.searchParams.delete('session_id');
			url.searchParams.delete('payment_intent');
			url.searchParams.delete('redirect_status');
			url.searchParams.delete('provider');
			url.searchParams.delete('reference');
			url.searchParams.delete('trxref');
			redirectUrl = url.toString();
		} catch {
			// If it's not a valid URL, keep as-is.
		}

		const customData: Record<string, unknown> = {
			userId: opts.userId,
			checkoutMode: opts.mode,
			priceId: variantId,
			...(opts.metadata || {}),
		};
		if (opts.dedupeKey) customData.dedupeKey = opts.dedupeKey;

		const payload = {
			data: {
				type: 'checkouts',
				attributes: {
					// For subscription products, Lemon will create a subscription.
					// We do not set `custom_price` for subscription mode since it would affect renewals.
					custom_price: opts.mode === 'payment' && typeof opts.amount === 'number' ? Math.max(0, Math.round(opts.amount)) : null,
					product_options: {
						enabled_variants: [Number(variantId)],
						redirect_url: redirectUrl,
					},
					checkout_data: {
						email: opts.customerEmail || undefined,
						discount_code: opts.promotionCodeId || undefined,
						custom: customData,
					},
					// Use test_mode if the key looks like a test key, or allow explicit override.
					test_mode: /test/i.test(this.apiKey),
				},
				relationships: {
					store: { data: { type: 'stores', id: storeId } },
					variant: { data: { type: 'variants', id: String(variantId) } },
				},
			},
		};

		const res = await this.request<LemonJsonApiEnvelope<LemonJsonApiResource>>('/checkouts', {
			method: 'POST',
			body: JSON.stringify(payload),
		});

		const envelope = asRecord(res) || {};
		const data = asRecord(envelope['data']) || {};
		const attrs = asRecord(data['attributes']) || {};
		const checkoutId = typeof data['id'] === 'string' ? data['id'] : undefined;
		const url = typeof attrs['url'] === 'string' ? attrs['url'] : undefined;
		if (typeof checkoutId !== 'string' || !checkoutId) {
			throw new PaymentProviderError('Failed to create Lemon Squeezy checkout');
		}
		if (typeof url !== 'string' || !url) {
			throw new PaymentProviderError('Lemon Squeezy checkout did not return a URL');
		}

		return { id: checkoutId, url };
	}

	async getCheckoutSession(sessionId: string): Promise<CheckoutSessionDetails> {
		if (!sessionId) throw new PaymentProviderError('Missing checkout session id');

		const res = await this.request<LemonJsonApiEnvelope<LemonJsonApiResource>>(
			'/checkouts/' + encodeURIComponent(sessionId),
			{ method: 'GET' },
		);

		const envelope = asRecord(res) || {};
		const data = asRecord(envelope['data']) || {};
		const attributes = asRecord(data['attributes']) || {};
		const checkoutData = asRecord(attributes.checkout_data) || {};
		const checkoutCustom = asRecord(checkoutData.custom) || {};
		const userId = typeof checkoutCustom.userId === 'string' ? checkoutCustom.userId : undefined;
		const variantId = attributes.variant_id != null ? String(attributes.variant_id) : undefined;

		return {
			id: typeof data['id'] === 'string' ? String(data['id']) : sessionId,
			clientReferenceId: userId,
			metadata: toStringRecord(checkoutCustom),
			paymentStatus: 'unknown',
			lineItems: variantId ? [{ priceId: variantId }] : undefined,
		};
	}

	// ============== Customers ==============
	async createCustomer(userId: string, email: string, name?: string): Promise<string> {
		if (!email) throw new PaymentProviderError('Lemon Squeezy customer creation requires an email');
		const storeId = this.getStoreId();
		const payload = {
			data: {
				type: 'customers',
				attributes: {
					name: name || null,
					email,
				},
				relationships: {
					store: { data: { type: 'stores', id: storeId } },
				},
			},
		};

		const res = await this.request<LemonJsonApiEnvelope<LemonJsonApiResource>>('/customers', {
			method: 'POST',
			body: JSON.stringify(payload),
		});

		const envelope = asRecord(res) || {};
		const data = asRecord(envelope['data']) || {};
		const id = typeof data['id'] === 'string' ? data['id'] : undefined;
		if (typeof id !== 'string' || !id) {
			throw new PaymentProviderError('Failed to create Lemon Squeezy customer');
		}

		// Note: Lemon customers don't support arbitrary metadata; userId is persisted in our DB mapping.
		void userId;
		return id;
	}

	async updateCustomer(_customerId: string, _data: { email?: string; name?: string }): Promise<void> {
		const customerId = String(_customerId || '').trim();
		if (!customerId) throw new PaymentProviderError('Missing customer id');
		const nextEmail = typeof _data?.email === 'string' ? _data.email : undefined;
		const nextName = typeof _data?.name === 'string' ? _data.name : undefined;
		if (!nextEmail && !nextName) return;

		const payload = {
			data: {
				type: 'customers',
				id: customerId,
				attributes: {
					...(nextName ? { name: nextName } : null),
					...(nextEmail ? { email: nextEmail } : null),
				},
			},
		};

		await this.request<LemonJsonApiEnvelope<LemonJsonApiResource>>(
			'/customers/' + encodeURIComponent(customerId),
			{ method: 'PATCH', body: JSON.stringify(payload) },
		);
	}

	async createCustomerPortalSession(customerId: string, _returnUrl: string): Promise<string> {
		if (!customerId) throw new PaymentProviderError('Missing customer id');
		void _returnUrl;

		// Prefer customer portal from the customer object.
		const customerRes = await this.request<LemonJsonApiEnvelope<LemonJsonApiResource>>(
			'/customers/' + encodeURIComponent(customerId),
			{ method: 'GET' },
		);
		const customerEnv = asRecord(customerRes) || {};
		const customerData = asRecord(customerEnv['data']) || {};
		const customerAttrs = asRecord(customerData['attributes']) || {};
		const urls = asRecord(customerAttrs.urls) || {};
		const portalUrl = typeof urls.customer_portal === 'string' ? urls.customer_portal : null;
		if (portalUrl) return portalUrl;

		// If the customer portal url is null (no subscriptions), attempt subscription-based portal.
		// Some parts of our app (like Paystack) treat the portal id as a subscription id.
		if (/^\d+$/.test(customerId)) {
			throw new PaymentProviderError('Lemon Squeezy customer has no portal URL (no active subscription)');
		}

		throw new PaymentProviderError('Unable to create Lemon Squeezy customer portal session');
	}

	// ============== Subscriptions ==============
	async cancelSubscription(subscriptionId: string, _immediately?: boolean): Promise<SubscriptionResult> {
		if (!subscriptionId) throw new PaymentProviderError('Missing subscription id');
		void _immediately;
		const payload = {
			data: {
				type: 'subscriptions',
				id: String(subscriptionId),
				attributes: {
					cancelled: true,
				},
			},
		};

		const res = await this.request<LemonJsonApiEnvelope<LemonJsonApiResource>>(
			'/subscriptions/' + encodeURIComponent(subscriptionId),
			{ method: 'PATCH', body: JSON.stringify(payload) },
		);
		const env = asRecord(res) || {};
		const data = asRecord(env['data']) || {};
		const attrs = asRecord(data['attributes']) || {};
		return {
			id: typeof data['id'] === 'string' ? String(data['id']) : subscriptionId,
			status: typeof attrs.status === 'string' ? attrs.status : 'cancelled',
			canceledAt: parseIsoDate(attrs.cancelled_at),
			expiresAt: parseIsoDate(attrs.ends_at) || parseIsoDate(attrs.renews_at),
			currentPeriodEnd: parseIsoDate(attrs.renews_at) || parseIsoDate(attrs.ends_at),
		};
	}

	async undoCancelSubscription(subscriptionId: string): Promise<SubscriptionResult> {
		if (!subscriptionId) throw new PaymentProviderError('Missing subscription id');
		const payload = {
			data: {
				type: 'subscriptions',
				id: String(subscriptionId),
				attributes: {
					cancelled: false,
				},
			},
		};

		const res = await this.request<LemonJsonApiEnvelope<LemonJsonApiResource>>(
			'/subscriptions/' + encodeURIComponent(subscriptionId),
			{ method: 'PATCH', body: JSON.stringify(payload) },
		);
		const env = asRecord(res) || {};
		const data = asRecord(env['data']) || {};
		const attrs = asRecord(data['attributes']) || {};
		return {
			id: typeof data['id'] === 'string' ? String(data['id']) : subscriptionId,
			status: typeof attrs.status === 'string' ? attrs.status : 'active',
			canceledAt: null,
			expiresAt: parseIsoDate(attrs.renews_at) || null,
			currentPeriodEnd: parseIsoDate(attrs.renews_at) || null,
		};
	}

	async getSubscription(subscriptionId: string): Promise<SubscriptionDetails> {
		if (!subscriptionId) throw new PaymentProviderError('Missing subscription id');
		const res = await this.request<LemonJsonApiEnvelope<LemonJsonApiResource>>(
			'/subscriptions/' + encodeURIComponent(subscriptionId),
			{ method: 'GET' },
		);
		const env = asRecord(res) || {};
		const data = asRecord(env['data']) || {};
		const attrs = asRecord(data['attributes']) || {};

		const renewsAt = parseIsoDate(attrs.renews_at) || new Date();
		const createdAt = parseIsoDate(attrs.created_at) || new Date(renewsAt.getTime() - 1000 * 60 * 60 * 24 * 30);
		const endsAt = parseIsoDate(attrs.ends_at);
		const cancelled = Boolean(attrs.cancelled);
		const variantId = attrs.variant_id != null ? String(attrs.variant_id) : undefined;

		return {
			id: typeof data['id'] === 'string' ? String(data['id']) : subscriptionId,
			status: typeof attrs.status === 'string' ? attrs.status : 'active',
			providerId: typeof data['id'] === 'string' ? String(data['id']) : subscriptionId,
			subscriptionIdsByProvider: { lemonsqueezy: typeof data['id'] === 'string' ? String(data['id']) : subscriptionId },
			currentPeriodStart: createdAt,
			currentPeriodEnd: renewsAt,
			cancelAtPeriodEnd: cancelled,
			canceledAt: parseIsoDate(attrs.cancelled_at),
			metadata: undefined,
			priceId: variantId,
			customerId: attrs.customer_id != null ? String(attrs.customer_id) : undefined,
			latestInvoice: null,
			...(endsAt ? { currentPeriodEnd: endsAt } : null),
		};
	}

	// ============== Webhooks ==============
	async constructWebhookEvent(requestBody: Buffer, signature: string, secret: string): Promise<StandardizedWebhookEvent> {
		try {
			const digest = Buffer.from(crypto.createHmac('sha256', secret).update(requestBody).digest('hex'), 'utf8');
			const sig = Buffer.from(signature || '', 'utf8');
			if (digest.length !== sig.length || !crypto.timingSafeEqual(digest, sig)) {
				throw new WebhookSignatureVerificationError('Invalid Lemon Squeezy webhook signature');
			}
		} catch (err) {
			if (err instanceof WebhookSignatureVerificationError) throw err;
			throw new WebhookSignatureVerificationError('Invalid Lemon Squeezy webhook signature');
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(requestBody.toString('utf8'));
		} catch (err) {
			throw new PaymentProviderError('Invalid Lemon Squeezy webhook JSON', err);
		}

		const root = asRecord(parsed) || {};
		const meta = asRecord(root.meta) || {};
		const eventName = typeof meta.event_name === 'string' ? meta.event_name : getNestedString(root, ['meta', 'event_name']);
		const customData = asRecord(meta.custom_data) || null;
		const data = asRecord(root.data) || {};
		const dataId = typeof data.id === 'string' ? data.id : undefined;
		const attributes = asRecord(data.attributes) || {};

		const metadata = {
			...(toStringRecord(customData) || {}),
			provider: 'lemonsqueezy',
		};

		// Order events
		if (eventName === 'order_created') {
			const payload: StandardizedCheckoutSession = {
				id: dataId || 'order',
				userId: typeof customData?.userId === 'string' ? customData.userId : undefined,
				userEmail: typeof attributes.user_email === 'string' ? attributes.user_email : undefined,
				customerId: attributes.customer_id != null ? String(attributes.customer_id) : undefined,
				mode: 'payment',
				providerId: dataId,
				paymentIntentId: dataId,
				paymentStatus: typeof attributes.status === 'string' ? attributes.status : 'paid',
				amountTotal: typeof attributes.total === 'number' ? attributes.total : undefined,
				amountSubtotal: typeof attributes.subtotal === 'number' ? attributes.subtotal : undefined,
				currency: typeof attributes.currency === 'string' ? attributes.currency : undefined,
				metadata,
				lineItems: (() => {
					const variantId = getNestedNumber(attributes, ['first_order_item', 'variant_id']);
					return variantId != null ? [{ priceId: String(variantId), quantity: 1 }] : undefined;
				})(),
			};

			return { type: 'checkout.completed', payload, originalEvent: parsed };
		}

		if (eventName === 'order_refunded') {
			const payload: StandardizedRefund = {
				id: dataId || 'refund',
				paymentIntentId: dataId,
				amount: typeof attributes.refunded_amount === 'number' ? attributes.refunded_amount : (typeof attributes.total === 'number' ? attributes.total : 0),
				currency: typeof attributes.currency === 'string' ? attributes.currency : 'USD',
				status: 'processed',
				metadata,
			};

			return { type: 'refund.processed', payload, originalEvent: parsed };
		}

		// Subscription events
		if (
			eventName === 'subscription_created' ||
			eventName === 'subscription_updated' ||
			eventName === 'subscription_cancelled' ||
			eventName === 'subscription_resumed' ||
			eventName === 'subscription_expired' ||
			eventName === 'subscription_paused' ||
			eventName === 'subscription_unpaused'
		) {
			const currentPeriodEnd = parseIsoDate(attributes.renews_at) || parseIsoDate(attributes.ends_at) || new Date();
			const currentPeriodStart = parseIsoDate(attributes.created_at) || new Date(currentPeriodEnd.getTime() - 1000 * 60 * 60 * 24 * 30);
			const variantId = attributes.variant_id != null ? String(attributes.variant_id) : undefined;

			const payload: StandardizedSubscription = {
				id: dataId || 'subscription',
				providerId: dataId,
				status: typeof attributes.status === 'string' ? attributes.status : 'active',
				currentPeriodStart,
				currentPeriodEnd,
				cancelAtPeriodEnd: Boolean(attributes.ends_at),
				canceledAt: parseIsoDate(attributes.cancelled_at),
				customerId: attributes.customer_id != null ? String(attributes.customer_id) : undefined,
				priceId: variantId,
				priceIdsByProvider: variantId ? { lemonsqueezy: variantId } : undefined,
				metadata,
			};

			return {
				type: eventName === 'subscription_created' ? 'subscription.created' : 'subscription.updated',
				payload,
				originalEvent: parsed,
			};
		}

		// Subscription invoice events
		if (eventName === 'subscription_payment_success' || eventName === 'subscription_payment_failed') {
			const total = typeof attributes.total === 'number' ? attributes.total : 0;
			const subtotal = typeof attributes.subtotal === 'number' ? attributes.subtotal : total;
			const discountTotal = typeof attributes.discount_total === 'number' ? attributes.discount_total : 0;

			const payload: StandardizedInvoice = {
				id: dataId || 'invoice',
				providerId: dataId,
				invoiceIdsByProvider: { lemonsqueezy: dataId || 'invoice' },
				// Our system requires a stable identifier for payment idempotency + refunds.
				// Lemon Squeezy webhook payloads identify the resource by `data.id`.
				paymentIntentId: dataId,
				amountPaid: eventName === 'subscription_payment_success' ? total : 0,
				amountDue: eventName === 'subscription_payment_success' ? 0 : total,
				amountDiscount: discountTotal,
				subtotal,
				total,
				currency: typeof attributes.currency === 'string' ? attributes.currency : 'USD',
				status: typeof attributes.status === 'string' ? attributes.status : (eventName === 'subscription_payment_success' ? 'paid' : 'pending'),
				subscriptionId: attributes.subscription_id != null ? String(attributes.subscription_id) : undefined,
				customerId: attributes.customer_id != null ? String(attributes.customer_id) : undefined,
				userEmail: typeof attributes.user_email === 'string' ? attributes.user_email : undefined,
				metadata,
				billingReason: typeof attributes.billing_reason === 'string' ? attributes.billing_reason : undefined,
			};

			return {
				type: eventName === 'subscription_payment_success' ? 'invoice.payment_succeeded' : 'invoice.payment_failed',
				payload,
				originalEvent: parsed,
			};
		}

		// Unknown/unhandled event
		return { type: 'other', payload: { eventName: eventName || 'unknown' }, originalEvent: parsed };
	}

	// ============== Admin / Catalog ==============
	/**
	 * Lemon catalog modeling note
	 *
	 * Our app-wide provider interface talks in terms of `products` and `prices`.
	 * Lemon Squeezy's subscription + checkout surfaces are Variant-centric (webhooks include `variant_id`).
	 *
	 * To keep the rest of the system stable (checkout, webhooks, immediate plan changes), we treat:
	 * - `plan.externalProductIds.lemonsqueezy` => Lemon Product ID
	 * - `plan.externalPriceIds.lemonsqueezy`  => Lemon Variant ID (not Lemon Price object ID)
	 *
	 * That means `createPrice()` returns a `PriceDetails` whose `id` is the Variant ID.
	 */
	async createProduct(options: CreateProductOptions): Promise<string> {
		const storeId = this.getStoreId();
		const desiredSlug = this.getProductSlug(options);
		const desiredName = options.name;

		// Idempotency: first try to find by slug (and fall back to name).
		const products = await this.listAllPages<LemonJsonApiResource>(`/products?filter[store_id]=${encodeURIComponent(storeId)}`);
		for (const p of products) {
			const attrs = asRecord(p.attributes) || {};
			const slug = typeof attrs.slug === 'string' ? attrs.slug : '';
			const name = typeof attrs.name === 'string' ? attrs.name : '';
			if (p.id && (slug === desiredSlug || name.toLowerCase() === desiredName.toLowerCase())) {
				return String(p.id);
			}
		}

		const payload = {
			data: {
				type: 'products',
				attributes: {
					name: desiredName,
					slug: desiredSlug,
					description: options.description || null,
					// Safer default: publish explicitly later if you want it discoverable.
					status: 'draft',
				},
				relationships: {
					store: { data: { type: 'stores', id: storeId } },
				},
			},
		};

		const res = await this.request<LemonJsonApiEnvelope<LemonJsonApiResource>>('/products', {
			method: 'POST',
			body: JSON.stringify(payload),
		});

		const created = this.extractResource(res, 'Failed to create Lemon Squeezy product');
		if (!created.id) throw new PaymentProviderError('Failed to create Lemon Squeezy product (missing id)');
		return String(created.id);
	}

	async updateProduct(productId: string, options: UpdateProductOptions): Promise<void> {
		if (!productId) throw new PaymentProviderError('Missing product id');
		const payload = {
			data: {
				type: 'products',
				id: String(productId),
				attributes: {
					...(options.name ? { name: options.name } : {}),
					...(typeof options.description === 'string' ? { description: options.description } : {}),
				},
			},
		};
		await this.request(`/products/${encodeURIComponent(productId)}`, {
			method: 'PATCH',
			body: JSON.stringify(payload),
		});
	}

	async findProduct(name: string): Promise<string | null> {
		if (!name) return null;
		const storeId = this.getStoreId();
		const products = await this.listAllPages<LemonJsonApiResource>(`/products?filter[store_id]=${encodeURIComponent(storeId)}`);
		const lowered = name.toLowerCase();
		for (const p of products) {
			const attrs = asRecord(p.attributes) || {};
			const pName = typeof attrs.name === 'string' ? attrs.name : '';
			if (p.id && pName.toLowerCase() === lowered) return String(p.id);
		}
		return null;
	}

	async createPrice(options: CreatePriceOptions): Promise<PriceDetails> {
		// In Lemon, we return a Variant ID here.
		if (!options.productId) throw new PaymentProviderError('Lemon Squeezy createPrice requires productId');
		if (!Number.isFinite(options.unitAmount) || options.unitAmount < 0) {
			throw new PaymentProviderError('Invalid unitAmount');
		}

		const desiredVariantSlug = this.getVariantSlug(options);
		const desiredName = options.metadata?.name || 'Plan';
		const isSubscription = Boolean(options.recurring);
		const interval = options.recurring?.interval || null;
		const intervalCount = options.recurring?.intervalCount ?? 1;

		// Try to reuse an existing variant for this product.
		const variants = await this.listAllPages<LemonJsonApiResource>(
			`/variants?filter[product_id]=${encodeURIComponent(options.productId)}`,
		);
		for (const v of variants) {
			const attrs = asRecord(v.attributes) || {};
			const slug = typeof attrs.slug === 'string' ? attrs.slug : '';
			const name = typeof attrs.name === 'string' ? attrs.name : '';
			if (!v.id) continue;
			if (slug === desiredVariantSlug || name.toLowerCase() === desiredName.toLowerCase()) {
				const variantId = String(v.id);
				// Keep the Variant ID stable. If the plan pricing changed, update the Variant's pricing.
				const currentPrice = typeof attrs.price === 'number' ? attrs.price : null;
				const currentIsSubscription = typeof attrs.is_subscription === 'boolean' ? attrs.is_subscription : null;
				const currentInterval = typeof attrs.interval === 'string' ? attrs.interval : null;
				const currentIntervalCount = typeof attrs.interval_count === 'number' ? attrs.interval_count : null;

				const needsUpdate =
					currentPrice !== options.unitAmount ||
					(currentIsSubscription !== null && currentIsSubscription !== isSubscription) ||
					(isSubscription && (currentInterval !== interval || currentIntervalCount !== intervalCount));

				if (needsUpdate) {
					const patch = {
						data: {
							type: 'variants',
							id: variantId,
							attributes: {
								// Note: these attributes are documented as deprecated, but are still included for backwards compatibility.
								// Updating them keeps our stable Variant ID while reflecting the new price/interval.
								price: Math.max(0, Math.round(options.unitAmount)),
								is_subscription: isSubscription,
								interval: isSubscription ? interval : null,
								interval_count: isSubscription ? Math.max(1, Math.floor(intervalCount)) : null,
							},
						},
					};
					await this.request(`/variants/${encodeURIComponent(variantId)}`, {
						method: 'PATCH',
						body: JSON.stringify(patch),
					});
				}

				return {
					id: variantId,
					unitAmount: options.unitAmount,
					currency: options.currency || null,
					recurring: options.recurring
						? { interval: options.recurring.interval, intervalCount }
						: null,
					productId: options.productId,
					type: isSubscription ? 'recurring' : 'one_time',
				};
			}
		}

		// Create a new variant.
		const payload = {
			data: {
				type: 'variants',
				attributes: {
					name: desiredName,
					slug: desiredVariantSlug,
					description: null,
					status: 'published',
					// Deprecated-but-supported fields used for backward-compat and a stable Variant ID.
					price: Math.max(0, Math.round(options.unitAmount)),
					is_subscription: isSubscription,
					interval: isSubscription ? interval : null,
					interval_count: isSubscription ? Math.max(1, Math.floor(intervalCount)) : null,
				},
				relationships: {
					product: { data: { type: 'products', id: String(options.productId) } },
				},
			},
		};

		const res = await this.request<LemonJsonApiEnvelope<LemonJsonApiResource>>('/variants', {
			method: 'POST',
			body: JSON.stringify(payload),
		});

		const created = this.extractResource(res, 'Failed to create Lemon Squeezy variant');
		if (!created.id) throw new PaymentProviderError('Failed to create Lemon Squeezy variant (missing id)');
		const variantId = String(created.id);

		return {
			id: variantId,
			unitAmount: options.unitAmount,
			currency: options.currency || null,
			recurring: options.recurring
				? { interval: options.recurring.interval, intervalCount }
				: null,
			productId: options.productId,
			type: isSubscription ? 'recurring' : 'one_time',
		};
	}

	async verifyPrice(priceId: string): Promise<PriceDetails> {
		// In Lemon, `priceId` is a Variant ID in our system.
		if (!priceId) throw new PaymentProviderError('Missing price id');

		const res = await this.request<LemonJsonApiEnvelope<LemonJsonApiResource>>(
			`/variants/${encodeURIComponent(priceId)}`,
			{ method: 'GET' },
		);

		const variant = this.extractResource(res, `Failed to retrieve Lemon Squeezy variant ${priceId}`);
		const attrs = asRecord(variant.attributes) || {};
		const unitAmount = typeof attrs.price === 'number' ? attrs.price : null;
		const productId = attrs.product_id != null ? String(attrs.product_id) : null;
		const isSubscription = typeof attrs.is_subscription === 'boolean' ? attrs.is_subscription : null;
		const interval = typeof attrs.interval === 'string' ? attrs.interval : null;
		const intervalCount = typeof attrs.interval_count === 'number' ? attrs.interval_count : 1;

		return {
			id: priceId,
			unitAmount,
			currency: null,
			recurring: isSubscription ? { interval: interval || 'month', intervalCount } : null,
			productId,
			type: isSubscription ? 'recurring' : 'one_time',
		};
	}

	async archivePrice(priceId: string): Promise<void> {
		// Lemon doesn't have Stripe-style price archival; we "archive" by setting the Variant status to draft.
		if (!priceId) throw new PaymentProviderError('Missing price id');
		const payload = {
			data: {
				type: 'variants',
				id: String(priceId),
				attributes: { status: 'draft' },
			},
		};
		await this.request(`/variants/${encodeURIComponent(priceId)}`, {
			method: 'PATCH',
			body: JSON.stringify(payload),
		});
	}

	async createCoupon(opts: CreateCouponOptions): Promise<string> {
		const storeId = this.getStoreId();
		const code = opts.code;
		if (!code) {
			throw new PaymentProviderError('Lemon Squeezy requires a coupon code at discount creation time');
		}

		const hasPercent = typeof opts.percentOff === 'number' && Number.isFinite(opts.percentOff);
		const hasAmount = typeof opts.amountOff === 'number' && Number.isFinite(opts.amountOff);
		if (!hasPercent && !hasAmount) {
			throw new PaymentProviderError('Coupon must specify percentOff or amountOff');
		}

		const amount_type = hasPercent ? 'percent' : 'fixed';
		const amount = hasPercent ? Math.round(opts.percentOff!) : Math.round(opts.amountOff!);

		const duration_in_months = opts.duration === 'repeating'
			? (typeof opts.durationInMonths === 'number' && Number.isFinite(opts.durationInMonths) ? Math.max(1, Math.floor(opts.durationInMonths)) : 1)
			: 1;

		const payload = {
			data: {
				type: 'discounts',
				attributes: {
					name: `App coupon ${code}`,
					code,
					amount,
					amount_type,
					duration: opts.duration,
					duration_in_months,
					expires_at: opts.expiresAt ? opts.expiresAt.toISOString() : null,
				},
				relationships: {
					store: {
						data: { type: 'stores', id: storeId },
					},
				},
			},
		};

		const res = await this.request<LemonJsonApiEnvelope<LemonJsonApiResource>>('/discounts', {
			method: 'POST',
			body: JSON.stringify(payload),
		});
		const env = asRecord(res) || {};
		const data = asRecord(env['data']) || {};
		const id = typeof data['id'] === 'string' ? data['id'] : undefined;
		if (typeof id !== 'string' || !id) {
			throw new PaymentProviderError('Failed to create Lemon Squeezy discount');
		}
		return id;
	}

	async deleteCoupon(couponId: string): Promise<void> {
		if (!couponId) return;
		await this.request('/discounts/' + encodeURIComponent(couponId), { method: 'DELETE' });
	}

	async createPromotionCode(opts: CreatePromotionCodeOptions): Promise<string> {
		// Lemon Squeezy discount codes are the `code` on the discount itself.
		// We return the code here so CheckoutOptions.promotionCodeId can carry it.
		if (!opts.code) throw new PaymentProviderError('Missing discount code');
		return opts.code;
	}

	async updatePromotionCode(_id: string, _active: boolean): Promise<void> {
		void _id;
		void _active;
		// Lemon Squeezy discounts do not currently expose an update endpoint in the public API docs.
		throw new PaymentProviderError('Lemon Squeezy discount updates are not supported');
	}

	// ============== Proration & Updates ==============
	async getProrationPreview(_subscriptionId: string, _newPriceId: string, _userId: string): Promise<ProrationPreviewResult> {
		void _subscriptionId;
		void _newPriceId;
		void _userId;
		return {
			prorationEnabled: false,
			amountDue: 0,
			currency: 'USD',
			message: 'Proration preview is not implemented for Lemon Squeezy yet',
			nextPaymentAttempt: null,
			lineItems: [],
		};
	}

	async updateSubscriptionPlan(_subscriptionId: string, _newPriceId: string, _userId: string): Promise<SubscriptionUpdateResult> {
		void _subscriptionId;
		void _newPriceId;
		void _userId;
		throw new PaymentProviderError('Lemon Squeezy subscription updates not implemented yet');
	}

	// ============== Billing & Refunds ==============
	async refundPayment(paymentId: string, amount?: number, _reason?: string): Promise<{ id: string; amount: number; status: string; created: Date }> {
		if (!paymentId) throw new PaymentProviderError('Missing Lemon Squeezy order id for refund');
		void _reason;

		const payload: Record<string, unknown> = {
			data: {
				type: 'orders',
				id: String(paymentId),
				...(typeof amount === 'number' && Number.isFinite(amount)
					? { attributes: { amount: Math.max(0, Math.floor(amount)) } }
					: null),
			},
		};

		const res = await this.request<unknown>(`/orders/${encodeURIComponent(paymentId)}/refund`, {
			method: 'POST',
			body: JSON.stringify(payload),
		});

		type OrderAttrs = {
			refunded_amount?: unknown;
			refunded?: unknown;
			status?: unknown;
			refunded_at?: unknown;
			updated_at?: unknown;
			created_at?: unknown;
		};

		const order = this.extractResource<OrderAttrs>(res, 'Failed to issue Lemon Squeezy refund');
		const attrs = asRecord(order.attributes) || {};

		const refundedAmount = typeof attrs.refunded_amount === 'number'
			? attrs.refunded_amount
			: (typeof amount === 'number' && Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0);

		const created =
			parseIsoDate(attrs.refunded_at) ||
			parseIsoDate(attrs.updated_at) ||
			parseIsoDate(attrs.created_at) ||
			new Date();

		const statusValue = typeof attrs.status === 'string' ? attrs.status : undefined;
		const refundedFlag = typeof attrs.refunded === 'boolean' ? attrs.refunded : undefined;
		const status = refundedFlag || statusValue === 'refunded' ? 'succeeded' : statusValue === 'partial_refund' ? 'partial' : 'processed';

		return {
			id: `order_refund_${paymentId}`,
			amount: refundedAmount,
			status,
			created,
		};
	}

	async getRefundDetails(paymentId: string): Promise<{ id: string; amount: number; status: string; created: Date } | null> {
		if (!paymentId) return null;

		const res = await this.request<unknown>(`/orders/${encodeURIComponent(paymentId)}`, { method: 'GET' });

		type OrderAttrs = {
			refunded_amount?: unknown;
			refunded?: unknown;
			status?: unknown;
			refunded_at?: unknown;
			updated_at?: unknown;
			created_at?: unknown;
		};

		const order = this.extractResource<OrderAttrs>(res, 'Failed to retrieve Lemon Squeezy order');
		const attrs = asRecord(order.attributes) || {};
		const refundedAmount = typeof attrs.refunded_amount === 'number' ? attrs.refunded_amount : 0;
		if (!refundedAmount || refundedAmount <= 0) return null;

		const created =
			parseIsoDate(attrs.refunded_at) ||
			parseIsoDate(attrs.updated_at) ||
			parseIsoDate(attrs.created_at) ||
			new Date();

		const statusValue = typeof attrs.status === 'string' ? attrs.status : undefined;
		const refundedFlag = typeof attrs.refunded === 'boolean' ? attrs.refunded : undefined;
		const status = refundedFlag || statusValue === 'refunded' ? 'succeeded' : statusValue === 'partial_refund' ? 'partial' : 'processed';

		return {
			id: `order_refund_${paymentId}`,
			amount: refundedAmount,
			status,
			created,
		};
	}

	async getPaymentReceiptUrl(paymentId: string): Promise<string | null> {
		if (!paymentId) return null;
		const res = await this.request<unknown>(`/orders/${encodeURIComponent(paymentId)}`, { method: 'GET' });

		type OrderAttrs = {
			urls?: unknown;
		};

		const order = this.extractResource<OrderAttrs>(res, 'Failed to retrieve Lemon Squeezy order');
		const attrs = asRecord(order.attributes) || {};
		const urls = asRecord(attrs.urls) || {};
		const receipt = typeof urls.receipt === 'string' ? urls.receipt : null;
		return receipt || null;
	}

	async getInvoiceUrl(_invoiceId: string): Promise<string | null> {
		void _invoiceId;
		return null;
	}

	getDashboardUrl(_type: 'payment' | 'subscription' | 'customer', _id: string): string {
		void _type;
		void _id;
		return 'https://app.lemonsqueezy.com/';
	}

	// ============== Elements / Embedded Checkout ==============
	async createPaymentIntent(_opts: CheckoutOptions): Promise<{ clientSecret: string; paymentIntentId: string }> {
		void _opts;
		throw new PaymentProviderError('Lemon Squeezy elements not implemented');
	}

	async createSubscriptionIntent(_opts: CheckoutOptions): Promise<{ clientSecret: string; subscriptionId: string }> {
		void _opts;
		throw new PaymentProviderError('Lemon Squeezy elements not implemented');
	}

	async getPaymentIntent(_paymentIntentId: string): Promise<PaymentIntentDetails> {
		void _paymentIntentId;
		throw new PaymentProviderError('Lemon Squeezy payment intent retrieval not implemented');
	}
}
