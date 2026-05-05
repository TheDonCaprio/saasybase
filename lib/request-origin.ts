type HeaderSource = {
  get(name: string): string | null;
};

import { getPreferredPublicOrigin, isSameOriginUrl, normalizeAppRedirectPath } from './url-security';

function getFirstHeaderValue(headers: HeaderSource, name: string) {
  return headers.get(name)?.split(',')[0]?.trim() || null;
}

export function resolveRequestOrigin(input: { url: string; headers: HeaderSource }) {
  const requestUrl = new URL(input.url);
  const forwardedHost = getFirstHeaderValue(input.headers, 'x-forwarded-host');
  const forwardedProto = getFirstHeaderValue(input.headers, 'x-forwarded-proto');
  if (forwardedHost) {
    const protocol = forwardedProto || requestUrl.protocol.replace(/:$/, '') || 'https';
    return `${protocol}://${forwardedHost}`;
  }

  const configuredOrigin = getPreferredPublicOrigin();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  const host = getFirstHeaderValue(input.headers, 'host');
  if (host) {
    return `${requestUrl.protocol}//${host}`;
  }

  return requestUrl.origin;
}

export function resolveSameOriginUrl(input: { url: string; headers: HeaderSource }, pathOrUrl: string) {
  const requestOrigin = resolveRequestOrigin(input);
  const normalizedPath = normalizeAppRedirectPath(pathOrUrl, {
    fallbackPath: '',
    allowedOrigins: [requestOrigin],
  });

  if (normalizedPath) {
    return new URL(normalizedPath, requestOrigin).toString();
  }

  try {
    const candidate = new URL(pathOrUrl);
    return isSameOriginUrl(candidate.toString(), [requestOrigin]) ? candidate.toString() : undefined;
  } catch {
    return undefined;
  }
}