import { describe, expect, it } from 'vitest';

import { buildPendingSubscriptionSectionCopy } from '../lib/pending-subscription-display';

describe('buildPendingSubscriptionSectionCopy', () => {
  it('uses provider-confirmation copy when all pending subscriptions await confirmation', () => {
    expect(buildPendingSubscriptionSectionCopy([
      { isAwaitingPaymentConfirmation: true },
    ])).toEqual({
      title: 'Pending subscription changes',
      subtitle: 'These changes are waiting for payment provider confirmation before they can activate.',
      footerTitle: null,
      footerBody: null,
    });
  });

  it('keeps stacking copy for ordinary queued subscriptions', () => {
    expect(buildPendingSubscriptionSectionCopy([
      { isAwaitingPaymentConfirmation: false },
    ])).toEqual({
      title: 'Upcoming subscriptions',
      subtitle: 'Pending time will automatically activate when your current plan ends.',
      footerTitle: 'How stacking works',
      footerBody: 'Purchasing while already subscribed queues the new time so you never lose access. Activate early to swap plans immediately or let it auto-start on your renewal date.',
    });
  });
});