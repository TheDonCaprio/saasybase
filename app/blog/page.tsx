export const dynamic = 'force-dynamic';
// removed unused imports: Link, buildDashboardMetadata
import { listPublishedBlogPosts } from '@/lib/blog';
import { getBlogListingStyle, getBlogSidebarSettings, getBlogListingPageSize } from '@/lib/settings';
import {
  SimpleListStyle,
  GridStyle,
  MagazineStyle,
  MinimalStyle,
  TimelineStyle,
  ClassicStyle
} from '@/components/blog/BlogListingStyles';

export async function generateMetadata() {
  return {
    title: 'Blog',
    description: 'Latest posts and updates',
    openGraph: { title: 'Blog', description: 'Latest posts and updates' }
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
