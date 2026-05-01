export const dynamic = 'force-dynamic';
import { notFound } from 'next/navigation';
import { getBlogListingStyle, getBlogSidebarSettings, getBlogListingPageSize } from '@/lib/settings';
import { getBlogCategoryBySlug, listPublishedBlogPosts } from '@/lib/blog';
import { getSeoSettings } from '@/lib/seo';
import {
  SimpleListStyle,
  GridStyle,
  MagazineStyle,
  MinimalStyle,
  TimelineStyle,
  ClassicStyle
} from '@/components/blog/BlogListingStyles';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const resolved = await params;
  const [category, seoSettings] = await Promise.all([
    getBlogCategoryBySlug(resolved.slug),
    getSeoSettings().catch(() => null),
  ]);
  if (!category) return { title: 'Category', description: '' };

  const title = `Category: ${category.title}`;
  const description = category.description ?? `Posts tagged ${category.title}`;
  const ogTitle = seoSettings?.defaultOgTitle?.trim() || title;
  const ogDescription = seoSettings?.defaultOgDescription?.trim() || description;
  const ogImage = seoSettings?.resolvedDefaultOgImageUrl;

  return {
    title,
    description,
    alternates: seoSettings ? { canonical: new URL(`/blog/category/${category.slug}`, `${seoSettings.siteUrl}/`).toString() } : undefined,
    robots: seoSettings?.noIndexSite ? { index: false, follow: false } : seoSettings?.noIndexBlogCategoryPages ? { index: false, follow: true } : undefined,
    openGraph: { title: ogTitle, description: ogDescription, images: ogImage ? [{ url: ogImage }] : undefined },
    twitter: {
      title: ogTitle,
      description: ogDescription,
      images: ogImage ? [ogImage] : undefined,
      card: ogImage ? 'summary_large_image' : 'summary',
    },
  };
}

export default async function CategoryArchivePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ page?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const slug = resolvedParams.slug;
  const category = await getBlogCategoryBySlug(slug);
  if (!category) return notFound();

  const page = Math.max(1, Math.floor(Number(resolvedSearchParams?.page) || 1));
  const pageSize = await getBlogListingPageSize();

  const [result, listingStyle, sidebarSettings] = await Promise.all([
    listPublishedBlogPosts({ page, limit: pageSize, categorySlug: slug }),
    getBlogListingStyle(),
    getBlogSidebarSettings()
  ]);

  const posts = result.posts || [];

  // Category archives use the dedicated archive toggle when available, otherwise fall back to index/legacy
  const listingSidebarEnabled = (typeof sidebarSettings.enabledArchive === 'boolean')
    ? sidebarSettings.enabledArchive
    : (sidebarSettings.enabledIndex ?? sidebarSettings.enabled);
  const recentPosts = listingSidebarEnabled && sidebarSettings.showRecent
    ? await listPublishedBlogPosts({ page: 1, limit: Math.max(5, sidebarSettings.recentCount) }).then(r => r.posts.slice(0, sidebarSettings.recentCount))
    : [];

  const styleProps = {
    posts,
    // Pass a rendering-specific sidebarSettings so listing components (which
    // currently check `enabledIndex`) will respect the archive toggle when
    // rendering category pages.
    sidebarSettings: { ...sidebarSettings, enabledIndex: listingSidebarEnabled },
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
