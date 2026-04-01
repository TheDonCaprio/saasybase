const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

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

export function isLocalhostHostname(value: string | null | undefined): boolean {
  const hostname = parseHostname(value);
  return Boolean(hostname && LOCALHOST_HOSTNAMES.has(hostname));
}

export function isLocalhostDevBypassEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (!process.env.DEV_ADMIN_ID?.trim()) return false;

  const configuredHosts = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.APP_URL,
  ]
    .map(parseHostname)
    .filter((value): value is string => Boolean(value));

  if (configuredHosts.length === 0) {
    return false;
  }

  return configuredHosts.every((hostname) => LOCALHOST_HOSTNAMES.has(hostname));
}

export function canUseLocalhostDevBypass(requestHostOrUrl?: string | null): boolean {
  if (!isLocalhostDevBypassEnabled()) return false;
  if (!requestHostOrUrl) return true;
  return isLocalhostHostname(requestHostOrUrl);
}