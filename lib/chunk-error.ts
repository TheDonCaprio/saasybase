export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const maybeMessage = 'message' in error ? (error as { message?: unknown }).message : undefined;
    if (typeof maybeMessage === 'string') return maybeMessage;
    const maybeReason = 'reason' in error ? (error as { reason?: unknown }).reason : undefined;
    if (typeof maybeReason === 'string') return maybeReason;
    if (maybeReason && typeof maybeReason === 'object' && 'message' in maybeReason) {
      const nested = (maybeReason as { message?: unknown }).message;
      if (typeof nested === 'string') return nested;
    }
  }
  return '';
}

export function isChunkLoadError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const name = error && typeof error === 'object' && 'name' in error
    ? String((error as { name?: unknown }).name ?? '').toLowerCase()
    : '';

  return (
    name.includes('chunkloaderror')
    || message.includes('chunkloaderror')
    || message.includes('failed to load chunk')
    || message.includes('loading chunk')
    || message.includes('dynamically imported module')
    || message.includes('/_next/static/chunks/')
  );
}
