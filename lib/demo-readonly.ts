const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Allow auth and webhook write traffic so sign-in flows and provider callbacks keep working.
const EXEMPT_PREFIXES = [
  '/api/auth/',
  '/api/webhooks/',
  '/api/stripe/webhook',
];

export function isDemoReadOnlyExemptPath(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function shouldBlockDemoReadOnlyMutation(input: {
  enabled: boolean;
  method: string;
  pathname: string;
}): boolean {
  if (!input.enabled) return false;
  if (!input.pathname.startsWith('/api/')) return false;
  if (!MUTATING_METHODS.has((input.method || '').toUpperCase())) return false;
  if (isDemoReadOnlyExemptPath(input.pathname)) return false;
  return true;
}
