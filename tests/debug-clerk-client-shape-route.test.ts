import { afterEach, describe, expect, it } from 'vitest';

import { GET } from '../app/api/debug/clerk-client-shape/route';

describe('debug clerk-client-shape route', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('returns 404 in production', async () => {
    process.env.NODE_ENV = 'production';

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: 'Not found' });
  });

  it('returns debug payload outside production', async () => {
    process.env.NODE_ENV = 'test';

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, message: 'clerk-client-shape debug route' });
  });
});