const SAFARI_VERSION_CUTOFF = 18;

export function shouldDisableLandingDemoTilt(userAgent: string): boolean {
  const normalizedUserAgent = userAgent.trim();

  if (!normalizedUserAgent) {
    return false;
  }

  const isMacSafari =
    normalizedUserAgent.includes('Macintosh')
    && normalizedUserAgent.includes('Safari/')
    && !/(Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS)/.test(normalizedUserAgent);

  if (!isMacSafari) {
    return false;
  }

  const versionMatch = normalizedUserAgent.match(/Version\/(\d+)/);
  if (!versionMatch) {
    return true;
  }

  const safariMajorVersion = Number.parseInt(versionMatch[1], 10);
  if (!Number.isFinite(safariMajorVersion)) {
    return true;
  }

  return safariMajorVersion < SAFARI_VERSION_CUTOFF;
}