const assert = require('assert');
const { AppError, createErrorResponse, sanitizeContext, safeErrorMessage } = require('../.build/lib/secure-errors');

async function run() {
  console.log('Running compiled secure-errors tests');

  const ctx = { userId: 'u_123', details: { a: 1 }, fn: () => {} };
  const err = new AppError('Bad input', 'VALIDATION_ERROR', 400, true, ctx);

  // Force development behavior
  process.env.NODE_ENV = 'development';

  const res = createErrorResponse(err);
  const body = await res.json();

  assert.ok(body.error && typeof body.error === 'string', 'Expected error message');
  assert.ok(body.code === 'VALIDATION_ERROR', 'Expected code');
  assert.ok(body.context && body.context.userId === 'u_123', 'Expected sanitized context');

  // sanitizeContext should ignore functions
  const s = sanitizeContext(ctx);
  assert.ok(!s.fn, 'Expected function properties to be removed');

  console.log('secure-errors tests passed');
}

run().catch(err => {
  console.error('Tests failed', err);
  process.exit(1);
});
