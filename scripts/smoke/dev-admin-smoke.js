#!/usr/bin/env node
/*
  Dev-admin smoke test
  - Loads .env.local
  - Upserts a user with id=DEV_ADMIN_ID and role ADMIN
  - Calls admin endpoints on localhost:3000 and prints status, headers and body
*/
require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fetch = global.fetch || require('node-fetch');

async function upsertDevAdmin() {
  const id = process.env.DEV_ADMIN_ID;
  if (!id) {
    console.error('DEV_ADMIN_ID not set in .env.local');
    process.exit(2);
  }

  console.log('Upserting dev admin user', id);
  // Respect an optional DEV_ADMIN_EMAIL for creation, but do NOT overwrite
  // an existing user's email when running the smoke script. Only ensure the
  // role is set to ADMIN for existing users.
  const createEmail = process.env.DEV_ADMIN_EMAIL || 'dev-admin@example.local';
  await prisma.user.upsert({
    where: { id },
    update: { role: 'ADMIN' },
    create: { id, email: createEmail, role: 'ADMIN' }
  });
}

async function doFetch(method, path, body) {
  const url = `http://localhost:3000${path}`;
  const opts = { method, headers: { Accept: 'application/json' } };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  console.log(`\n-> ${method} ${url}`);
  const res = await fetch(url, opts);
  console.log('Status:', res.status);
  console.log('Headers:');
  for (const [k, v] of res.headers) {
    if (k.toLowerCase().startsWith('x-ratelimit') || k.toLowerCase().startsWith('retry-after') || k.startsWith('x-clerk')) {
      console.log(' ', k + ':', v);
    }
  }
  let txt;
  try { txt = await res.text(); } catch (e) { txt = '<failed to read body>'; }
  console.log('Body:', txt);
  return res;
}

async function main() {
  try {
    await upsertDevAdmin();

    // Small delay to ensure DB writes are visible to server
    await new Promise(r => setTimeout(r, 200));

    await doFetch('GET', '/api/admin/settings?key=smoke_test');
    await doFetch('POST', '/api/admin/settings', { key: 'smoke_test_script', value: 'ok' });
    await doFetch('POST', '/api/admin/payments/backfill-invoices');
    // Patch user role for the dev admin user (toggle to USER then back to ADMIN)
    const devId = process.env.DEV_ADMIN_ID;
    await doFetch('PATCH', `/api/admin/users/${devId}/role`, { role: 'ADMIN' });

    console.log('\nSmoke tests completed');
  } catch (err) {
    console.error('Smoke test failed', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
