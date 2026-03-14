import assert from 'assert';
import { NextRequest } from 'next/server.js';
import { validateParams, withValidation } from '../lib/validation';
import { z } from 'zod';

async function run() {
  console.log('Running validation lib tests');

  // validateParams should accept unknown input
  const schema = z.object({ id: z.string().min(1) });

  const good = validateParams(schema, { id: 'abc' });
  assert.ok(good.success === true, 'Expected validation to succeed for good input');

  const bad = validateParams(schema, { id: '' });
  assert.ok(bad.success === false, 'Expected validation to fail for empty id');

  // withValidation returns a handler; we simulate calling it with a minimal Request
  const handler = async (_req: Request, data: { id: string }) => {
    return new Response(JSON.stringify({ ok: true, id: data.id }), { status: 200 });
  };

  const headers = new Headers();
  headers.set('content-type', 'application/json');

  const fakeReq = new NextRequest('http://localhost/test', {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: 'xyz' })
  });

  const wrapped = withValidation(schema, handler);
  const res = await wrapped(fakeReq);
  const body = await res.json();
  assert.ok(body.id === 'xyz', 'Expected handler to receive parsed data');

  console.log('validation lib tests passed');
}

run().catch(err => {
  console.error('Tests failed', err);
  process.exit(1);
});
