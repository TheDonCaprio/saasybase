export const dynamic = 'force-dynamic';
import { notFound } from 'next/navigation';
import { buildSitePageMetadata, getPublishedPageBySlug } from '@/lib/sitePages';
import { SitePageView } from '@/components/site-pages/SitePageView';

interface PageParams {
	params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageParams) {
	const resolved = await params;
	return buildSitePageMetadata(resolved.slug);
}

export default async function SitePage({ params }: PageParams) {
	const resolved = await params;
	const page = await getPublishedPageBySlug(resolved.slug);
	if (!page) {
		notFound();
	}

	return <SitePageView page={page} />;
}
