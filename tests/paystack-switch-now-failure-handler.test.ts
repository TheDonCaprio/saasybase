import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	subscription: {
		update: vi.fn(),
	},
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../lib/notifications', () => ({
	sendBillingNotification: vi.fn(async () => ({ ok: true })),
	sendAdminNotificationEmail: vi.fn(async () => ({ ok: true })),
}));

import { handleInvoicePaymentFailureEvent } from '../lib/payment/invoice-payment-failure-handler';

describe('Paystack switch-now failure handling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('expires a provisionally pending switch-now subscription on failed first charge', async () => {
		await handleInvoicePaymentFailureEvent({
			invoice: {
				id: 'inv_ps_1',
				subscriptionId: 'sub_ps_new',
				customerId: 'cust_ps_1',
				amountPaid: 0,
				amountDue: 3000,
				amountDiscount: 0,
				subtotal: 3000,
				total: 3000,
				currency: 'NGN',
				status: 'unpaid',
				metadata: {},
			},
			resolveUserByCustomerId: vi.fn(async () => 'user_1'),
			findSubscriptionByProviderId: vi.fn(async () => ({
				id: 'sub_db_new',
				status: 'PENDING',
				prorationPendingSince: new Date('2026-03-17T10:00:00.000Z'),
			})),
		});

		expect(prismaMock.subscription.update).toHaveBeenCalledWith({
			where: { id: 'sub_db_new' },
			data: expect.objectContaining({
				status: 'EXPIRED',
				prorationPendingSince: null,
				expiresAt: expect.any(Date),
				canceledAt: expect.any(Date),
				cancelAtPeriodEnd: false,
			}),
		});
	});
});