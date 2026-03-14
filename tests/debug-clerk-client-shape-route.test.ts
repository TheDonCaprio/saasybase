import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../app/api/debug/clerk-client-shape/route';

describe('debug clerk-client-shape route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 404 in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: 'Not found' });
  });

  it('returns debug payload outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, message: 'clerk-client-shape debug route' });
  });
});