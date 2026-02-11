import React from 'react';

type BrandProps = {
  siteName?: string;
};

export default function Brand({ siteName }: BrandProps) {
  const name = (siteName || process.env.NEXT_PUBLIC_SITE_NAME || 'YourApp').trim();
  if (!name) return <span suppressHydrationWarning className="gradient-text">YourApp</span>;

  const parts = name.split(/\s+/);
  // If single word, apply gradient to the whole word so it still has pizzaz
  if (parts.length === 1) {
    return <span suppressHydrationWarning className="gradient-text">{name}</span>;
  }

  const last = parts.pop();
  return (
    <span suppressHydrationWarning>
      {parts.join(' ')} <span className="gradient-text">{last}</span>
    </span>
  );
}
