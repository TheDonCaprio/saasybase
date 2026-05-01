export const dynamic = 'force-dynamic';
// removed unused imports: Link, buildDashboardMetadata
import { listPublishedBlogPosts } from '@/lib/blog';
import { getBlogListingStyle, getBlogSidebarSettings, getBlogListingPageSize, getSiteName, SETTING_DEFAULTS, SETTING_KEYS } from '@/lib/settings';
import { getSeoSettings } from '@/lib/seo';
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
  const title = seoSettings?.blogMetaTitle.trim() || `Blog | ${trimmedSiteName}`;
  const description = seoSettings?.blogMetaDescription.trim() || 'Latest posts and updates';
  const ogTitle = seoSettings?.defaultOgTitle?.trim() || title;
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

  const [result, listingStyle, sidebarSettings] = await Promise.all([
    listPublishedBlogPosts({ page, limit: pageSize }),
    getBlogListingStyle(),
    getBlogSidebarSettings()
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

  switch (listingStyle) {
    case 'grid':
      return <GridStyle {...styleProps} />;
    case 'magazine':
      return <MagazineStyle {...styleProps} />;
    case 'minimal':
      return <MinimalStyle {...styleProps} />;
    case 'timeline':
      return <TimelineStyle {...styleProps} />;
    case 'classic':
      return <ClassicStyle {...styleProps} />;
    case 'simple':
    default:
      return <SimpleListStyle {...styleProps} />;
  }
}
