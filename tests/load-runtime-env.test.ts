import { describe, expect, it } from 'vitest';
import * as loadRuntimeEnvModule from '../scripts/load-runtime-env.js';

const {
  loadRuntimeEnv,
  detectSecretsProviderOutputShape,
  getDefaultSecretEnvNames,
  getProviderSecretEnvNames,
  isProviderMetadataEnvName,
  formatSecretLoadSummary,
  parseSecretList,
  parseSecretsProviderOutput,
  runSecretsProviderCommand,
} = loadRuntimeEnvModule;

describe('scripts/load-runtime-env', () => {
  it('parses Doppler-style JSON object output', () => {
    const result = parseSecretsProviderOutput(JSON.stringify({
      DATABASE_URL: 'postgresql://example',
      FEATURE_FLAG: true,
      PORT: 3000,
    }));

    expect(result).toEqual({
      DATABASE_URL: 'postgresql://example',
      FEATURE_FLAG: 'true',
      PORT: '3000',
    });
  });

  it('parses Infisical-style array output', () => {
    const result = parseSecretsProviderOutput(JSON.stringify([
      { key: 'DATABASE_URL', value: 'file:./dev.db' },
      { key: 'ENABLE_FOO', value: false },
      { key: 'MAX_ITEMS', value: 12 },
    ]));

    expect(result).toEqual({
      DATABASE_URL: 'file:./dev.db',
      ENABLE_FOO: 'false',
      MAX_ITEMS: '12',
    });
  });

  it('falls back to parsing KEY=VALUE lines', () => {
    const result = parseSecretsProviderOutput([
      'DATABASE_URL="file:./dev.db"',
      'ENCRYPTION_SECRET=abc123',
      '# comment',
      '',
    ].join('\n'));

    expect(result).toEqual({
      DATABASE_URL: 'file:./dev.db',
      ENCRYPTION_SECRET: 'abc123',
    });
  });

  it('detects the provider output shape before parsing', () => {
    expect(detectSecretsProviderOutputShape(JSON.stringify({ DATABASE_URL: 'postgresql://example' }))).toBe('json-object');
    expect(detectSecretsProviderOutputShape(JSON.stringify([{ key: 'DATABASE_URL', value: 'file:./dev.db' }]))).toBe('json-array-key-value');
    expect(detectSecretsProviderOutputShape('DATABASE_URL=file:./dev.db\nENCRYPTION_SECRET=abc123')).toBe('dotenv-lines');
    expect(detectSecretsProviderOutputShape('')).toBe('empty');
  });

  it('formats a readable secret load summary', () => {
    expect(formatSecretLoadSummary({
      enabled: true,
      provider: 'doppler',
      loaded: ['DATABASE_URL', 'STRIPE_SECRET_KEY'],
      skipped: ['CLERK_SECRET_KEY'],
    }, 'Secrets runtime env')).toBe(
      'Secrets runtime env: provider=doppler; loaded from provider=DATABASE_URL, STRIPE_SECRET_KEY; reused existing=CLERK_SECRET_KEY'
    );
  });

  it('formats a readable secret load summary when nothing was backfilled', () => {
    expect(formatSecretLoadSummary({
      enabled: true,
      provider: 'infisical',
      loaded: [],
      skipped: ['DATABASE_URL', 'AUTH_SECRET'],
    }, 'Secrets smoke env')).toBe(
      'Secrets smoke env: provider=infisical; loaded from provider=none; reused existing=DATABASE_URL, AUTH_SECRET'
    );
  });

  it('reports disabled state when no provider is configured', () => {
    const result = runSecretsProviderCommand({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);

    expect(result).toEqual({
      enabled: false,
      provider: null,
      command: null,
      status: null,
      stdout: '',
      stderr: '',
      outputShape: 'disabled',
      failed: [],
    });
  });

  it('treats an unset secret list as load-all mode', () => {
    expect(parseSecretList(undefined)).toBeNull();
    expect(parseSecretList('')).toBeNull();
  });

  it('filters provider metadata keys from eligible secret keys', () => {
    const result = getProviderSecretEnvNames({
      DATABASE_URL: 'postgresql://example',
      STRIPE_SECRET_KEY: 'sk_test_123',
      DOPPLER_PROJECT: 'example-project',
      DOPPLER_CONFIG: 'dev',
      EXTRA_FLAG: 'true',
    }, 'doppler', {
      SECRETS_PROVIDER: 'doppler',
      PAYMENT_PROVIDER: 'stripe',
    } as NodeJS.ProcessEnv);

    expect(result).toEqual(['DATABASE_URL', 'STRIPE_SECRET_KEY']);
  });

  it('filters Infisical metadata keys from eligible secret keys', () => {
    const result = getProviderSecretEnvNames({
      DATABASE_URL: 'postgresql://example',
      AUTH_SECRET: 'secret',
      INFISICAL_PROJECT_ID: 'project_123',
      INFISICAL_ENVIRONMENT: 'dev',
      EXTRA_FLAG: 'true',
    }, 'infisical', {
      SECRETS_PROVIDER: 'infisical',
      AUTH_PROVIDER: 'nextauth',
    } as NodeJS.ProcessEnv);

    expect(result).toEqual(['DATABASE_URL', 'AUTH_SECRET']);
  });

  it('narrows provider loading when SECRETS_PROVIDER_SECRETS is set', async () => {
    const originalEnv = process.env;

    process.env = {
      ...originalEnv,
      SECRETS_PROVIDER: 'doppler',
      SECRETS_PROVIDER_SECRETS: 'CUSTOM_PROVIDER_SECRET',
      SECRETS_PROVIDER_COMMAND: "printf '{\"CUSTOM_PROVIDER_SECRET\":\"postgresql://example\",\"EXTRA_FLAG\":\"true\"}'",
    } as NodeJS.ProcessEnv;

    delete process.env.CUSTOM_PROVIDER_SECRET;
    delete process.env.EXTRA_FLAG;

    try {
      const result = await loadRuntimeEnv();

      expect(result.failed).toEqual([]);
      expect(result.loaded).toEqual(['CUSTOM_PROVIDER_SECRET']);
      expect(process.env.CUSTOM_PROVIDER_SECRET).toBe('postgresql://example');
      expect(process.env.EXTRA_FLAG).toBeUndefined();
    } finally {
      process.env = originalEnv;
    }
  });

  it('identifies Doppler metadata env names', () => {
    expect(isProviderMetadataEnvName('DOPPLER_PROJECT', 'doppler')).toBe(true);
    expect(isProviderMetadataEnvName('DOPPLER_CONFIG', 'doppler')).toBe(true);
    expect(isProviderMetadataEnvName('DATABASE_URL', 'doppler')).toBe(false);
  });

  it('identifies Infisical metadata env names', () => {
    expect(isProviderMetadataEnvName('INFISICAL_PROJECT_ID', 'infisical')).toBe(true);
    expect(isProviderMetadataEnvName('INFISICAL_ENVIRONMENT', 'infisical')).toBe(true);
    expect(isProviderMetadataEnvName('AUTH_SECRET', 'infisical')).toBe(false);
  });

  it('adds PostHog secrets when PostHog is the selected traffic provider', () => {
    const result = getDefaultSecretEnvNames({
      NODE_ENV: 'test',
      TRAFFIC_ANALYTICS_PROVIDER: 'posthog',
    } as NodeJS.ProcessEnv);

    expect(result).toContain('POSTHOG_PERSONAL_API_KEY');
    expect(result).toContain('NEXT_PUBLIC_POSTHOG_KEY');
  });
});