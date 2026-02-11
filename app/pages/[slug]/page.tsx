import { notFound, redirect } from 'next/navigation';
import { buildSitePageMetadata } from '../../../lib/sitePages';

interface PageParams {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageParams) {
  const resolved = await params;
  return buildSitePageMetadata(resolved.slug);
}

export default async function SitePage({ params }: PageParams) {
  const resolved = await params;
  const slug = resolved.slug;
  // Match the site page slug rules (lowercase letters/numbers/hyphens, min length 2)
  // to avoid strange values like "//evil.com" producing a scheme-relative redirect.
  if (!/^[a-z0-9-]{2,}$/.test(slug)) {
    notFound();
  }
  redirect(`/${slug}`);
}
