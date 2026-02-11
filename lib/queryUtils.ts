// Utility helpers for query transformation

export function stripMode(obj: unknown): unknown {
  // Keep internal handling tolerant; callers that need exact types should
  // cast at the Prisma boundary. This function strips `mode` keys from
  // nested objects/arrays safely.
  if (obj === null || typeof obj !== 'object') return obj;
  // Preserve Date objects as-is so Prisma receives real Date instances
  // instead of plain objects which can confuse the query builder.
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(stripMode);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (key === 'mode') continue;
    out[key] = stripMode((obj as Record<string, unknown>)[key]);
  }
  return out;
}

export function supportsPrismaInsensitiveFiltering(dbUrl = process.env.DATABASE_URL || ''): boolean {
  const normalized = dbUrl.trim().toLowerCase();
  if (!normalized) return true;
  return !(
    normalized.startsWith('file:') ||
    normalized.includes('sqlite') ||
    normalized.includes('libsql') ||
    normalized.includes('.db')
  );
}

export function buildStringContainsFilter(value: string, dbUrl?: string): Record<string, unknown> {
  return supportsPrismaInsensitiveFiltering(dbUrl) ? { contains: value, mode: 'insensitive' } : { contains: value };
}

export function sanitizeWhereForInsensitiveSearch<T extends Record<string, unknown>>(where: T, dbUrl?: string): T {
  return supportsPrismaInsensitiveFiltering(dbUrl) ? where : (stripMode(where) as T);
}

export function isPrismaModeError(err: unknown): boolean {
  const raw = err && ((err as Record<string, unknown>).message || (err as Error)?.toString && (err as Error).toString());
  const msg = typeof raw === 'string' ? raw : String(raw || '');
  const lowered = msg.toLowerCase();
  if (!msg) return false;
  if (lowered.includes('mode') && (lowered.includes('unknown') || lowered.includes('unknown argument') || lowered.includes('unknown arg') || lowered.includes('unsupported') || lowered.includes('did you mean') || lowered.includes('validation') || lowered.includes('invalid'))) {
    return true;
  }
  return msg.includes('Unknown argument `mode`');
}
