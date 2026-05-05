const CONFIGURED_ORIGIN_ENV_KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'APP_URL',
  'AUTH_URL',
  'NEXTAUTH_URL',
  'BETTER_AUTH_URL',
  'NEXT_PUBLIC_BETTER_AUTH_URL',
] as const;

function parseOrigin(candidate?: string | null): string | null {
  if (!candidate) {
    return null;
  }

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

export function getConfiguredPublicOrigins(): string[] {
  return Array.from(
    new Set(
      CONFIGURED_ORIGIN_ENV_KEYS
        .map((key) => parseOrigin(process.env[key]))
        .filter((value): value is string => Boolean(value))
    )
  );
}

export function getPreferredPublicOrigin(): string | null {
  return getConfiguredPublicOrigins()[0] || null;
}

type NormalizeRedirectOptions = {
  fallbackPath: string;
  disallowedPaths?: string[];
  disallowedPathPrefixes?: string[];
  allowedOrigins?: string[];
};

function hasBackslash(value: string): boolean {
  return value.includes('\\');
}

function isProtocolRelativePath(value: string): boolean {
  return value.startsWith('//');
}

function isValidAppPath(value: string): boolean {
  return value.startsWith('/') && !isProtocolRelativePath(value) && !hasBackslash(value);
}

function normalizeAbsoluteUrlToPath(value: string, allowedOrigins: string[]): string | null {
  try {
    const parsed = new URL(value);
    if (!allowedOrigins.includes(parsed.origin)) {
      return null;
    }

    const normalizedPath = `${parsed.pathname}${parsed.search}` || '/';
    return isValidAppPath(normalizedPath) ? normalizedPath : null;
  } catch {
    return null;
  }
}

export function normalizeAppRedirectPath(input: string | null | undefined, options: NormalizeRedirectOptions): string {
  const {
    fallbackPath,
    disallowedPaths = [],
    disallowedPathPrefixes = [],
    allowedOrigins = getConfiguredPublicOrigins(),
  } = options;

  if (!input || typeof input !== 'string') {
    return fallbackPath;
  }

  const trimmed = input.trim();
  if (!trimmed || hasBackslash(trimmed)) {
    return fallbackPath;
  }

  let candidate = trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const normalizedAbsolute = normalizeAbsoluteUrlToPath(trimmed, allowedOrigins);
    if (!normalizedAbsolute) {
      return fallbackPath;
    }
    candidate = normalizedAbsolute;
  }

  if (!isValidAppPath(candidate)) {
    return fallbackPath;
  }

  if (disallowedPaths.includes(candidate)) {
    return fallbackPath;
  }

  if (disallowedPathPrefixes.some((prefix) => candidate === prefix || candidate.startsWith(`${prefix}/`) || candidate.startsWith(`${prefix}?`))) {
    return fallbackPath;
  }

  return candidate;
}

export function isSameOriginUrl(candidate: string, allowedOrigins: string[]): boolean {
  const parsed = parseOrigin(candidate);
  return Boolean(parsed && allowedOrigins.includes(parsed));
}