const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CHECKOUT_INITIATION_PATHS = new Set(['/api/checkout', '/api/checkout/embedded']);

// Allow auth and webhook write traffic so sign-in flows and provider callbacks keep working.
const EXEMPT_PREFIXES = [
  '/api/auth/',
  '/api/webhooks/',
  '/api/stripe/webhook',
];

function parseDemoReadOnlyIdentityList(raw: string | undefined): Set<string> {
  if (!raw) return new Set();

  return new Set(
    raw
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function normalizeDemoReadOnlyEmail(email: string | null | undefined): string | null {
  const trimmed = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return trimmed || null;
}

function normalizeDemoReadOnlyUserId(userId: string | null | undefined): string | null {
  const trimmed = typeof userId === 'string' ? userId.trim() : '';
  return trimmed || null;
}

export function hasDemoReadOnlyExemptEmailsConfigured(): boolean {
  return parseDemoReadOnlyIdentityList(process.env.DEMO_READ_ONLY_EXEMPT_EMAILS).size > 0;
}

export function isDemoReadOnlyIdentityExempt(input: {
  userId?: string | null;
  email?: string | null;
}): boolean {
  const exemptUserIds = parseDemoReadOnlyIdentityList(process.env.DEMO_READ_ONLY_EXEMPT_USER_IDS);
  const exemptEmails = parseDemoReadOnlyIdentityList(process.env.DEMO_READ_ONLY_EXEMPT_EMAILS);
  const normalizedUserId = normalizeDemoReadOnlyUserId(input.userId);
  const normalizedEmail = normalizeDemoReadOnlyEmail(input.email);

  if (normalizedUserId && exemptUserIds.has(normalizedUserId)) {
    return true;
  }

  if (normalizedEmail && exemptEmails.has(normalizedEmail)) {
    return true;
  }

  return false;
}

export function resolveDemoReadOnlyMode(input: {
  enabled: boolean;
  userId?: string | null;
  email?: string | null;
}): boolean {
  if (!input.enabled) return false;
  return !isDemoReadOnlyIdentityExempt(input);
}

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
  userId?: string | null;
  email?: string | null;
}): boolean {
  if (!input.enabled) return false;
  if (isDemoReadOnlyIdentityExempt(input)) return false;
  if (!input.pathname.startsWith('/api/')) return false;
  if (isDemoReadOnlyExemptPath(input.pathname)) return false;
  if (isDemoReadOnlyCheckoutInitiationPath(input.pathname)) return true;
  if (!MUTATING_METHODS.has((input.method || '').toUpperCase())) return false;
  return true;
}
