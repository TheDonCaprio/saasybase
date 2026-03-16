import { startTransition } from 'react';

type RefreshReason = 'token-expiry' | 'org-validity';

const TOKEN_EXPIRY_REVALIDATION_PREFIXES = [
  '/dashboard',
  '/admin',
];

const ORG_VALIDITY_REVALIDATION_PREFIXES = [
  '/dashboard',
  '/admin',
];

function getPrefixesForReason(reason: RefreshReason) {
  return reason === 'token-expiry'
    ? TOKEN_EXPIRY_REVALIDATION_PREFIXES
    : ORG_VALIDITY_REVALIDATION_PREFIXES;
}

export function getClientPathname() {
  return typeof window === 'undefined' ? '' : window.location.pathname;
}

export function canRevalidateVisibleRoute(reason: RefreshReason, pathname = getClientPathname()) {
  if (typeof document === 'undefined') {
    return false;
  }

  if (document.visibilityState !== 'visible' || document.hidden) {
    return false;
  }

  if (!pathname) {
    return false;
  }

  return getPrefixesForReason(reason).some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));
}

export function refreshVisibleRoute(
  router: { refresh: () => void },
  reason: RefreshReason,
  expectedPathname?: string,
) {
  const pathname = getClientPathname();

  if (expectedPathname && pathname !== expectedPathname) {
    return false;
  }

  if (!canRevalidateVisibleRoute(reason, pathname)) {
    return false;
  }

  startTransition(() => {
    router.refresh();
  });

  return true;
}