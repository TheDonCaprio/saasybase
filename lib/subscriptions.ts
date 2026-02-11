// Small runtime helper to pick the canonical active subscription from a user's subscriptions
export interface SubRecord {
  id?: string;
  status?: string | null;
  plan?: { id?: string | null; name?: string | null; durationHours?: number | null } | null;
  createdAt?: string | Date | null;
  expiresAt?: string | Date | null;
}

export function getCanonicalActiveSubscription(subs: unknown): SubRecord | null {
  if (!Array.isArray(subs) || subs.length === 0) return null;
  // Prefer ACTIVE subscriptions, then choose the one with latest expiresAt, then newest createdAt.
  const active = subs.filter(s => s && s.status === 'ACTIVE');
  const candidates = active.length > 0 ? active : subs.slice();

  candidates.sort((a, b) => {
    const aExp = a?.expiresAt ? new Date(a.expiresAt as string).getTime() : 0;
    const bExp = b?.expiresAt ? new Date(b.expiresAt as string).getTime() : 0;
    if (aExp !== bExp) return bExp - aExp; // descending
    const aCreated = a?.createdAt ? new Date(a.createdAt as string).getTime() : 0;
    const bCreated = b?.createdAt ? new Date(b.createdAt as string).getTime() : 0;
    return bCreated - aCreated;
  });

  return candidates.length > 0 ? candidates[0] : null;
}

export default getCanonicalActiveSubscription;
