const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CHECKOUT_INITIATION_PATHS = new Set(['/api/checkout', '/api/checkout/embedded']);

// Allow auth and webhook write traffic so sign-in flows and provider callbacks keep working.
const EXEMPT_PREFIXES = [
  '/api/auth/',
  '/api/webhooks/',
  '/api/stripe/webhook',
];

export function isDemoReadOnlyExemptPath(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isDemoReadOnlyCheckoutInitiationPath(pathname: string): boolean {
  return CHECKOUT_INITIATION_PATHS.has(pathname);
}

export function shouldBlockDemoReadOnlyMutation(input: {
  enabled: boolean;
  method: string;
  pathname: string;
}): boolean {
  if (!input.enabled) return false;
  if (!input.pathname.startsWith('/api/')) return false;
  if (isDemoReadOnlyExemptPath(input.pathname)) return false;
  if (isDemoReadOnlyCheckoutInitiationPath(input.pathname)) return true;
  if (!MUTATING_METHODS.has((input.method || '').toUpperCase())) return false;
  return true;
}
