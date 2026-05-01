import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  sitePage: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}));

const getSeoSettingsMock = vi.hoisted(() => vi.fn());
const getBlogCategoryBySlugMock = vi.hoisted(() => vi.fn());
const getSiteNameMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/seo', () => ({ getSeoSettings: getSeoSettingsMock }));
vi.mock('@/lib/seo', () => ({ getSeoSettings: getSeoSettingsMock }));
vi.mock('@/lib/blog', () => ({
  getBlogCategoryBySlug: getBlogCategoryBySlugMock,
  listPublishedBlogPosts: vi.fn(),
}));
vi.mock('@/lib/settings', () => ({
  getBlogListingStyle: vi.fn(),
  getBlogSidebarSettings: vi.fn(),
  getBlogListingPageSize: vi.fn(),
  getSiteName: getSiteNameMock,
  getSupportEmail: vi.fn(),
  SETTING_DEFAULTS: { SITE_NAME: 'SaaSyBase' },
  SETTING_KEYS: { SITE_NAME: 'SITE_NAME' },
}));
vi.mock('../lib/settings', () => ({
  getSiteName: getSiteNameMock,
  getSupportEmail: vi.fn(),
  SETTING_DEFAULTS: { SITE_NAME: 'SaaSyBase' },
  SETTING_KEYS: { SITE_NAME: 'SITE_NAME' },
}));
vi.mock('@/components/blog/BlogListingStyles', () => ({
  SimpleListStyle: () => null,
  GridStyle: () => null,
  MagazineStyle: () => null,
  MinimalStyle: () => null,
  TimelineStyle: () => null,
  ClassicStyle: () => null,
}));
vi.mock('../components/LandingClientAlt', () => ({ default: () => null }));
vi.mock('../lib/auth', () => ({ getAuthSafe: vi.fn() }));
vi.mock('../components/AppAuthProvider', () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock('../components/FormatSettingsProvider', () => ({ FormatSettingsProvider: ({ children }: { children: unknown }) => children }));
vi.mock('../components/UserProfileProvider', () => ({ UserProfileProvider: ({ children }: { children: unknown }) => children }));
vi.mock('../components/ui/Toast', () => ({ ToastContainer: () => null }));
vi.mock('../components/PaymentProviderScripts', () => ({ default: () => null }));
vi.mock('../components/SiteHeader', () => ({ SiteHeader: () => null }));
vi.mock('../components/twitter/TwitterLoader', () => ({ default: () => null }));
vi.mock('../components/VisitTracker', () => ({ default: () => null }));
vi.mock('../components/dashboard/OrgValidityCheck', () => ({ OrgValidityCheck: () => null }));
vi.mock('../components/dashboard/TokenExpiryCleanupPing', () => ({ TokenExpiryCleanupPing: () => null }));
vi.mock('../components/ui/ChunkLoadRecovery', () => ({ default: () => null }));
vi.mock('../lib/traffic-analytics-config', () => ({ getTrafficAnalyticsClientConfig: vi.fn().mockResolvedValue(null) }));
vi.mock('next/headers', () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock('next/script', () => ({ default: () => null }));
vi.mock('next/link', () => ({ default: () => null }));
vi.mock('@fortawesome/fontawesome-svg-core', () => ({ config: {} }));

describe('seo runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSiteNameMock.mockResolvedValue('Example SaaS');
  });

  it('builds sitemap entries from pages, posts, and custom URLs', async () => {
    getSeoSettingsMock.mockResolvedValue({
      siteUrl: 'https://example.com',
      sitemapUrl: 'https://example.com/sitemap.xml',
      customSitemapUrls: ['https://example.com/docs/custom'],
      excludedSitemapUrls: [],
    });
    prismaMock.sitePage.findMany
      .mockResolvedValueOnce([
        { slug: 'about', updatedAt: new Date('2026-05-01T00:00:00.000Z'), publishedAt: null },
      ])
      .mockResolvedValueOnce([
        { slug: 'launch-post', updatedAt: new Date('2026-05-02T00:00:00.000Z'), publishedAt: new Date('2026-05-01T00:00:00.000Z') },
      ]);

    const { default: sitemap } = await import('../app/sitemap');
    const result = await sitemap();

    expect(result.map((entry) => entry.url)).toEqual([
      'https://example.com',
      'https://example.com/blog',
      'https://example.com/about',
      'https://example.com/blog/launch-post',
      'https://example.com/docs/custom',
    ]);
  });

  it('excludes configured public routes from the sitemap', async () => {
    getSeoSettingsMock.mockResolvedValue({
      siteUrl: 'https://example.com',
      sitemapUrl: 'https://example.com/sitemap.xml',
      customSitemapUrls: ['https://example.com/docs/custom'],
      excludedSitemapUrls: ['https://example.com/blog', 'https://example.com/about'],
    });
    prismaMock.sitePage.findMany
      .mockResolvedValueOnce([
        { slug: 'about', updatedAt: new Date('2026-05-01T00:00:00.000Z'), publishedAt: null },
      ])
      .mockResolvedValueOnce([
        { slug: 'launch-post', updatedAt: new Date('2026-05-02T00:00:00.000Z'), publishedAt: new Date('2026-05-01T00:00:00.000Z') },
      ]);

    const { default: sitemap } = await import('../app/sitemap');
    const result = await sitemap();

    expect(result.map((entry) => entry.url)).toEqual([
      'https://example.com',
      'https://example.com/blog/launch-post',
      'https://example.com/docs/custom',
    ]);
  });

  it('no-indexes blog category pages when the SEO setting is enabled', async () => {
    getBlogCategoryBySlugMock.mockResolvedValue({
      slug: 'announcements',
      title: 'Announcements',
      description: 'Release notes and product updates',
    });
    getSeoSettingsMock.mockResolvedValue({
      siteUrl: 'https://example.com',
      noIndexBlogCategoryPages: true,
      defaultOgTitle: '',
      defaultOgDescription: '',
    });

    const { generateMetadata } = await import('../app/blog/category/[slug]/page');
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'announcements' }) });

    expect(metadata).toMatchObject({
      title: 'Category: Announcements',
      description: 'Release notes and product updates',
      alternates: { canonical: 'https://example.com/blog/category/announcements' },
      robots: { index: false, follow: true },
    });
  });

  it('applies the default OG image to blog listing metadata', async () => {
    getSeoSettingsMock.mockResolvedValue({
      siteUrl: 'https://example.com',
      blogMetaTitle: '',
      blogMetaDescription: '',
      noIndexBlogIndex: false,
      defaultOgTitle: 'Example SaaS',
      defaultOgDescription: 'Shared fallback description',
      resolvedDefaultOgImageUrl: 'https://example.com/og/default.png',
    });

    const { generateMetadata } = await import('../app/blog/page');
    const metadata = await generateMetadata();

    expect(metadata).toMatchObject({
      title: 'Blog | Example SaaS',
      description: 'Latest posts and updates',
      openGraph: {
        title: 'Example SaaS',
        description: 'Shared fallback description',
        images: [{ url: 'https://example.com/og/default.png' }],
      },
      twitter: {
        title: 'Example SaaS',
        description: 'Shared fallback description',
        images: ['https://example.com/og/default.png'],
        card: 'summary_large_image',
      },
    });
  });

  it('no-indexes the blog listing when configured', async () => {
    getSeoSettingsMock.mockResolvedValue({
      siteUrl: 'https://example.com',
      blogMetaTitle: '',
      blogMetaDescription: '',
      noIndexBlogIndex: true,
      defaultOgTitle: '',
      defaultOgDescription: '',
      resolvedDefaultOgImageUrl: undefined,
    });

    const { generateMetadata } = await import('../app/blog/page');
    const metadata = await generateMetadata();

    expect(metadata).toMatchObject({
      robots: { index: false, follow: true },
    });
  });

  it('sitewide noindex overrides route-level indexable metadata', async () => {
    getSeoSettingsMock.mockResolvedValue({
      siteUrl: 'https://example.com',
      blogMetaTitle: '',
      blogMetaDescription: '',
      noIndexSite: true,
      noIndexBlogIndex: false,
      defaultOgTitle: '',
      defaultOgDescription: '',
      resolvedDefaultOgImageUrl: undefined,
    });

    const { generateMetadata } = await import('../app/blog/page');
    const metadata = await generateMetadata();

    expect(metadata).toMatchObject({
      robots: { index: false, follow: false },
    });
  });

  it('uses homepage metadata and default OG fallbacks on the main homepage', async () => {
    getSeoSettingsMock.mockResolvedValue({
      homeMetaTitle: 'Build faster',
      homeMetaDescription: 'Everything you need to launch your SaaS.',
      homeOgTitle: '',
      homeOgDescription: '',
      defaultOgTitle: 'Example SaaS',
      defaultOgDescription: 'Shared fallback description',
      resolvedHomeOgImageUrl: undefined,
      resolvedDefaultOgImageUrl: 'https://example.com/og/default.png',
      resolvedHomeCanonicalUrl: 'https://example.com/',
    });

    const { generateMetadata } = await import('../app/page');
    const metadata = await generateMetadata();

    expect(metadata).toMatchObject({
      title: 'Build faster',
      description: 'Everything you need to launch your SaaS.',
      alternates: { canonical: 'https://example.com/' },
      openGraph: {
        title: 'Example SaaS',
        description: 'Shared fallback description',
        images: [{ url: 'https://example.com/og/default.png' }],
      },
      twitter: {
        title: 'Example SaaS',
        description: 'Shared fallback description',
        images: ['https://example.com/og/default.png'],
        card: 'summary_large_image',
      },
    });
  });

  it('uses homepage SEO settings on the public-export homepage', async () => {
    getSeoSettingsMock.mockResolvedValue({
      homeMetaTitle: 'Launch faster',
      homeMetaDescription: 'Public export should inherit the homepage SEO settings.',
      homeOgTitle: '',
      homeOgDescription: '',
      defaultOgTitle: 'Example SaaS',
      defaultOgDescription: 'Shared fallback description',
      resolvedHomeOgImageUrl: undefined,
      resolvedDefaultOgImageUrl: 'https://example.com/og/default.png',
      resolvedHomeCanonicalUrl: 'https://example.com/',
    });

    const { generateMetadata } = await import('../app/page.public-export');
    const metadata = await generateMetadata();

    expect(metadata).toMatchObject({
      title: 'Launch faster',
      description: 'Public export should inherit the homepage SEO settings.',
      alternates: { canonical: 'https://example.com/' },
      openGraph: {
        title: 'Example SaaS',
        description: 'Shared fallback description',
        images: [{ url: 'https://example.com/og/default.png' }],
      },
      twitter: {
        title: 'Example SaaS',
        description: 'Shared fallback description',
        card: 'summary_large_image',
        images: ['https://example.com/og/default.png'],
      },
    });
  });

  it('falls back to the global OG image for site pages without a page-specific image', async () => {
    prismaMock.sitePage.findFirst.mockResolvedValue({
      slug: 'about',
      title: 'About',
      metaTitle: '',
      metaDescription: 'Learn about the company.',
      description: 'Learn about the company.',
      ogTitle: '',
      ogDescription: '',
      ogImage: '',
      canonicalUrl: '',
      noIndex: false,
      collection: 'page',
      system: false,
      published: true,
      trashedAt: null,
    });
    getSeoSettingsMock.mockResolvedValue({
      siteUrl: 'https://example.com',
      defaultOgTitle: 'Example SaaS',
      defaultOgDescription: 'Shared fallback description',
      resolvedDefaultOgImageUrl: 'https://example.com/og/default.png',
    });

    const { buildSitePageMetadata } = await import('../lib/sitePages');
    const metadata = await buildSitePageMetadata('about');

    expect(metadata).toMatchObject({
      title: 'About | Example SaaS',
      alternates: { canonical: 'https://example.com/about' },
      openGraph: {
        title: 'Example SaaS',
        description: 'Shared fallback description',
        images: [{ url: 'https://example.com/og/default.png' }],
      },
      twitter: {
        title: 'Example SaaS',
        description: 'Shared fallback description',
        images: ['https://example.com/og/default.png'],
        card: 'summary_large_image',
      },
    });
  });

  it('adds google and bing verification metadata in the root layout', async () => {
    getSeoSettingsMock.mockResolvedValue({
      siteUrl: 'https://example.com',
      homeMetaDescription: 'Root metadata description',
      noIndexSite: true,
      googleSiteVerification: 'google-token',
      bingSiteVerification: 'bing-token',
    });

    const { generateMetadata } = await import('../app/layout');
    const metadata = await generateMetadata();

    expect(metadata).toMatchObject({
      metadataBase: new URL('https://example.com'),
      description: 'Root metadata description',
      robots: { index: false, follow: false },
      verification: {
        google: 'google-token',
        other: {
          'msvalidate.01': 'bing-token',
        },
      },
    });
  });

  it('uses the configured sitewide title template in the root layout', async () => {
    getSeoSettingsMock.mockResolvedValue({
      siteUrl: 'https://example.com',
      homeMetaDescription: 'Root metadata description',
      noIndexSite: false,
      titleSuffix: 'Ignored suffix',
      titleTemplate: '%s · Example SaaS',
      googleSiteVerification: '',
      bingSiteVerification: '',
    });

    const { generateMetadata } = await import('../app/layout');
    const metadata = await generateMetadata();

    expect(metadata).toMatchObject({
      title: {
        default: 'Example SaaS',
        template: '%s · Example SaaS',
      },
    });
  });

  it('renders robots.txt with a noindex warning and custom directives', async () => {
    getSeoSettingsMock.mockResolvedValue({
      siteUrl: 'https://example.com',
      sitemapUrl: 'https://example.com/sitemap.xml',
      noIndexSite: true,
      robotsTxtCustom: 'User-agent: GPTBot\nDisallow: /private/',
    });

    const { GET } = await import('../app/robots.txt/route');
    const response = await GET();
    const text = await response.text();

    expect(response.headers.get('Content-Type')).toContain('text/plain');
    expect(text).toContain('# Sitewide no-index is enabled. Crawlers are asked not to index this site.');
    expect(text).toContain('User-agent: *');
    expect(text).toContain('Disallow: /');
    expect(text).toContain('Sitemap: https://example.com/sitemap.xml');
    expect(text).toContain('# Custom robots.txt directives');
    expect(text).toContain('User-agent: GPTBot\nDisallow: /private/');
  });

  it('builds docs metadata without duplicating the site name in the page title', async () => {
    const { buildDocsMetadata } = await import('../lib/docs-metadata');
    const metadata = await buildDocsMetadata({
      title: 'Local PostgreSQL',
      description: 'Docs description',
    });

    expect(metadata).toMatchObject({
      title: 'Local PostgreSQL | Docs',
      openGraph: { title: 'Local PostgreSQL | Docs | Example SaaS' },
      twitter: { title: 'Local PostgreSQL | Docs | Example SaaS' },
    });
  });
});