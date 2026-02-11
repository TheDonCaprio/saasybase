#!/usr/bin/env node
// Smoke test for notifications pagination (page + cursor)
// Usage: BASE_URL=http://localhost:3000 node ./scripts/smoke-notifications.js

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const LIMIT = parseInt(process.env.LIMIT || '3', 10);

async function okOrExit(msg, cond) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

(async () => {
  try {
    console.log(`Base URL: ${BASE}`);

    const headers = {};
    if (process.env.AUTH_COOKIE) {
      // pass full cookie string (e.g. "__session=...; Other=...")
      headers['cookie'] = process.env.AUTH_COOKIE;
    }
    if (process.env.AUTH_HEADER) {
      // pass an Authorization header value
      headers['authorization'] = process.env.AUTH_HEADER;
    }

    // Fetch page 1
    const page1Url = `${BASE}/api/notifications?limit=${LIMIT}`;
    console.log('Requesting page 1 ->', page1Url);
    const res1 = await fetch(page1Url, { headers });
    if (res1 && res1.status === 401) {
      console.error('FAIL: page1 unauthorized (401). The notifications API requires an authenticated user.');
      console.error('To run this smoke test provide a valid session cookie via AUTH_COOKIE or an auth header via AUTH_HEADER environment variable.');
      console.error('Example (macOS/zsh):');
      console.error('  AUTH_COOKIE="__session=...;" BASE_URL=http://localhost:3000 node ./scripts/smoke-notifications.js');
      process.exit(2);
    }
    okOrExit('page1 request failed', res1 && res1.ok);
    const data1 = await res1.json();

    okOrExit('page1.notifications missing or not array', Array.isArray(data1.notifications));
    console.log(`page1.notifications.length = ${data1.notifications.length}`);

    // Expect server to provide nextCursor for progressive flows; it's optional but we require it for this smoke test
    okOrExit('nextCursor not provided by server (cannot test cursor flow)', data1.nextCursor);
    const nextCursor = data1.nextCursor;
    console.log('nextCursor:', nextCursor);

    // Fetch with cursor
    const cursorUrl = `${BASE}/api/notifications?cursor=${encodeURIComponent(nextCursor)}&limit=${LIMIT}&count=false`;
    console.log('Requesting cursor page ->', cursorUrl);
  const res2 = await fetch(cursorUrl, { headers });
  okOrExit('cursor request failed', res2 && res2.ok);
    const data2 = await res2.json();

    okOrExit('cursor.notifications missing or not array', Array.isArray(data2.notifications));
    console.log(`cursor.notifications.length = ${data2.notifications.length}`);

    // Basic dedupe check: ensure no overlapping ids between page1 and cursor page
    const ids1 = new Set(data1.notifications.map(n => n.id));
    const ids2 = data2.notifications.map(n => n.id);
    const overlap = ids2.filter(id => ids1.has(id));

    okOrExit('cursor page returned overlapping ids with page1 (expected disjoint)', overlap.length === 0);

    console.log('PASS: notifications cursor smoke test succeeded');
    process.exit(0);
  } catch (err) {
    console.error('FAIL: unexpected error during smoke test', err);
    process.exit(1);
  }
})();
