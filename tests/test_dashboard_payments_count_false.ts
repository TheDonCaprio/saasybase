import assert from 'assert';
import { URL } from 'url';

// NOTE: This test expects to be run from the repository root with NODE_ENV and database env set.

async function run() {
  console.log('Running dashboard payments count=false test');

  // Construct a Request like Next's fetch API
  const url = 'http://localhost:3000/api/dashboard/payments?page=2&limit=10&count=false';
  const res = await fetch(url);
  const json = await res.json();

  console.log('Response keys:', Object.keys(json));

  // totalCount should be null or undefined when count=false
  assert.ok(json.totalCount === null || typeof json.totalCount === 'undefined', 'Expected totalCount to be omitted when count=false');

  // payments should be an array
  assert.ok(Array.isArray(json.payments), 'Expected payments array');

  console.log('Test passed: count=false omits totalCount and returns payments array');
}

run().catch(err => {
  console.error('Test failed', err);
  process.exit(1);
});
