export const dynamic = 'force-dynamic';
import { notFound } from 'next/navigation';
import { getPublishedBlogBySlug, buildBlogMetadata, listPublishedBlogPosts } from '@/lib/blog';
import { SiteContentRenderer } from '@/components/site-pages/SiteContentRenderer';
import { formatDate } from '@/lib/formatDate';
import { getBlogSidebarSettings, getRelatedPostsEnabled, getBlogHtmlSnippets } from '@/lib/settings';
import { BlogSidebar } from '@/components/blog/BlogSidebar';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import RelatedPosts from '@/components/blog/RelatedPosts';

interface PageParams {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageParams) {
  const resolved = await params;
  return buildBlogMetadata(resolved.slug);
}

export default async function BlogPostPage({ params }: PageParams) {
  const resolved = await params;
  const slug = resolved.slug;
  const post = await getPublishedBlogBySlug(slug);
  if (!post) return notFound();
  const sidebarSettings = await getBlogSidebarSettings();
  const snippets = await getBlogHtmlSnippets();
  const singleSidebarEnabled = sidebarSettings.enabledSingle ?? sidebarSettings.enabled;
  const recentPosts = singleSidebarEnabled && sidebarSettings.showRecent
    ? await listPublishedBlogPosts({ page: 1, limit: Math.max(5, sidebarSettings.recentCount + 3) }).then(r => r.posts.filter(p => p.slug !== slug))
    : [];
  const relatedEnabled = await getRelatedPostsEnabled();

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 lg:px-8 py-8 lg:py-16">
      <div className={`grid gap-12 items-stretch ${singleSidebarEnabled ? 'lg:grid-cols-3' : ''}`}>
        <article className={`${singleSidebarEnabled ? 'lg:col-span-2' : 'max-w-4xl mx-auto'} min-h-0`}>
          <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-8 lg:p-12 h-full flex flex-col">
            <header className="mb-12">
              <Breadcrumbs
                items={[
                  { label: 'Home', href: '/' },
                  { label: 'Blog', href: '/blog' },
                  ...(post.categories && post.categories.length > 0 ? [{ label: post.categories[0].title, href: `/blog/category/${post.categories[0].slug}` }] : []),
                  { label: post.title }
                ]}
              />
              <h1 className="mb-6 text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white tracking-tight" style={{ lineHeight: '1.2' }}>{post.title}</h1>
              {post.description ? (
                <p className="text-lg lg:text-xl leading-relaxed text-slate-600 dark:text-neutral-300 mb-6 font-medium">{post.description}</p>
              ) : null}
              <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-neutral-400 border-l-4 border-violet-500 pl-4">
                <time className="font-medium">
                  Published {formatDate(post.publishedAt ?? post.updatedAt, { mode: 'short' })}
                </time>
                {post.categories && post.categories.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span>•</span>
                    <span className="text-violet-600 dark:text-violet-400 font-medium">{post.categories[0].title}</span>
                  </div>
                )}
              </div>
            </header>
            <div className="prose prose-lg prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h1:text-4xl prose-h2:text-3xl prose-h3:text-2xl prose-p:leading-relaxed prose-p:mb-6 prose-li:my-2 prose-blockquote:border-l-violet-500 prose-blockquote:bg-slate-50 prose-blockquote:dark:bg-slate-800/50 prose-blockquote:rounded-r-lg prose-blockquote:py-4 prose-a:text-violet-600 prose-a:dark:text-violet-400 prose-a:no-underline hover:prose-a:underline prose-code:bg-slate-100 prose-code:dark:bg-slate-800 prose-code:px-2 prose-code:py-1 prose-code:rounded prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700 flex-1">
              {
                // Inject admin-provided HTML snippets into the post content at three insertion points.
                (() => {
                  const raw = post.content || '';
                  const before = (snippets.beforeFirst || '').trim();
                  const middle = (snippets.middle || '').trim();
                  const after = (snippets.afterLast || '').trim();

                  if (!before && !middle && !after) {
                    return <SiteContentRenderer content={raw} />;
                  }

                  // Split content into parts where paragraph tags are captured
                  const parts = raw.split(/(<p[\s\S]*?<\/p>)/gi);
                  // Find paragraph part indexes
                  const paraParts = parts.map((p, idx) => ({ p, idx })).filter(x => /^<p/i.test(x.p));

                  if (paraParts.length === 0) {
                    // No paragraph tags found — fall back to wrapping whole content
                    const combined = `${before || ''}${raw}${after || ''}`;
                    return <SiteContentRenderer content={combined} />;
                  }

                  // Insert before first paragraph
                  if (before) {
                    const firstIdx = paraParts[0].idx;
                    parts[firstIdx] = `${before}${parts[firstIdx]}`;
                  }

                  // Insert middle snippet after the middle paragraph
                  if (middle && paraParts.length > 0) {
                    // Bias toward the earlier paragraph when there is an even count
                    // so "middle" feels closer to the midpoint between two halves.
                    const mid = Math.max(0, Math.ceil(paraParts.length / 2) - 1);
                    const midIdx = paraParts[mid].idx;
                    parts[midIdx] = `${parts[midIdx]}${middle}`;
                  }

                  // Insert after last paragraph
                  if (after) {
                    const lastIdx = paraParts[paraParts.length - 1].idx;
                    parts[lastIdx] = `${parts[lastIdx]}${after}`;
                  }

                  const finalHtml = parts.join('');
                  return <SiteContentRenderer content={finalHtml} />;
                })()
              }
            </div>
            {relatedEnabled && <RelatedPosts currentSlug={post.slug} categories={post.categories} />}
          </div>
        </article>

        {singleSidebarEnabled && (
          <div className="lg:col-span-1">
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
  );
}
