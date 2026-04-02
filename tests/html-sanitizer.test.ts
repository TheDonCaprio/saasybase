import { describe, expect, it } from 'vitest';

import { sanitizeRichText } from '../lib/htmlSanitizer';

describe('sanitizeRichText', () => {
  it('removes dangerous HTML while preserving allowed content', async () => {
    const input = '<div><script>alert(1)</script><a href="javascript:alert(1)">link</a><iframe src="https://example.com/embed"></iframe></div>';

    const sanitized = await sanitizeRichText(input);

    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('javascript:alert');
    expect(sanitized).toContain('<a>link</a>');
    expect(sanitized).toContain('<iframe src="https://example.com/embed"></iframe>');
  });
});