import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

import { PaystackPaymentProvider } from '../lib/payment/providers/paystack';
import { PaddlePaymentProvider } from '../lib/payment/providers/paddle';

const PAYSTACK_TEST_SECRET_KEY = 'sk_test_xxxxxxxxxxxxx';

describe('Refund webhook normalization consistency', () => {
	describe('Paystack', () => {
		it('ignores refund.pending (do not mark payment refunded early)', async () => {
			const provider = new PaystackPaymentProvider(PAYSTACK_TEST_SECRET_KEY);
			const evt = {
				event: 'refund.pending',
				data: {
					id: 123,
					transaction_reference: 'ps_ref_123',
					amount: 2500,
					currency: 'NGN',
					merchant_note: 'Customer requested',
				},
			};

			const body = Buffer.from(JSON.stringify(evt));
			const sig = crypto.createHmac('sha512', PAYSTACK_TEST_SECRET_KEY).update(body).digest('hex');
			const normalized = await provider.constructWebhookEvent(body, sig);

			expect(normalized.type).toBe('ignored');
		});

		it('normalizes refund.processed to refund.processed', async () => {
			const provider = new PaystackPaymentProvider(PAYSTACK_TEST_SECRET_KEY);
			const evt = {
				event: 'refund.processed',
				data: {
					id: 456,
					transaction_reference: 'ps_ref_456',
					amount: 9900,
					currency: 'NGN',
					merchant_note: 'Duplicate purchase',
				},
			};

			const body = Buffer.from(JSON.stringify(evt));
			const sig = crypto.createHmac('sha512', PAYSTACK_TEST_SECRET_KEY).update(body).digest('hex');
			const normalized = await provider.constructWebhookEvent(body, sig);

			expect(normalized.type).toBe('refund.processed');
			const payload = normalized.payload as any;
			expect(payload.paymentIntentId).toBe('ps_ref_456');
		});
	});

	describe('Paddle', () => {
		const paddleApiKey = 'pdl_test_dummy';
		const paddleWebhookSecret = 'whsec_test_dummy';

		function paddleSignatureHeader(body: Buffer, secret: string, ts = `${Math.floor(Date.now() / 1000)}`) {
			const signedPayload = `${ts}:${body.toString('utf8')}`;
			const h1 = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
			return `ts=${ts};h1=${h1}`;
		}

		it('ignores refund adjustment until approved', async () => {
			const provider = new PaddlePaymentProvider(paddleApiKey);
			const evt = {
				event_id: 'evt_test_1',
				event_type: 'adjustment.created',
				occurred_at: new Date().toISOString(),
				data: {
					id: 'adj_123',
					action: 'refund',
					status: 'pending_approval',
					transaction_id: 'txn_123',
					currency_code: 'USD',
					totals: { total: '100' },
					reason: 'requested_by_customer',
				},
			};

			const body = Buffer.from(JSON.stringify(evt));
			const sigHeader = paddleSignatureHeader(body, paddleWebhookSecret);
			const normalized = await provider.constructWebhookEvent(body, sigHeader, paddleWebhookSecret);

			expect(normalized.type).toBe('ignored');
		});

		it('normalizes approved refund adjustment to refund.processed', async () => {
			const provider = new PaddlePaymentProvider(paddleApiKey);
			const evt = {
				event_id: 'evt_test_2',
				event_type: 'adjustment.updated',
				occurred_at: new Date().toISOString(),
				data: {
					id: 'adj_456',
					action: 'refund',
					status: 'approved',
					transaction_id: 'txn_456',
					currency_code: 'USD',
					totals: { total: '2500' },
					reason: 'duplicate',
				},
			};

			const body = Buffer.from(JSON.stringify(evt));
			const sigHeader = paddleSignatureHeader(body, paddleWebhookSecret);
			const normalized = await provider.constructWebhookEvent(body, sigHeader, paddleWebhookSecret);

			expect(normalized.type).toBe('refund.processed');
			const payload = normalized.payload as any;
			expect(payload.paymentIntentId).toBe('txn_456');
			expect(payload.id).toBe('adj_456');
		});
	});
});
