const assert = require('assert');
const { validateParams, withValidation } = require('../.build/lib/validation');
const z = require('zod');

async function run() {
  console.log('Running compiled validation lib tests');

  const schema = z.object({ id: z.string().min(1) });

  const good = validateParams(schema, { id: 'abc' });
  assert.ok(good.success === true, 'Expected validation to succeed for good input');

  const bad = validateParams(schema, { id: '' });
  assert.ok(bad.success === false, 'Expected validation to fail for empty id');

  const handler = async (_req, data) => {
    return new Response(JSON.stringify({ ok: true, id: data.id }), { status: 200 });
  };

  // Fake a minimal Request-like object
  const fakeReq = {
    method: 'POST',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({ id: 'xyz' }),
    url: 'http://localhost/test'
  };

  const wrapped = withValidation(schema, handler);
  const res = await wrapped(fakeReq, undefined);
  const body = await res.json();
  assert.ok(body.id === 'xyz', 'Expected handler to receive parsed data');

  console.log('Compiled validation lib tests passed');
}

run().catch(err => {
  console.error('Tests failed', err);
  process.exit(1);
});
