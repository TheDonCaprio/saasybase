import { describe, expect, it } from 'vitest';

import { deriveSubscriptionWebhookState } from '../lib/payment/subscription-webhook-state';

describe('Paystack switch-now provisional webhook state', () => {
	it('keeps a provisionally pending Paystack switch in PENDING until payment evidence exists', () => {
		const now = new Date('2026-03-17T10:00:00.000Z');
		const nextPeriodEnd = new Date('2026-04-17T10:00:00.000Z');

		const result = deriveSubscriptionWebhookState({
			status: 'active',
			currentPeriodEnd: nextPeriodEnd,
			dbStatus: 'PENDING',
			dbProrationPendingSince: now,
			dbCanceledAt: null,
			dbExpiresAt: nextPeriodEnd,
			providerKey: 'paystack',
		});

		expect(result.normalizedStatus).toBe('ACTIVE');
		expect(result.effectiveStatus).toBe('PENDING');
		expect(result.effectiveExpiresAt).toEqual(nextPeriodEnd);
	});
});