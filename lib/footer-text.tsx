import React from 'react';

const ANCHOR_TAG_PATTERN = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const HREF_PATTERN = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const TARGET_PATTERN = /\btarget\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

function getAttributeValue(pattern: RegExp, input: string): string | null {
  const match = pattern.exec(input);
  if (!match) return null;
  return (match[1] || match[2] || match[3] || '').trim() || null;
}

function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

function isAllowedFooterHref(href: string): boolean {
  return /^(https?:\/\/|mailto:|\/|#)/i.test(href);
}

export function renderFooterText(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ANCHOR_TAG_PATTERN.exec(text)) !== null) {
    const [fullMatch, rawAttributes = '', rawContent = ''] = match;
    const startIndex = match.index;

    if (startIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, startIndex));
    }

    const href = getAttributeValue(HREF_PATTERN, rawAttributes);
    const target = getAttributeValue(TARGET_PATTERN, rawAttributes);
    const label = stripTags(rawContent).trim() || href || '';

    if (href && isAllowedFooterHref(href) && label) {
      const openInNewTab = target === '_blank';
      nodes.push(
        <a
          key={`${href}-${startIndex}`}
          href={href}
          target={openInNewTab ? '_blank' : undefined}
          rel={openInNewTab ? 'noreferrer noopener' : undefined}
          className="underline underline-offset-2 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          {label}
        </a>
      );
    } else {
      nodes.push(fullMatch);
    }

    lastIndex = startIndex + fullMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return <>{nodes}</>;
}