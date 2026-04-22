import { Logger } from './logger';

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const warnedKeys = new Set<string>();

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

function parseHostname(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`http://${trimmed}`);
    return normalizeHostname(url.hostname);
  } catch {
    const withoutPort = trimmed.replace(/:\d+$/, '');
    return withoutPort ? normalizeHostname(withoutPort) : null;
  }
}

function isLocalhostHostname(value: string | null | undefined): boolean {
  const hostname = parseHostname(value);
  return Boolean(hostname && LOCALHOST_HOSTNAMES.has(hostname));
}

function isExplicitLocalRuntime(requestUrl?: string | null): boolean {
  const configuredUrls = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.APP_URL,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const configuredHosts = configuredUrls.map(parseHostname).filter((value): value is string => Boolean(value));
  const configLooksLocal = configuredHosts.length > 0 && configuredHosts.every((hostname) => LOCALHOST_HOSTNAMES.has(hostname));

  if (!configLooksLocal) {
    return false;
  }

  if (!requestUrl) {
    return true;
  }

  return isLocalhostHostname(requestUrl);
}

function warnOnce(key: string, message: string, extra?: Record<string, unknown>) {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  Logger.warn(message, extra);
}

export function allowUnsignedClerkWebhookForLocalDebug(requestUrl?: string | null): boolean {
  const enabled = process.env.ALLOW_UNSIGNED_CLERK_WEBHOOKS === 'true';
  if (!enabled) return false;

  if (process.env.NODE_ENV === 'production') {
    warnOnce('unsigned-clerk-webhook-prod', 'Dangerous toggle ignored: ALLOW_UNSIGNED_CLERK_WEBHOOKS cannot be enabled in production');
    return false;
  }

  if (!isExplicitLocalRuntime(requestUrl)) {
    warnOnce(
      'unsigned-clerk-webhook-nonlocal',
      'Dangerous toggle ignored: ALLOW_UNSIGNED_CLERK_WEBHOOKS is only allowed for explicit localhost development',
      {
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
        requestUrl: requestUrl ?? null,
      }
    );
    return false;
  }

  warnOnce('unsigned-clerk-webhook-local', 'Dangerous toggle enabled: allowing unsigned Clerk webhooks for explicit localhost debugging only');
  return true;
}
