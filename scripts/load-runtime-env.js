#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CORE_SECRET_ENV_NAMES = [
  'DATABASE_URL',
  'ENCRYPTION_SECRET',
  'INTERNAL_API_TOKEN',
  'HEALTHCHECK_TOKEN',
  'CRON_PROCESS_EXPIRY_TOKEN',
];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function addSecretEnvNames(target, envNames) {
  for (const envName of envNames) {
    if (!target.includes(envName)) {
      target.push(envName);
    }
  }
}

function getDefaultSecretEnvNames(env = process.env) {
  const envNames = [...CORE_SECRET_ENV_NAMES];
  const authProvider = (env.AUTH_PROVIDER || env.NEXT_PUBLIC_AUTH_PROVIDER || 'clerk').trim().toLowerCase();
  const paymentProvider = (env.PAYMENT_PROVIDER || 'stripe').trim().toLowerCase();
  const emailProvider = (env.EMAIL_PROVIDER || 'nodemailer').trim().toLowerCase();
  const fileStorage = (env.FILE_STORAGE || 'fs').trim().toLowerCase();

  if (authProvider === 'clerk') {
    addSecretEnvNames(envNames, [
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'CLERK_WEBHOOK_SECRET',
    ]);
  } else if (authProvider === 'betterauth') {
    addSecretEnvNames(envNames, [
      'BETTER_AUTH_SECRET',
      'AUTH_SECRET',
      'NEXTAUTH_SECRET',
    ]);
  } else if (authProvider === 'nextauth') {
    addSecretEnvNames(envNames, [
      'AUTH_SECRET',
      'NEXTAUTH_SECRET',
    ]);
  }

  if (paymentProvider === 'stripe') {
    addSecretEnvNames(envNames, [
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    ]);
  } else if (paymentProvider === 'paystack') {
    addSecretEnvNames(envNames, [
      'PAYSTACK_SECRET_KEY',
      'NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY',
    ]);
  } else if (paymentProvider === 'paddle') {
    addSecretEnvNames(envNames, [
      'PADDLE_API_KEY',
      'PADDLE_WEBHOOK_SECRET',
      'NEXT_PUBLIC_PADDLE_CLIENT_TOKEN',
    ]);
  } else if (paymentProvider === 'razorpay') {
    addSecretEnvNames(envNames, [
      'RAZORPAY_KEY_ID',
      'RAZORPAY_KEY_SECRET',
      'RAZORPAY_WEBHOOK_SECRET',
      'NEXT_PUBLIC_RAZORPAY_KEY_ID',
    ]);
  }

  if (emailProvider === 'resend') {
    addSecretEnvNames(envNames, ['RESEND_API_KEY']);
  } else if (emailProvider === 'nodemailer' && (isNonEmptyString(env.SMTP_HOST) || isNonEmptyString(env.SMTP_USER))) {
    addSecretEnvNames(envNames, ['SMTP_PASS']);
  }

  if (fileStorage === 's3') {
    addSecretEnvNames(envNames, ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']);
  }

  if (isNonEmptyString(env.GA_PROPERTY_ID)) {
    addSecretEnvNames(envNames, ['GA_SERVICE_ACCOUNT_CREDENTIALS_B64']);
  }

  return envNames;
}

function loadDotenvFiles() {
  try {
    const dotenv = require('dotenv');
    const root = path.resolve(__dirname, '..');
    const nodeEnv = (process.env.NODE_ENV || 'development').trim().toLowerCase();
    const candidates = nodeEnv === 'production'
      ? ['.env.production.local', '.env.production', '.env']
      : nodeEnv === 'test'
        ? ['.env.test.local', '.env.test', '.env']
        : ['.env.local', '.env.development', '.env'];

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
    return getDefaultSecretEnvNames();
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

function formatSecretLoadFailures(secretLoadResult) {
  return secretLoadResult.failed
    .map((entry) => `${entry.provider}: ${entry.message}`)
    .join('\n');
}

function normalizeSecretsProvider(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'none' || normalized === 'false' || normalized === 'off') {
    return null;
  }
  if (normalized === 'infisical' || normalized === 'doppler') {
    return normalized;
  }
  throw new Error(`Unsupported SECRETS_PROVIDER "${value}". Use "infisical", "doppler", or leave it blank.`);
}

function shellEscape(value) {
  const str = String(value);
  if (/^[A-Za-z0-9_./:@=-]+$/.test(str)) {
    return str;
  }
  return `'${str.replace(/'/g, `'"'"'`)}'`;
}

function joinShellCommand(parts) {
  return parts.map(shellEscape).join(' ');
}

function getSecretsProviderCommand(provider, env = process.env) {
  if (typeof env.SECRETS_PROVIDER_COMMAND === 'string' && env.SECRETS_PROVIDER_COMMAND.trim().length > 0) {
    return env.SECRETS_PROVIDER_COMMAND.trim();
  }

  if (provider === 'infisical') {
    const parts = ['infisical', 'export', '--format', 'json'];
    if (isNonEmptyString(env.INFISICAL_ENVIRONMENT)) {
      parts.push('--env', env.INFISICAL_ENVIRONMENT.trim());
    }
    if (isNonEmptyString(env.INFISICAL_PROJECT_ID)) {
      parts.push('--projectId', env.INFISICAL_PROJECT_ID.trim());
    }
    return joinShellCommand(parts);
  }

  if (provider === 'doppler') {
    const parts = ['doppler', 'secrets', 'download', '--no-file', '--format', 'json'];
    if (isNonEmptyString(env.DOPPLER_CONFIG)) {
      parts.push('--config', env.DOPPLER_CONFIG.trim());
    }
    if (isNonEmptyString(env.DOPPLER_PROJECT)) {
      parts.push('--project', env.DOPPLER_PROJECT.trim());
    }
    return joinShellCommand(parts);
  }

  return null;
}

function getSecretsProviderSetupHint(provider) {
  if (provider === 'infisical') {
    return 'Install the Infisical CLI, authenticate it in this shell with infisical login, then rerun the command. See /docs/secrets for the local setup steps.';
  }

  if (provider === 'doppler') {
    return 'Install the Doppler CLI, authenticate it in this shell with doppler login, then rerun the command. See /docs/secrets for the local setup steps.';
  }

  return 'Install and authenticate the selected secrets provider CLI, then rerun the command. See /docs/secrets for setup steps.';
}

function buildSecretsProviderFailure(provider, message) {
  const detail = typeof message === 'string' && message.trim().length > 0
    ? message.trim()
    : `Failed to load secrets from ${provider}.`;

  return {
    provider,
    message: `${detail} ${getSecretsProviderSetupHint(provider)}`,
  };
}

function parseQuotedEnvValue(rawValue) {
  const value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function coerceEnvMap(value) {
  if (Array.isArray(value)) {
    const envMap = {};

    for (const entry of value) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const key = typeof entry.key === 'string' ? entry.key.trim() : '';
      const rawValue = entry.value;
      if (!key || rawValue == null) {
        continue;
      }

      if (typeof rawValue === 'string') {
        envMap[key] = rawValue;
        continue;
      }

      if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
        envMap[key] = String(rawValue);
      }
    }

    return envMap;
  }

  if (!value || typeof value !== 'object') {
    throw new Error('Secrets provider output must be a JSON object, an array of { key, value } entries, or KEY=VALUE lines');
  }

  const envMap = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof key !== 'string' || key.trim().length === 0) continue;
    if (entry == null) continue;
    if (typeof entry === 'string') {
      envMap[key] = entry;
      continue;
    }
    if (typeof entry === 'number' || typeof entry === 'boolean') {
      envMap[key] = String(entry);
    }
  }
  return envMap;
}

function parseSecretsProviderOutput(stdout) {
  const trimmed = typeof stdout === 'string' ? stdout.trim() : '';
  if (!trimmed) {
    return {};
  }

  try {
    return coerceEnvMap(JSON.parse(trimmed));
  } catch {
    const envMap = {};
    for (const line of trimmed.split(/\r?\n/)) {
      const candidate = line.trim();
      if (!candidate || candidate.startsWith('#')) continue;
      const separatorIndex = candidate.indexOf('=');
      if (separatorIndex <= 0) continue;
      const key = candidate.slice(0, separatorIndex).trim();
      const value = candidate.slice(separatorIndex + 1);
      if (!key) continue;
      envMap[key] = parseQuotedEnvValue(value);
    }
    return envMap;
  }
}

function detectSecretsProviderOutputShape(stdout) {
  const trimmed = typeof stdout === 'string' ? stdout.trim() : '';
  if (!trimmed) {
    return 'empty';
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return 'json-array-key-value';
    }
    if (parsed && typeof parsed === 'object') {
      return 'json-object';
    }
  } catch {
    // Fall through to dotenv-style detection.
  }

  const hasEnvLines = trimmed
    .split(/\r?\n/)
    .some((line) => {
      const candidate = line.trim();
      if (!candidate || candidate.startsWith('#')) {
        return false;
      }
      return candidate.indexOf('=') > 0;
    });

  return hasEnvLines ? 'dotenv-lines' : 'unknown-text';
}

function runSecretsProviderCommand(env = process.env) {
  const provider = normalizeSecretsProvider(env.SECRETS_PROVIDER);
  if (!provider) {
    return {
      enabled: false,
      provider: null,
      command: null,
      status: null,
      stdout: '',
      stderr: '',
      outputShape: 'disabled',
      failed: [],
    };
  }

  const command = getSecretsProviderCommand(provider, env);
  if (!command) {
    return {
      enabled: true,
      provider,
      command: null,
      status: null,
      stdout: '',
      stderr: '',
      outputShape: 'missing-command',
      failed: [buildSecretsProviderFailure(provider, `No command could be resolved for ${provider}. Set SECRETS_PROVIDER_COMMAND if you need a custom export command.`)],
    };
  }

  const result = spawnSync(command, {
    shell: true,
    env,
    encoding: 'utf8',
  });

  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  const outputShape = detectSecretsProviderOutputShape(stdout);

  if (result.error) {
    return {
      enabled: true,
      provider,
      command,
      status: null,
      stdout,
      stderr,
      outputShape,
      failed: [buildSecretsProviderFailure(provider, result.error.message)],
    };
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    const message = (stderr || stdout || '').trim() || `${provider} command exited with status ${result.status}`;
    return {
      enabled: true,
      provider,
      command,
      status: result.status,
      stdout,
      stderr,
      outputShape,
      failed: [buildSecretsProviderFailure(provider, message)],
    };
  }

  return {
    enabled: true,
    provider,
    command,
    status: typeof result.status === 'number' ? result.status : 0,
    stdout,
    stderr,
    outputShape,
    failed: [],
  };
}

async function loadSecretsProviderEnv() {
  const provider = normalizeSecretsProvider(process.env.SECRETS_PROVIDER);
  if (!provider) {
    return { enabled: false, provider: null, command: null, loaded: [], skipped: [], failed: [] };
  }

  const commandResult = runSecretsProviderCommand(process.env);
  const command = commandResult.command;
  if (commandResult.failed.length > 0) {
    return {
      enabled: true,
      provider,
      command,
      loaded: [],
      skipped: [],
      failed: commandResult.failed,
    };
  }

  const secretEnvNames = parseSecretList(process.env.SECRETS_PROVIDER_SECRETS);
  const loaded = [];
  const skipped = [];
  const missing = [];

  for (const envName of secretEnvNames) {
    if (typeof process.env[envName] === 'string' && process.env[envName].trim().length > 0) {
      skipped.push(envName);
      continue;
    }
    missing.push(envName);
  }

  if (missing.length === 0) {
    return { enabled: true, provider, command, loaded, skipped, failed: [] };
  }

  let envMap;
  try {
    envMap = parseSecretsProviderOutput(commandResult.stdout || '');
  } catch (error) {
    return {
      enabled: true,
      provider,
      command,
      loaded,
      skipped,
      failed: [buildSecretsProviderFailure(provider, error instanceof Error ? error.message : String(error))],
    };
  }

  for (const envName of missing) {
    const value = envMap[envName];
    if (typeof value === 'string' && value.trim().length > 0) {
      process.env[envName] = value;
      loaded.push(envName);
    }
  }

  return { enabled: true, provider, command, loaded, skipped, failed: [] };
}

async function loadRuntimeEnv() {
  loadDotenvFiles();
  return loadSecretsProviderEnv();
}

module.exports = {
  CORE_SECRET_ENV_NAMES,
  detectSecretsProviderOutputShape,
  formatSecretLoadFailures,
  getDefaultSecretEnvNames,
  getSecretsProviderCommand,
  loadDotenvFiles,
  loadRuntimeEnv,
  parseSecretsProviderOutput,
  parseSecretList,
  runSecretsProviderCommand,
};
