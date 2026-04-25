import { describe, expect, it } from 'vitest';
import * as loadRuntimeEnvModule from '../scripts/load-runtime-env.js';

const {
  loadRuntimeEnv,
  detectSecretsProviderOutputShape,
  getDefaultSecretEnvNames,
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

  it('loads all missing provider keys by default', async () => {
    const originalEnv = process.env;

    process.env = {
      ...originalEnv,
      SECRETS_PROVIDER: 'doppler',
      SECRETS_PROVIDER_COMMAND: "printf '{\"CUSTOM_PROVIDER_SECRET\":\"postgresql://example\",\"EXTRA_FLAG\":\"true\"}'",
    } as NodeJS.ProcessEnv;

    delete process.env.CUSTOM_PROVIDER_SECRET;
    delete process.env.EXTRA_FLAG;

    try {
      const result = await loadRuntimeEnv();

      expect(result.failed).toEqual([]);
      expect(result.loaded).toEqual(['CUSTOM_PROVIDER_SECRET', 'EXTRA_FLAG']);
      expect(process.env.CUSTOM_PROVIDER_SECRET).toBe('postgresql://example');
      expect(process.env.EXTRA_FLAG).toBe('true');
    } finally {
      process.env = originalEnv;
    }
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

  it('adds PostHog secrets when PostHog is the selected traffic provider', () => {
    const result = getDefaultSecretEnvNames({
      NODE_ENV: 'test',
      TRAFFIC_ANALYTICS_PROVIDER: 'posthog',
    } as NodeJS.ProcessEnv);

    expect(result).toContain('POSTHOG_PERSONAL_API_KEY');
    expect(result).toContain('NEXT_PUBLIC_POSTHOG_KEY');
  });
});