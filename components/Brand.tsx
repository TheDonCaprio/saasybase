import React from 'react';

type BrandProps = {
  siteName?: string;
};

export default function Brand({ siteName }: BrandProps) {
  const name = (siteName || process.env.NEXT_PUBLIC_SITE_NAME || 'YourApp').trim();
  if (!name) return <span suppressHydrationWarning>YourApp</span>;

  return <span suppressHydrationWarning>{name}</span>;
}
