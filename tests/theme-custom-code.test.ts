import { describe, expect, it } from 'vitest';

import { validateThemeCustomCss, validateThemeCustomMarkup } from '../lib/theme-custom-code';

describe('theme custom code validation', () => {
  it('accepts plain css rules', () => {
    expect(validateThemeCustomCss('.hero { color: red; }')).toBeNull();
  });

  it('rejects style wrappers in custom css', () => {
    expect(validateThemeCustomCss('<style>.hero { color: red; }</style>')).toContain('raw CSS only');
  });

  it('rejects malformed css blocks', () => {
    expect(validateThemeCustomCss('.hero { color: red;')).toContain('unclosed block');
  });

  it('accepts head fragments', () => {
    expect(validateThemeCustomMarkup('head', '<meta name="robots" content="index,follow" /><script>window.ok=true;</script>')).toBeNull();
  });

  it('rejects document-level head markup', () => {
    expect(validateThemeCustomMarkup('head', '<head><meta charset="utf-8" /></head>')).toContain('HTML fragment');
  });

  it('rejects malformed body markup', () => {
    expect(validateThemeCustomMarkup('body', '<div><span>Oops</div>')).toContain('mismatched closing');
  });
});