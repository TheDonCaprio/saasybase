#!/usr/bin/env node
// Simple environment validator used before dev/build
const { URL } = require('url');
const { loadRuntimeEnv } = require('./load-runtime-env');

function fail(msg) {
  console.error('ENV VALIDATION ERROR:', msg);
  process.exit(1);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseUrlOrFail(name, value) {
  try {
    return new URL(value);
  } catch (e) {
    fail(`${name} is not a valid URL: ${value}`);
  }
}

function isTruthyFlag(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isLocalHostname(hostname) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes((hostname || '').trim().toLowerCase());
}

function parseNodeVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version || '');
  if (!match) {
    fail(`Unable to parse Node.js version: ${version || 'unknown'}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(left, right) {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
}

function isSupportedNodeVersion(version) {
  if (version.major === 20) {
    return compareVersions(version, { major: 20, minor: 19, patch: 0 }) >= 0;
  }
  if (version.major === 22) {
    return compareVersions(version, { major: 22, minor: 12, patch: 0 }) >= 0;
  }
  return version.major >= 24;
}

async function main() {
  const currentNodeVersion = parseNodeVersion(process.versions.node);
  if (!isSupportedNodeVersion(currentNodeVersion)) {
    fail(
      `Unsupported Node.js runtime ${process.versions.node}. Use Node.js ^20.19.0, ^22.12.0, or >=24.0.0.`
    );
  }

  const secretLoadResult = await loadRuntimeEnv();
  if (secretLoadResult.enabled && secretLoadResult.failed.length > 0) {
    const failures = secretLoadResult.failed
      .map((entry) => `${entry.envName} <= ${entry.secretId}: ${entry.message}`)
      .join('\n');
    fail(`Google Secret Manager loading failed:\n${failures}`);
  }

  const val = process.env.NEXT_PUBLIC_APP_URL;
  if (!val) {
    fail('NEXT_PUBLIC_APP_URL is not set. Set it in your environment or .env file.');
  }
  const appUrl = parseUrlOrFail('NEXT_PUBLIC_APP_URL', val);
  const localAppRuntime = isLocalHostname(appUrl.hostname);

  const authProvider = process.env.NEXT_PUBLIC_AUTH_PROVIDER || process.env.AUTH_PROVIDER || 'clerk';
  if (authProvider === 'betterauth') {
    const betterAuthUrl = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_BETTER_AUTH_URL || '';
    if (!isNonEmptyString(betterAuthUrl)) {
      fail('BETTER_AUTH_URL or NEXT_PUBLIC_BETTER_AUTH_URL must be set when AUTH_PROVIDER=betterauth.');
    }

    const betterAuthParsedUrl = parseUrlOrFail(
      process.env.BETTER_AUTH_URL ? 'BETTER_AUTH_URL' : 'NEXT_PUBLIC_BETTER_AUTH_URL',
      betterAuthUrl
    );

    if (process.env.BETTER_AUTH_URL && process.env.NEXT_PUBLIC_BETTER_AUTH_URL) {
      const publicBetterAuthUrl = parseUrlOrFail('NEXT_PUBLIC_BETTER_AUTH_URL', process.env.NEXT_PUBLIC_BETTER_AUTH_URL);
      if (betterAuthParsedUrl.origin !== publicBetterAuthUrl.origin) {
        fail('BETTER_AUTH_URL and NEXT_PUBLIC_BETTER_AUTH_URL must share the same origin when AUTH_PROVIDER=betterauth.');
      }
    }

    const effectiveSecret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '';
    if (!isNonEmptyString(effectiveSecret)) {
      fail('BETTER_AUTH_SECRET, AUTH_SECRET, or NEXTAUTH_SECRET must be set when AUTH_PROVIDER=betterauth.');
    }

    if (betterAuthParsedUrl.origin !== appUrl.origin) {
      fail('BETTER_AUTH_URL must share the same origin as NEXT_PUBLIC_APP_URL for Better Auth callback and redirect safety.');
    }
  }

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

  if (isTruthyFlag(process.env.ALLOW_UNSIGNED_CLERK_WEBHOOKS) && !localAppRuntime) {
    fail('ALLOW_UNSIGNED_CLERK_WEBHOOKS may only be enabled for explicit localhost development. Disable it before using any non-local environment.');
  }

  if (process.env.NODE_ENV === 'production' && isTruthyFlag(process.env.ALLOW_SYNC_IN_PROD)) {
    fail('ALLOW_SYNC_IN_PROD must not be set in deployed production app environments. Use it only as a temporary script override when intentionally running a guarded backfill.');
  }

  // Optionally check other important NEXT_PUBLIC_* urls here
  console.log('ENV VALIDATION OK');
  process.exit(0);
}

main().catch((e) => {
  fail(e.message || String(e));
});
