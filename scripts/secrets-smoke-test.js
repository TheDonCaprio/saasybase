#!/usr/bin/env node

const { formatSecretLoadFailures, formatSecretLoadSummary, loadRuntimeEnv } = require('./load-runtime-env');

function parseList(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function isSet(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0;
}

function pushCheck(checks, label, envNames) {
  checks.push({ label, envNames });
}

function buildDefaultChecks() {
  const checks = [];
  pushCheck(checks, 'database', ['DATABASE_URL']);
  pushCheck(checks, 'encryption', ['ENCRYPTION_SECRET']);
  pushCheck(checks, 'internal api token', ['INTERNAL_API_TOKEN']);
  pushCheck(checks, 'health token', ['HEALTHCHECK_TOKEN']);
  pushCheck(checks, 'cron token', ['CRON_PROCESS_EXPIRY_TOKEN', 'CRON_SECRET', 'CRON_TOKEN']);

  const authProvider = (process.env.AUTH_PROVIDER || process.env.NEXT_PUBLIC_AUTH_PROVIDER || 'clerk').trim().toLowerCase();
  if (authProvider === 'clerk') {
    pushCheck(checks, 'clerk publishable key', ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY']);
    pushCheck(checks, 'clerk secret key', ['CLERK_SECRET_KEY']);
    pushCheck(checks, 'clerk webhook secret', ['CLERK_WEBHOOK_SECRET']);
  } else if (authProvider === 'betterauth') {
    pushCheck(checks, 'better auth secret', ['BETTER_AUTH_SECRET', 'AUTH_SECRET', 'NEXTAUTH_SECRET']);
  } else if (authProvider === 'nextauth') {
    pushCheck(checks, 'nextauth secret', ['NEXTAUTH_SECRET', 'AUTH_SECRET']);
  }

  const paymentProvider = (process.env.PAYMENT_PROVIDER || 'stripe').trim().toLowerCase();
  if (paymentProvider === 'stripe') {
    pushCheck(checks, 'stripe publishable key', ['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY']);
    pushCheck(checks, 'stripe secret key', ['STRIPE_SECRET_KEY']);
    pushCheck(checks, 'stripe webhook secret', ['STRIPE_WEBHOOK_SECRET']);
  } else if (paymentProvider === 'paddle') {
    pushCheck(checks, 'paddle client token', ['NEXT_PUBLIC_PADDLE_CLIENT_TOKEN']);
    pushCheck(checks, 'paddle api key', ['PADDLE_API_KEY']);
    pushCheck(checks, 'paddle webhook secret', ['PADDLE_WEBHOOK_SECRET']);
  } else if (paymentProvider === 'paystack') {
    pushCheck(checks, 'paystack public key', ['NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY']);
    pushCheck(checks, 'paystack secret key', ['PAYSTACK_SECRET_KEY']);
  } else if (paymentProvider === 'razorpay') {
    pushCheck(checks, 'razorpay public key', ['NEXT_PUBLIC_RAZORPAY_KEY_ID']);
    pushCheck(checks, 'razorpay key secret', ['RAZORPAY_KEY_SECRET']);
    pushCheck(checks, 'razorpay webhook secret', ['RAZORPAY_WEBHOOK_SECRET']);
  }

  const emailProvider = (process.env.EMAIL_PROVIDER || 'nodemailer').trim().toLowerCase();
  if (emailProvider === 'resend') {
    pushCheck(checks, 'resend api key', ['RESEND_API_KEY']);
  } else if (emailProvider === 'nodemailer' && (isSet('SMTP_HOST') || isSet('SMTP_USER'))) {
    pushCheck(checks, 'smtp password', ['SMTP_PASS']);
  }

  for (const envName of parseList(process.env.SECRETS_SMOKE_REQUIRED_VARS)) {
    pushCheck(checks, envName, [envName]);
  }

  return checks;
}

function printHelp() {
  console.log(`Secrets bootstrap smoke test\n\nUsage:\n  npm run secrets:smoke\n  SECRETS_PROVIDER=infisical npm run secrets:smoke\n  SECRETS_PROVIDER=doppler npm run secrets:smoke\n\nOptional env vars:\n  SECRETS_SMOKE_REQUIRED_VARS  Comma-separated env vars to require in addition to defaults\n  SECRETS_PROVIDER             infisical or doppler\n  SECRETS_PROVIDER_COMMAND     Override the built-in provider command entirely\n`);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const secretLoadResult = await loadRuntimeEnv();
  if (secretLoadResult.failed.length > 0) {
    console.error(`Secrets bootstrap smoke test failed during fetch:\n${formatSecretLoadFailures(secretLoadResult)}`);
    process.exit(1);
  }

  const checks = buildDefaultChecks();
  const missing = checks.filter((check) => !check.envNames.some((envName) => isSet(envName)));

  if (missing.length > 0) {
    const details = missing
      .map((check) => `${check.label}: expected one of [${check.envNames.join(', ')}]`)
      .join('\n');
    console.error(`Secrets bootstrap smoke test failed. Missing resolved values:\n${details}`);
    process.exit(1);
  }

  const loadedSummary = secretLoadResult.loaded.length > 0 ? secretLoadResult.loaded.join(', ') : 'none';
  const skippedSummary = secretLoadResult.skipped.length > 0 ? secretLoadResult.skipped.join(', ') : 'none';
  console.log('Secrets smoke test OK');
  console.log(`Provider: ${secretLoadResult.provider || 'platform-env-only'}`);
  if (secretLoadResult.command) {
    console.log(`Command: ${secretLoadResult.command}`);
  }
  console.log(formatSecretLoadSummary(secretLoadResult, 'Secrets smoke env'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});