import { Logger } from './logger';

// DOMPurify typings are intentionally lightweight here to avoid pulling in the
// full dependency at build time. We only need the sanitize function signature.
type DomPurifyLike = {
  sanitize: (input: string, options?: Record<string, unknown>) => string;
};

let cachedDomPurify: DomPurifyLike | null = null;

async function getDomPurify(): Promise<DomPurifyLike | null> {
  if (cachedDomPurify) return cachedDomPurify;

  try {
    const [{ JSDOM }, createDOMPurify] = await Promise.all([
      import('jsdom'),
      import('dompurify')
    ]);

    const { window } = new JSDOM('');
    const DOMPurify = (createDOMPurify as unknown as { default: (win: Window & typeof globalThis) => DomPurifyLike }).default(
      window as unknown as Window & typeof globalThis
    );
    cachedDomPurify = DOMPurify;
    return DOMPurify;
  } catch (error) {
    Logger.warn('DOMPurify not available, falling back to basic HTML sanitizer', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

const ALLOWED_TAGS = [
  'a',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'blockquote',
  'code',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'br',
  'span',
  'div',
  'img'
  , 'iframe'
];

const ALLOWED_ATTR = [
  'href',
  'title',
  'target',
  'rel',
  'src',
  'srcset',
  'sizes',
  'alt',
  'width',
  'height',
  'class',
  'style',
  'loading',
  'aria-label',
  'aria-hidden',
  'role',
  'id'
  , 'allow'
  , 'allowfullscreen'
  , 'sandbox'
  , 'referrerpolicy'
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fallbackSanitize(value: string): string {
  const escaped = escapeHtml(value);
  const blocks = escaped
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => `<p>${block.replace(/\n/g, '<br />')}</p>`);

  if (blocks.length) {
    return blocks.join('\n');
  }

  return '<p></p>';
}

export async function sanitizeRichText(input: string): Promise<string> {
  const trimmed = (input || '').trim();
  if (!trimmed) return '<p></p>';

  const domPurify = await getDomPurify();
  if (!domPurify) {
    return fallbackSanitize(trimmed);
  }

  const sanitized = domPurify.sanitize(trimmed, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_TAGS: ['img', 'iframe'],
    ADD_ATTR: ['href', 'target', 'rel', 'src', 'srcset', 'sizes', 'alt', 'title', 'width', 'height', 'class', 'style', 'loading', 'aria-label', 'aria-hidden', 'role', 'id', 'allow', 'allowfullscreen', 'sandbox', 'referrerpolicy'],
    FORBID_TAGS: ['script', 'style', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onclick', 'onmouseover', 'onload', 'onunload', 'onfocus', 'onblur'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|\/|#)/i,
    KEEP_CONTENT: true,
    ALLOW_DATA_ATTR: true,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false
  });

  if (typeof sanitized === 'string' && sanitized.trim()) {
    return sanitized.trim();
  }

  return fallbackSanitize(trimmed);
}

export function summarizePlainText(input: string | null | undefined, maxLength = 240): string {
  if (!input) return '';
  const plain = input
    .replace(/<[^>]+>/g, ' ') // strip tags
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength - 1).trimEnd()}…`;
}
