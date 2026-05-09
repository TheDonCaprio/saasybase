export const asRecord = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null) ? v as Record<string, unknown> : null;

export const getNestedString = (obj: unknown, path: (string | number)[]): string | undefined => {
  let cur: unknown = obj;
  for (const p of path) {
    if (cur == null) return undefined;
    if (typeof p === 'number') {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[p];
    } else {
      if (typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
  }
  return typeof cur === 'string' ? cur : undefined;
};

export const getNestedNumber = (obj: unknown, path: (string | number)[]): number | undefined => {
  let cur: unknown = obj;
  for (const p of path) {
    if (cur == null) return undefined;
    if (typeof p === 'number') {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[p];
    } else {
      if (typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
  }
  if (typeof cur === 'number') return cur;
  if (typeof cur === 'string') {
    const parsed = Number(cur);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export const toError = (e: unknown): Error => {
  if (e instanceof Error) return e;
  try {
    return new Error(typeof e === 'string' ? e : JSON.stringify(e));
  } catch {
    return new Error(String(e));
  }
};

export const errorToLogDetails = (e: unknown): Record<string, unknown> => {
  const error = toError(e);

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
};

// Named exports only - avoid anonymous default export which trips import/no-anonymous-default-export
