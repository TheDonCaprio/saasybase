export type PendingSubscriptionDisplayState = {
  isAwaitingPaymentConfirmation: boolean;
};

export function buildPendingSubscriptionSectionCopy(subscriptions: PendingSubscriptionDisplayState[]) {
  const awaitingCount = subscriptions.filter((subscription) => subscription.isAwaitingPaymentConfirmation).length;
  const queuedCount = subscriptions.length - awaitingCount;

  if (queuedCount === 0 && awaitingCount > 0) {
    return {
      title: 'Pending subscription changes',
      subtitle: 'These changes are waiting for payment provider confirmation before they can activate.',
      footerTitle: null,
      footerBody: null,
    };
  }

  if (queuedCount > 0 && awaitingCount > 0) {
    return {
      title: 'Pending subscriptions',
      subtitle: 'Queued subscriptions will start at renewal. Provider-confirmation changes will activate only after payment is confirmed.',
      footerTitle: 'How queued subscriptions work',
      footerBody: 'Purchasing while already subscribed can queue the new time so you never lose access. You can also activate eligible queued subscriptions early.',
    };
  }

  return {
    title: 'Upcoming subscriptions',
    subtitle: 'Pending time will automatically activate when your current plan ends.',
    footerTitle: 'How stacking works',
    footerBody: 'Purchasing while already subscribed queues the new time so you never lose access. Activate early to swap plans immediately or let it auto-start on your renewal date.',
  };
}