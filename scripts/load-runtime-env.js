#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const DEFAULT_SECRET_ENV_NAMES = [
  'DATABASE_URL',
  'ENCRYPTION_SECRET',
  'INTERNAL_API_TOKEN',
  'HEALTHCHECK_TOKEN',
  'CRON_PROCESS_EXPIRY_TOKEN',
  'CRON_TOKEN',
  'AUTH_SECRET',
  'NEXTAUTH_SECRET',
  'BETTER_AUTH_SECRET',
  'CLERK_SECRET_KEY',
  'CLERK_WEBHOOK_SECRET',
  'GITHUB_CLIENT_SECRET',
  'GOOGLE_CLIENT_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'PADDLE_API_KEY',
  'PADDLE_WEBHOOK_SECRET',
  'PAYSTACK_SECRET_KEY',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'SMTP_PASS',
  'RESEND_API_KEY',
  'GA_SERVICE_ACCOUNT_CREDENTIALS_B64',
  'IPINFO_LITE_TOKEN',
  'SEED_ADMIN_PASSWORD',
  'PLAYWRIGHT_E2E_ADMIN_PASSWORD',
  'PLAYWRIGHT_E2E_PASSWORD',
];

function parseBooleanFlag(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function loadDotenvFiles() {
  try {
    const dotenv = require('dotenv');
    const root = path.resolve(__dirname, '..');
    const candidates = ['.env.local', '.env.development', '.env'];
    for (const name of candidates) {
      const filePath = path.join(root, name);
      if (fs.existsSync(filePath)) {
        dotenv.config({ path: filePath });
      }
    }
  } catch {
    // Optional dependency path; fall back to existing process.env.
  }
}

function parseSecretList(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [...DEFAULT_SECRET_ENV_NAMES];
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

function toSecretIdSegment(value, fallback) {
  const source = typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  return source.replace(/[^A-Za-z0-9_-]/g, '-');
}

function parseJsonCredentials(rawValue, envName) {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`${envName} does not contain valid JSON credentials`);
  }
}

function parseBase64JsonCredentials(rawValue, envName) {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(rawValue, 'base64').toString('utf8'));
  } catch (error) {
    throw new Error(`${envName} does not contain valid base64-encoded JSON credentials`);
  }
}

function resolveGoogleAuthOptions() {
  const directJson = parseJsonCredentials(
    process.env.GOOGLE_SECRET_MANAGER_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON,
    process.env.GOOGLE_SECRET_MANAGER_SERVICE_ACCOUNT_JSON ? 'GOOGLE_SECRET_MANAGER_SERVICE_ACCOUNT_JSON' : 'GOOGLE_SERVICE_ACCOUNT_KEY_JSON'
  );

  const base64Json = parseBase64JsonCredentials(
    process.env.GOOGLE_SECRET_MANAGER_SERVICE_ACCOUNT_JSON_B64 || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON_B64,
    process.env.GOOGLE_SECRET_MANAGER_SERVICE_ACCOUNT_JSON_B64
      ? 'GOOGLE_SECRET_MANAGER_SERVICE_ACCOUNT_JSON_B64'
      : 'GOOGLE_SERVICE_ACCOUNT_KEY_JSON_B64'
  );

  return {
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    ...(directJson ? { credentials: directJson } : {}),
    ...(!directJson && base64Json ? { credentials: base64Json } : {}),
  };
}

function buildSecretId(envName, options) {
  const prefix = toSecretIdSegment(options.prefix, 'saasybase');
  const environment = toSecretIdSegment(options.environment, 'production');
  return `${prefix}-${environment}-${envName}`;
}

async function accessSecretVersion({ auth, projectId, secretId, version }) {
  const client = await auth.getClient();
  const accessTokenResponse = await client.getAccessToken();
  const accessToken = typeof accessTokenResponse === 'string'
    ? accessTokenResponse
    : accessTokenResponse?.token;

  if (!accessToken) {
    throw new Error('Unable to obtain Google access token for Secret Manager');
  }

  const resource = `projects/${projectId}/secrets/${secretId}/versions/${version}`;
  const response = await fetch(`https://secretmanager.googleapis.com/v1/${resource}:access`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Secret Manager access failed for ${secretId}: ${response.status} ${body}`.trim());
  }

  const payload = await response.json();
  const encoded = payload?.payload?.data;
  if (typeof encoded !== 'string' || encoded.length === 0) {
    throw new Error(`Secret Manager returned empty payload for ${secretId}`);
  }

  return Buffer.from(encoded, 'base64').toString('utf8');
}

async function loadGoogleSecretManagerEnv() {
  if (!parseBooleanFlag(process.env.GOOGLE_SECRET_MANAGER_ENABLED)) {
    return { enabled: false, loaded: [], skipped: [], failed: [] };
  }

  const auth = new GoogleAuth(resolveGoogleAuthOptions());
  const projectId = process.env.GOOGLE_SECRET_MANAGER_PROJECT_ID?.trim() || await auth.getProjectId();

  if (!projectId) {
    throw new Error('GOOGLE_SECRET_MANAGER_ENABLED is true but no Google Cloud project ID could be resolved');
  }

  const prefix = process.env.GOOGLE_SECRET_MANAGER_PREFIX?.trim() || 'saasybase';
  const environment = process.env.GOOGLE_SECRET_MANAGER_ENV?.trim()
    || process.env.NODE_ENV?.trim()
    || 'production';
  const version = process.env.GOOGLE_SECRET_MANAGER_VERSION?.trim() || 'latest';
  const secretEnvNames = parseSecretList(process.env.GOOGLE_SECRET_MANAGER_SECRETS);
  const loaded = [];
  const skipped = [];
  const failed = [];

  for (const envName of secretEnvNames) {
    if (typeof process.env[envName] === 'string' && process.env[envName].trim().length > 0) {
      skipped.push(envName);
      continue;
    }

    const secretId = buildSecretId(envName, { prefix, environment });
    try {
      const value = await accessSecretVersion({ auth, projectId, secretId, version });
      process.env[envName] = value;
      loaded.push(envName);
    } catch (error) {
      failed.push({
        envName,
        secretId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { enabled: true, loaded, skipped, failed, projectId, prefix, environment, version };
}

async function loadRuntimeEnv() {
  loadDotenvFiles();
  return loadGoogleSecretManagerEnv();
}

module.exports = {
  DEFAULT_SECRET_ENV_NAMES,
  buildSecretId,
  loadRuntimeEnv,
  resolveGoogleAuthOptions,
};
