import { notFound } from 'next/navigation';
import { SitePageView } from '@/components/site-pages/SitePageView';
import { buildSitePageMetadata, getPublishedPageBySlug } from '../../lib/sitePages';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildSitePageMetadata('terms');
}

export default async function TermsPage() {
  const page = await getPublishedPageBySlug('terms');
  if (!page) {
    notFound();
  }
  return <SitePageView page={page} />;
}
