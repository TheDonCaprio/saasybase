export function isCurrentPageNotFound() {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return false;
  }

  if (window.location.pathname === '/404') {
    return true;
  }

  return document.querySelector('[data-not-found-page="true"]') !== null;
}