const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const RAW_TEXT_HTML_TAGS = new Set(['script', 'style', 'textarea', 'title']);
const FORBIDDEN_DOCUMENT_TAGS_RE = /<!doctype|<\/?(?:html|head|body)\b/i;
const HTML_TAG_LIKE_RE = /<\s*\/?\s*[a-zA-Z][\w:-]*(?:\s[^<>]*)?>/;

export const MAX_CUSTOM_CODE_CHARS = 10_000;

export const sanitizeCustomCode = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.slice(0, MAX_CUSTOM_CODE_CHARS);
};

export function validateThemeCustomCss(value: string): string | null {
  const source = value.trim();
  if (!source) {
    return null;
  }

  if (/<\/?style\b/i.test(source)) {
    return 'Custom CSS must contain raw CSS only. Remove the <style> wrapper.';
  }

  if (HTML_TAG_LIKE_RE.test(source)) {
    return 'Custom CSS only accepts CSS rules. Remove any HTML markup.';
  }

  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let inComment = false;
  let activeQuote: '"' | "'" | null = null;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inComment) {
      if (char === '*' && next === '/') {
        inComment = false;
        index += 1;
      }
      continue;
    }

    if (activeQuote) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === activeQuote) {
        activeQuote = null;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      inComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      activeQuote = char;
      continue;
    }

    if (char === '{') {
      braceDepth += 1;
      continue;
    }
    if (char === '}') {
      braceDepth -= 1;
      if (braceDepth < 0) {
        return 'Custom CSS has an unmatched closing brace.';
      }
      continue;
    }
    if (char === '[') {
      bracketDepth += 1;
      continue;
    }
    if (char === ']') {
      bracketDepth -= 1;
      if (bracketDepth < 0) {
        return 'Custom CSS has an unmatched closing bracket.';
      }
      continue;
    }
    if (char === '(') {
      parenDepth += 1;
      continue;
    }
    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth < 0) {
        return 'Custom CSS has an unmatched closing parenthesis.';
      }
    }
  }

  if (inComment) {
    return 'Custom CSS has an unclosed comment.';
  }
  if (activeQuote) {
    return 'Custom CSS has an unclosed string literal.';
  }
  if (braceDepth > 0) {
    return 'Custom CSS has an unclosed block.';
  }
  if (bracketDepth > 0) {
    return 'Custom CSS has an unclosed bracket.';
  }
  if (parenDepth > 0) {
    return 'Custom CSS has an unclosed parenthesis.';
  }

  return null;
}

export function validateThemeCustomMarkup(kind: 'head' | 'body', value: string): string | null {
  const source = value.trim();
  if (!source) {
    return null;
  }

  if (FORBIDDEN_DOCUMENT_TAGS_RE.test(source)) {
    return `Custom ${kind} markup must be an HTML fragment. Remove <html>, <head>, <body>, and <!doctype> tags.`;
  }

  const stack: string[] = [];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '<') {
      continue;
    }

    if (source.startsWith('<!--', index)) {
      const commentEnd = source.indexOf('-->', index + 4);
      if (commentEnd === -1) {
        return `Custom ${kind} markup has an unclosed HTML comment.`;
      }
      index = commentEnd + 2;
      continue;
    }

    const tag = readHtmlTag(source, index);
    if (!tag) {
      return `Custom ${kind} markup contains a malformed tag.`;
    }

    index = tag.end - 1;
    const raw = tag.raw.trim();

    if (/^<!/i.test(raw) || /^<\?/i.test(raw)) {
      continue;
    }

    const closingMatch = raw.match(/^<\s*\/\s*([a-zA-Z][\w:-]*)\s*>$/);
    if (closingMatch) {
      const tagName = closingMatch[1].toLowerCase();
      const last = stack.pop();
      if (last !== tagName) {
        return `Custom ${kind} markup has a mismatched closing </${tagName}> tag.`;
      }
      continue;
    }

    const openingMatch = raw.match(/^<\s*([a-zA-Z][\w:-]*)\b[\s\S]*>$/);
    if (!openingMatch) {
      return `Custom ${kind} markup contains a malformed tag.`;
    }

    const tagName = openingMatch[1].toLowerCase();
    const selfClosing = /\/\s*>$/.test(raw) || VOID_HTML_TAGS.has(tagName);

    if (selfClosing) {
      continue;
    }

    if (RAW_TEXT_HTML_TAGS.has(tagName)) {
      const closeToken = `</${tagName}>`;
      const closeIndex = source.toLowerCase().indexOf(closeToken, index + 1);
      if (closeIndex === -1) {
        return `Custom ${kind} markup has an unclosed <${tagName}> tag.`;
      }
      index = closeIndex + closeToken.length - 1;
      continue;
    }

    stack.push(tagName);
  }

  if (stack.length > 0) {
    return `Custom ${kind} markup has an unclosed <${stack[stack.length - 1]}> tag.`;
  }

  return null;
}

function readHtmlTag(source: string, startIndex: number): { raw: string; end: number } | null {
  let activeQuote: '"' | "'" | null = null;

  for (let index = startIndex + 1; index < source.length; index += 1) {
    const char = source[index];

    if (activeQuote) {
      if (char === activeQuote) {
        activeQuote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      activeQuote = char;
      continue;
    }

    if (char === '>') {
      return {
        raw: source.slice(startIndex, index + 1),
        end: index + 1,
      };
    }
  }

  return null;
}