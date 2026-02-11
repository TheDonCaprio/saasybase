import { notFound } from 'next/navigation';
import { SitePageView } from '@/components/site-pages/SitePageView';
import { buildSitePageMetadata, getPublishedPageBySlug } from '../../lib/sitePages';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildSitePageMetadata('privacy');
}

export default async function PrivacyPage() {
  const page = await getPublishedPageBySlug('privacy');
  if (!page) {
    notFound();
  }
  return <SitePageView page={page} />;
}
