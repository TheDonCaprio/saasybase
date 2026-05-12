export const dynamic = 'force-dynamic';
// removed unused imports: Link, buildDashboardMetadata
import JsonLd from '@/components/seo/JsonLd';
import { listPublishedBlogPosts } from '@/lib/blog';
import { getBlogListingStyle, getBlogSidebarSettings, getBlogListingPageSize, getSiteName, SETTING_DEFAULTS, SETTING_KEYS } from '@/lib/settings';
import { getSeoSettings } from '@/lib/seo';
import { stripTrailingSiteName } from '@/lib/seo-shared';
import { buildBreadcrumbSchema, buildCollectionPageSchema } from '@/lib/schema';
import {
  SimpleListStyle,
  GridStyle,
  MagazineStyle,
  MinimalStyle,
  TimelineStyle,
  ClassicStyle
} from '@/components/blog/BlogListingStyles';

export async function generateMetadata() {
  const [siteName, seoSettings] = await Promise.all([
    getSiteName().catch(() => SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME]),
    getSeoSettings().catch(() => null),
  ]);

  const trimmedSiteName = siteName.trim() || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME];
  const title = stripTrailingSiteName(seoSettings?.blogMetaTitle.trim() || 'Blog', trimmedSiteName);
  const description = seoSettings?.blogMetaDescription.trim() || 'Latest posts and updates';
  const shareTitle = `${title} | ${trimmedSiteName}`;
  const ogTitle = seoSettings?.defaultOgTitle?.trim() || shareTitle;
  const ogDescription = seoSettings?.defaultOgDescription?.trim() || description;
  const ogImage = seoSettings?.resolvedDefaultOgImageUrl;

  return {
    title,
    description,
    alternates: seoSettings ? { canonical: new URL('/blog', `${seoSettings.siteUrl}/`).toString() } : undefined,
    robots: seoSettings?.noIndexSite ? { index: false, follow: false } : seoSettings?.noIndexBlogIndex ? { index: false, follow: true } : undefined,
    openGraph: { title: ogTitle, description: ogDescription, type: 'website', images: ogImage ? [{ url: ogImage }] : undefined },
    twitter: {
      title: ogTitle,
      description: ogDescription,
      images: ogImage ? [ogImage] : undefined,
      card: ogImage ? 'summary_large_image' : 'summary',
    },
  };
}

export default async function BlogListPage({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const page = Math.max(1, Math.floor(Number(resolvedSearchParams?.page) || 1));
  const pageSize = await getBlogListingPageSize();

  const [result, listingStyle, sidebarSettings, siteName, seoSettings] = await Promise.all([
    listPublishedBlogPosts({ page, limit: pageSize }),
    getBlogListingStyle(),
    getBlogSidebarSettings(),
    getSiteName().catch(() => SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME]),
    getSeoSettings().catch(() => null),
  ]);

  const posts = result.posts || [];

  // Get recent posts for sidebar if enabled — fetch the latest N posts
  const listingSidebarEnabled = sidebarSettings.enabledIndex ?? sidebarSettings.enabled;
  const recentPosts = listingSidebarEnabled && sidebarSettings.showRecent
    ? await listPublishedBlogPosts({ page: 1, limit: Math.max(5, sidebarSettings.recentCount) }).then(r => r.posts.slice(0, sidebarSettings.recentCount))
    : [];

  const styleProps = {
    posts,
    sidebarSettings,
    recentPosts,
    pagination: {
      currentPage: result.page || page,
      pageSize: result.pageSize || pageSize,
      totalCount: result.totalCount || 0
    }
  };

  const schemaData = [
    buildCollectionPageSchema({
      title: `Blog | ${siteName}`,
      description: seoSettings?.blogMetaDescription.trim() || 'Latest posts and updates',
      path: '/blog',
      siteUrl: seoSettings?.siteUrl,
    }),
    buildBreadcrumbSchema(
      [
        { name: 'Home', path: '/' },
        { name: 'Blog', path: '/blog' },
      ],
      seoSettings?.siteUrl,
    ),
  ];

  switch (listingStyle) {
    case 'grid':
      return <><JsonLd data={schemaData} /><GridStyle {...styleProps} /></>;
    case 'magazine':
      return <><JsonLd data={schemaData} /><MagazineStyle {...styleProps} /></>;
    case 'minimal':
      return <><JsonLd data={schemaData} /><MinimalStyle {...styleProps} /></>;
    case 'timeline':
      return <><JsonLd data={schemaData} /><TimelineStyle {...styleProps} /></>;
    case 'classic':
      return <><JsonLd data={schemaData} /><ClassicStyle {...styleProps} /></>;
    case 'simple':
    default:
      return <><JsonLd data={schemaData} /><SimpleListStyle {...styleProps} /></>;
  }
}
