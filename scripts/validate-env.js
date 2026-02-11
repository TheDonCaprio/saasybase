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

  // Optionally check other important NEXT_PUBLIC_* urls here
  console.log('ENV VALIDATION OK');
  process.exit(0);
} catch (e) {
  fail(e.message || String(e));
}
