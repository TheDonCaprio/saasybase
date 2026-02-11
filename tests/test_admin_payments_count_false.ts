import assert from 'assert';
import { URL } from 'url';

async function run() {
  console.log('Running admin payments count=false test');
  const url = 'http://localhost:3000/api/admin/payments?page=2&limit=10&count=false';
  const res = await fetch(url);
  const json = await res.json();

  console.log('Response keys:', Object.keys(json));

  assert.ok(json.totalCount === null || typeof json.totalCount === 'undefined', 'Expected totalCount to be omitted when count=false');
  assert.ok(Array.isArray(json.payments), 'Expected payments array');

  console.log('Test passed: admin payments count=false omits totalCount and returns payments array');
}

run().catch(err => {
  console.error('Test failed', err);
  process.exit(1);
});
