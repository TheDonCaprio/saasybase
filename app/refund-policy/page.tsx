import { notFound } from 'next/navigation';
import { SitePageView } from '@/components/site-pages/SitePageView';
import { buildSitePageMetadata, getPublishedPageBySlug } from '../../lib/sitePages';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildSitePageMetadata('refund-policy');
}

export default async function RefundPolicyPage() {
  const page = await getPublishedPageBySlug('refund-policy');
  if (!page) {
    notFound();
  }
  return <SitePageView page={page} />;
}
