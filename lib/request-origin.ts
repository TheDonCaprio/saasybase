type HeaderSource = {
  get(name: string): string | null;
};

function getFirstHeaderValue(headers: HeaderSource, name: string) {
  return headers.get(name)?.split(',')[0]?.trim() || null;
}

function parseOrigin(candidate?: string | null) {
  if (!candidate) {
    return null;
  }

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

export function resolveRequestOrigin(input: { url: string; headers: HeaderSource }) {
  const requestUrl = new URL(input.url);
  const originHeader = parseOrigin(getFirstHeaderValue(input.headers, 'origin'));
  if (originHeader) {
    return originHeader;
  }

  const forwardedHost = getFirstHeaderValue(input.headers, 'x-forwarded-host');
  const forwardedProto = getFirstHeaderValue(input.headers, 'x-forwarded-proto');
  if (forwardedHost) {
    const protocol = forwardedProto || requestUrl.protocol.replace(/:$/, '') || 'https';
    return `${protocol}://${forwardedHost}`;
  }

  const host = getFirstHeaderValue(input.headers, 'host');
  if (host) {
    return `${requestUrl.protocol}//${host}`;
  }

  return requestUrl.origin;
}

export function resolveSameOriginUrl(input: { url: string; headers: HeaderSource }, pathOrUrl: string) {
  const requestOrigin = resolveRequestOrigin(input);

  try {
    if (pathOrUrl.startsWith('/')) {
      return new URL(pathOrUrl, requestOrigin).toString();
    }

    const candidate = new URL(pathOrUrl);
    return candidate.origin === requestOrigin ? candidate.toString() : undefined;
  } catch {
    return undefined;
  }
}