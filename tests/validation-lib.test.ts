import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';

vi.mock('../lib/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { validateParams, withValidation } from '../lib/validation';

describe('lib/validation', () => {
  it('validateParams accepts valid input and rejects invalid input', () => {
    const schema = z.object({ id: z.string().min(1) });

    expect(validateParams(schema, { id: 'abc' })).toEqual({
      success: true,
      data: { id: 'abc' },
    });

    expect(validateParams(schema, { id: '' })).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Invalid input data',
      }),
    );
  });

  it('withValidation passes parsed JSON to the wrapped handler', async () => {
    const schema = z.object({ id: z.string().min(1) });
    const handler = vi.fn(async (_request: NextRequest, payload: { id: string }) => {
      return new Response(JSON.stringify({ ok: true, id: payload.id }), { status: 200 });
    });

    const request = new NextRequest('http://localhost/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'xyz' }),
    });

    const wrapped = withValidation(schema, handler);
    const response = await wrapped(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, id: 'xyz' });
    expect(handler).toHaveBeenCalledWith(request, { id: 'xyz' }, undefined);
  });

  it('withValidation returns 400 for invalid JSON payloads', async () => {
    const schema = z.object({ id: z.string().min(1) });
    const handler = vi.fn();

    const request = new NextRequest('http://localhost/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '' }),
    });

    const wrapped = withValidation(schema, handler);
    const response = await wrapped(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual(
      expect.objectContaining({
        error: 'Invalid input data',
      }),
    );
    expect(handler).not.toHaveBeenCalled();
  });
});