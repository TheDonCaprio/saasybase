export function shouldReloadOnBackNavigation(
  event: Pick<PageTransitionEvent, 'persisted'>,
  navigationType?: string,
): boolean {
  return event.persisted || navigationType === 'back_forward';
}