import { describe, expect, it } from 'vitest';

const {
  detectSecretsProviderOutputShape,
  parseSecretsProviderOutput,
  runSecretsProviderCommand,
} = require('../scripts/load-runtime-env.js');

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
    const result = runSecretsProviderCommand({});

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
});