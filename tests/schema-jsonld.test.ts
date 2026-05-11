import { describe, expect, it } from 'vitest';

import { serializeJsonLd } from '@/lib/schema';

describe('serializeJsonLd', () => {
  it('preserves a single json-ld object', () => {
    const serialized = serializeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Example',
    });

    expect(JSON.parse(serialized)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Example',
    });
  });

  it('wraps json-ld arrays in a graph object', () => {
    const serialized = serializeJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'SaaSyBase',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'SaaSyBase',
      },
    ]);

    expect(JSON.parse(serialized)).toEqual({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'SaaSyBase',
        },
        {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'SaaSyBase',
        },
      ],
    });
  });
});