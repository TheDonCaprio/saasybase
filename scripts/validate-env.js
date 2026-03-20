#!/usr/bin/env node
// Simple environment validator used before dev/build
const { URL } = require('url');
// Load dotenv to read .env files (respect common Next.js .env precedence)
try {
  // prefer dotenv-safe style: load .env.local, .env.development, then .env
  const dotenv = require('dotenv');
  const fs = require('fs');
  const path = require('path');

  const root = path.resolve(__dirname, '..');
  const candidates = ['.env.local', '.env.development', '.env'];
  for (const name of candidates) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
    }
  }
} catch (e) {
  // if dotenv isn't installed or reading fails, continue — validation will still run against process.env
}

function fail(msg) {
  console.error('ENV VALIDATION ERROR:', msg);
  process.exit(1);
}

try {
  const val = process.env.NEXT_PUBLIC_APP_URL;
  if (!val) {
    fail('NEXT_PUBLIC_APP_URL is not set. Set it in your environment or .env file.');
  }
  // Validate URL
  try {
    new URL(val);
  } catch (e) {
    fail(`NEXT_PUBLIC_APP_URL is not a valid URL: ${val}`);
  }

  const authProvider = process.env.NEXT_PUBLIC_AUTH_PROVIDER || process.env.AUTH_PROVIDER || 'clerk';
  if (authProvider === 'clerk' && process.env.NODE_ENV === 'production') {
    const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
    const secretKey = process.env.CLERK_SECRET_KEY || '';

    if (publishableKey.startsWith('pk_test_')) {
      fail('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY uses a Clerk test/development key while NODE_ENV=production. Use a live Clerk publishable key before deploying.');
    }

    if (secretKey.startsWith('sk_test_')) {
      fail('CLERK_SECRET_KEY uses a Clerk test/development key while NODE_ENV=production. Use a live Clerk secret key before deploying.');
    }
  }

  // Optionally check other important NEXT_PUBLIC_* urls here
  console.log('ENV VALIDATION OK');
  process.exit(0);
} catch (e) {
  fail(e.message || String(e));
}
