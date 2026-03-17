import { describe, expect, it } from 'vitest';

import { asRecord } from '../lib/runtime-guards';

function hasPendingProviderConfirmation(payload: unknown): boolean {
  const record = asRecord(payload);
  const pending = asRecord(record?.pending);
  return pending?.pendingConfirmation === true;
}

function getPendingProviderConfirmationPlanName(payload: unknown): string | null {
  const record = asRecord(payload);
  const pending = asRecord(record?.pending);
  return typeof pending?.plan === 'string' ? pending.plan : null;
}

describe('pricing card subscription guard', () => {
  it('blocks new plan actions when a provider-confirmation pending subscription exists', () => {
    expect(hasPendingProviderConfirmation({
      active: true,
      plan: '24 Hour Team Pro',
      pending: {
        id: 'sub_pending_1',
        plan: '24 Hour Team',
        pendingConfirmation: true,
      },
    })).toBe(true);
  });

  it('does not block ordinary queued pending subscriptions', () => {
    expect(hasPendingProviderConfirmation({
      active: true,
      plan: '24 Hour Team Pro',
      pending: {
        id: 'sub_pending_2',
        plan: '24 Hour Team',
        pendingConfirmation: false,
      },
    })).toBe(false);
  });

  it('extracts the pending confirmation plan name for disabled CTA messaging', () => {
    expect(getPendingProviderConfirmationPlanName({
      pending: {
        id: 'sub_pending_1',
        plan: '24 Hour Team',
        pendingConfirmation: true,
      },
    })).toBe('24 Hour Team');
  });
});