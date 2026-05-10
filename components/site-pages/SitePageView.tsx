import type { SitePageRecord } from '@/lib/sitePages';
import JsonLd from '@/components/seo/JsonLd';
import { formatDate } from '@/lib/formatDate';
import { SiteContentRenderer } from './SiteContentRenderer';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { getBlogSidebarSettings } from '@/lib/settings';
import { BlogSidebar } from '@/components/blog/BlogSidebar';
import { listPublishedBlogPosts } from '@/lib/blog';
import { getSeoSettings } from '@/lib/seo';
import { buildBreadcrumbSchema, buildWebPageSchema } from '@/lib/schema';

export async function SitePageView({ page }: { page: SitePageRecord }) {
  const [sidebarSettings, seoSettings] = await Promise.all([
    getBlogSidebarSettings(),
    getSeoSettings().catch(() => null),
  ]);
  const pagesSidebarEnabled = sidebarSettings.enabledPages ?? sidebarSettings.enabled;
  const recentPosts = pagesSidebarEnabled && sidebarSettings.showRecent
    ? await listPublishedBlogPosts({ page: 1, limit: Math.max(5, sidebarSettings.recentCount + 3) }).then(r => r.posts)
    : [];
  const schemaData = [
    buildWebPageSchema({
      title: page.title,
      description: page.description,
      path: `/${page.slug}`,
      siteUrl: seoSettings?.siteUrl,
      dateModified: page.updatedAt.toISOString(),
    }),
    buildBreadcrumbSchema(
      [
        { name: 'Home', path: '/' },
        { name: page.title, path: `/${page.slug}` },
      ],
      seoSettings?.siteUrl,
    ),
  ];

  return (
    <>
      <JsonLd data={schemaData} />
      <div className="mx-auto w-full max-w-[1440px] px-3 sm:px-4 lg:px-8 pt-10 pb-4 sm:py-6 lg:py-16">
        <div className={`grid gap-6 lg:gap-12 items-stretch ${pagesSidebarEnabled ? 'lg:grid-cols-3' : ''}`}>
        <article className={`${pagesSidebarEnabled ? 'lg:col-span-2' : 'max-w-5xl mx-auto'} min-h-0`}> 
          <div className="h-full flex flex-col">
            <header className="mb-6 lg:mb-12">
              <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: page.title }]} />
              <h1 className="mb-4 lg:mb-6 text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white tracking-tight" style={{ lineHeight: '1.2' }}>{page.title}</h1>
              {page.description ? (
                <p className="text-lg lg:text-xl leading-relaxed text-slate-600 dark:text-neutral-300 mb-6 font-medium">{page.description}</p>
              ) : null}
              <div className="border-l-4 border-violet-500 pl-4">
                <time className="text-sm text-slate-500 dark:text-neutral-400 font-medium">
                  Updated {formatDate(page.updatedAt, { mode: 'short' })}
                </time>
              </div>
            </header>
            <div className="prose prose-lg prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h1:text-4xl prose-h2:text-3xl prose-h3:text-2xl prose-p:leading-relaxed prose-p:mb-6 prose-li:my-2 prose-blockquote:border-l-violet-500 prose-blockquote:bg-slate-50 prose-blockquote:dark:bg-slate-800/50 prose-blockquote:rounded-r-lg prose-blockquote:py-4 prose-a:text-violet-600 prose-a:dark:text-violet-400 prose-a:no-underline hover:prose-a:underline prose-code:bg-slate-100 prose-code:dark:bg-slate-800 prose-code:px-2 prose-code:py-1 prose-code:rounded prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700 flex-1">
              <SiteContentRenderer content={page.content} />
            </div>
          </div>
        </article>

        {pagesSidebarEnabled && (
          <div className="lg:col-span-1 h-full">
            <BlogSidebar
              recentPosts={sidebarSettings.showRecent ? recentPosts.slice(0, sidebarSettings.recentCount) : []}
              showRecent={sidebarSettings.showRecent}
              content={sidebarSettings.content}
              html={sidebarSettings.html}
              widgetOrder={sidebarSettings.widgetOrder}
            />
          </div>
        )}
        </div>
      </div>
    </>
  );
}
