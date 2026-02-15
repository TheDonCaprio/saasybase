import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Stripe SDK so we can validate the calls we make.
vi.mock('stripe', () => {
	const mockState = {
		prices: {
			retrieve: vi.fn(),
		},
		subscriptions: {
			retrieve: vi.fn(),
			update: vi.fn(),
			cancel: vi.fn(),
		},
		subscriptionSchedules: {
			create: vi.fn(),
			retrieve: vi.fn(),
			update: vi.fn(),
		},
		checkout: {
			sessions: {
				create: vi.fn(),
				retrieve: vi.fn(),
			},
		},
		customers: {
			create: vi.fn(),
			update: vi.fn(),
		},
		billingPortal: {
			sessions: {
				create: vi.fn(),
			},
		},
		promotionCodes: {
			create: vi.fn(),
			update: vi.fn(),
		},
		invoices: {
			retrieveUpcoming: vi.fn(),
		},
		refunds: {
			create: vi.fn(),
			list: vi.fn(),
		},
		paymentIntents: {
			retrieve: vi.fn(),
		},
		charges: {
			retrieve: vi.fn(),
		},
	};

	(globalThis as any).__stripeMock = mockState;

	class Stripe {
		prices = mockState.prices;
		subscriptions = mockState.subscriptions;
		subscriptionSchedules = mockState.subscriptionSchedules;
		checkout = mockState.checkout;
		customers = mockState.customers;
		billingPortal = mockState.billingPortal;
		promotionCodes = mockState.promotionCodes;
		invoices = mockState.invoices;
		refunds = mockState.refunds;
		paymentIntents = mockState.paymentIntents;
		charges = mockState.charges;

		constructor(_secretKey: string, _opts: any) {}
	}

	return { default: Stripe };
});

import { StripePaymentProvider } from '../lib/payment/providers/stripe';

describe('Stripe scheduled plan change', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('creates/updates a subscription schedule to change price at cycle end', async () => {
		const m = (globalThis as any).__stripeMock;

		m.subscriptions.retrieve.mockResolvedValue({
			id: 'sub_123',
			current_period_start: 1700000000,
			current_period_end: 1702592000,
			items: {
				data: [
					{
						id: 'si_123',
						quantity: 1,
						price: {
							id: 'price_old',
							recurring: { interval: 'month', interval_count: 1 },
						},
					},
				],
			},
			schedule: null,
		});

		m.prices.retrieve.mockResolvedValue({
			id: 'price_new',
			type: 'recurring',
			recurring: { interval: 'month', interval_count: 1 },
		});

		m.subscriptionSchedules.create.mockResolvedValue({ id: 'sub_sched_1' });
		m.subscriptionSchedules.retrieve.mockResolvedValue({
			id: 'sub_sched_1',
			current_phase: { start_date: 1700000000, end_date: 1702592000 },
		});
		m.subscriptionSchedules.update.mockResolvedValue({ id: 'sub_sched_1' });

		const provider = new StripePaymentProvider('sk_test_dummy');
		const res = await provider.scheduleSubscriptionPlanChange?.('sub_123', 'price_new', 'user_1');

		expect(res?.success).toBe(true);
		expect(res?.newPeriodEnd?.toISOString()).toBe(new Date(1702592000 * 1000).toISOString());

		expect(m.subscriptionSchedules.create).toHaveBeenCalledWith({ from_subscription: 'sub_123' });
		expect(m.subscriptionSchedules.update).toHaveBeenCalledTimes(1);

		const [scheduleId, params] = m.subscriptionSchedules.update.mock.calls[0];
		expect(scheduleId).toBe('sub_sched_1');
		expect(params).toMatchObject({
			end_behavior: 'release',
			proration_behavior: 'none',
		});

		expect(params.phases).toEqual([
			{
				start_date: 1700000000,
				end_date: 1702592000,
				items: [{ price: 'price_old', quantity: 1 }],
				proration_behavior: 'none',
			},
			{
				start_date: 1702592000,
				items: [{ price: 'price_new', quantity: 1 }],
				proration_behavior: 'none',
				iterations: 1,
			},
		]);
	});

	it('preserves addon items when scheduling a plan change', async () => {
		const m = (globalThis as any).__stripeMock;

		m.subscriptions.retrieve.mockResolvedValue({
			id: 'sub_123',
			current_period_start: 1700000000,
			current_period_end: 1702592000,
			items: {
				data: [
					{
						id: 'si_primary',
						quantity: 1,
						price: {
							id: 'price_primary_old',
							recurring: { interval: 'month', interval_count: 1 },
						},
					},
					{
						id: 'si_addon',
						quantity: 2,
						price: {
							id: 'price_addon',
							recurring: { interval: 'month', interval_count: 1 },
						},
					},
				],
			},
			schedule: null,
		});

		m.prices.retrieve.mockResolvedValue({
			id: 'price_primary_new',
			type: 'recurring',
			recurring: { interval: 'month', interval_count: 1 },
		});

		m.subscriptionSchedules.create.mockResolvedValue({ id: 'sub_sched_1' });
		m.subscriptionSchedules.retrieve.mockResolvedValue({
			id: 'sub_sched_1',
			current_phase: { start_date: 1700000000, end_date: 1702592000 },
		});
		m.subscriptionSchedules.update.mockResolvedValue({ id: 'sub_sched_1' });

		const provider = new StripePaymentProvider('sk_test_dummy');
		await provider.scheduleSubscriptionPlanChange?.('sub_123', 'price_primary_new', 'user_1');

		expect(m.subscriptionSchedules.update).toHaveBeenCalledTimes(1);
		const [_scheduleId, params] = m.subscriptionSchedules.update.mock.calls[0];

		// Phase 0 should include BOTH the primary and addon item (unchanged).
		expect(params.phases[0]).toMatchObject({
			start_date: 1700000000,
			end_date: 1702592000,
			proration_behavior: 'none',
		});
		expect(params.phases[0].items).toEqual([
			{ price: 'price_primary_old', quantity: 1 },
			{ price: 'price_addon', quantity: 2 },
		]);

		// Phase 1 should keep the addon and swap ONLY the primary price.
		expect(params.phases[1]).toMatchObject({
			start_date: 1702592000,
			proration_behavior: 'none',
			iterations: 1,
		});
		expect(params.phases[1].items).toEqual([
			{ price: 'price_primary_new', quantity: 1 },
			{ price: 'price_addon', quantity: 2 },
		]);
	});

	it('creates a fresh schedule when the existing one is released', async () => {
		const m = (globalThis as any).__stripeMock;

		m.subscriptions.retrieve.mockResolvedValue({
			id: 'sub_stale',
			current_period_start: 1700000000,
			current_period_end: 1702592000,
			items: {
				data: [
					{
						id: 'si_123',
						quantity: 1,
						price: {
							id: 'price_old',
							recurring: { interval: 'month', interval_count: 1 },
						},
					},
				],
			},
			schedule: 'sub_sched_stale',
		});

		m.prices.retrieve.mockResolvedValue({
			id: 'price_new',
			type: 'recurring',
			recurring: { interval: 'month', interval_count: 1 },
		});

		// The existing schedule is released (stale)
		m.subscriptionSchedules.retrieve
			.mockResolvedValueOnce({ id: 'sub_sched_stale', status: 'released' })
			.mockResolvedValueOnce({
				id: 'sub_sched_fresh',
				current_phase: { start_date: 1700000000, end_date: 1702592000 },
			});

		m.subscriptionSchedules.create.mockResolvedValue({ id: 'sub_sched_fresh' });
		m.subscriptionSchedules.update.mockResolvedValue({ id: 'sub_sched_fresh' });

		const provider = new StripePaymentProvider('sk_test_dummy');
		const res = await provider.scheduleSubscriptionPlanChange?.('sub_stale', 'price_new', 'user_1');

		expect(res?.success).toBe(true);

		// Should have retrieved the stale schedule, then created a fresh one
		expect(m.subscriptionSchedules.retrieve).toHaveBeenCalledWith('sub_sched_stale');
		expect(m.subscriptionSchedules.create).toHaveBeenCalledWith({ from_subscription: 'sub_stale' });

		// Update should use the fresh schedule, not the stale one
		const [scheduleId] = m.subscriptionSchedules.update.mock.calls[0];
		expect(scheduleId).toBe('sub_sched_fresh');
	});
});
