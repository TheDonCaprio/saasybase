'use client';

import Link from 'next/link';
import Image from 'next/image';
import { formatDate } from '@/lib/formatDate';
import { BlogSidebar } from './BlogSidebar';
import { Pagination } from '@/components/ui/Pagination';
import { useRouter } from 'next/navigation';

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  ogImage: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  categories: Array<{
    id: string;
    slug: string;
    title: string;
  }>;
}

interface BlogListingStyleProps {
  posts: BlogPost[];
  sidebarSettings?: {
    enabled?: boolean;
    enabledIndex?: boolean;
    enabledSingle?: boolean;
    showRecent: boolean;
    recentCount: number;
    content: string;
    html: string;
    widgetOrder: string[];
  };
  recentPosts?: BlogPost[];
  pagination?: {
    currentPage: number;
    pageSize: number;
    totalCount: number;
  };
}

// Simple List Style - Clean and minimal
export function SimpleListStyle({ posts, sidebarSettings, recentPosts, pagination }: BlogListingStyleProps) {
  const hasSidebar = sidebarSettings?.enabledIndex ?? sidebarSettings?.enabled;
  const router = useRouter();
  const _currentPage = pagination?.currentPage ?? 1;
  const pageSize = pagination?.pageSize ?? 10;
  const totalCount = pagination?.totalCount ?? posts.length;
  const _totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const _onPageChange = (p: number) => {
    const url = new URL(window.location.href);
    if (p === 1) url.searchParams.delete('page'); else url.searchParams.set('page', String(p));
    router.push(url.pathname + url.search);
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 lg:px-8 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-semibold mb-2">Blog</h1>
        <p className="text-neutral-600 dark:text-neutral-400">Latest posts and updates.</p>
      </div>

      <div className={`grid gap-8 ${hasSidebar ? 'lg:grid-cols-3' : ''}`}>
        <div className={hasSidebar ? 'lg:col-span-2' : ''}>
          <div className="space-y-6">
            {posts.length ? (
              posts.map((post) => (
                <article key={post.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-6 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors">
                  <h2 className="text-xl font-semibold mb-2">
                    <Link href={`/blog/${post.slug}`} className="text-neutral-900 dark:text-neutral-100 hover:text-violet-600 dark:hover:text-violet-400">
                      {post.title}
                    </Link>
                  </h2>
                  {post.description && (
                    <p className="text-neutral-600 dark:text-neutral-400 mb-3">{post.description}</p>
                  )}
                  <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-neutral-500">
                    <time>{formatDate(post.publishedAt || post.createdAt, { mode: 'short' })}</time>
                    {post.categories.length > 0 && (
                      <div className="flex gap-2">
                        {post.categories.slice(0, 2).map((cat) => (
                          <span key={cat.id} className="bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-2 py-1 rounded text-xs">
                            {cat.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <div className="text-center py-12 text-neutral-600 dark:text-neutral-400">No posts found.</div>
            )}
          </div>

          <div className="mt-6">
            <Pagination
                currentPage={_currentPage}
                totalPages={_totalPages}
                onPageChange={_onPageChange}
                totalItems={totalCount}
                itemsPerPage={pageSize}
              />
          </div>
        </div>

        {hasSidebar && (
          <div className="lg:col-span-1">
            <BlogSidebar
              recentPosts={(sidebarSettings?.showRecent ?? false) ? recentPosts?.slice(0, sidebarSettings?.recentCount ?? 5) : []}
              showRecent={sidebarSettings?.showRecent ?? false}
              content={sidebarSettings?.content ?? ''}
              html={sidebarSettings?.html ?? ''}
              widgetOrder={sidebarSettings?.widgetOrder ?? []}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Grid Style - Card-based layout with images
export function GridStyle({ posts, sidebarSettings, recentPosts, pagination }: BlogListingStyleProps) {
  const hasSidebar = sidebarSettings?.enabledIndex ?? sidebarSettings?.enabled;
  const router = useRouter();
  const _currentPage = pagination?.currentPage ?? 1;
  const pageSize = pagination?.pageSize ?? 10;
  const totalCount = pagination?.totalCount ?? posts.length;
  const _totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const _onPageChange = (p: number) => {
    const url = new URL(window.location.href);
    if (p === 1) url.searchParams.delete('page'); else url.searchParams.set('page', String(p));
    router.push(url.pathname + url.search);
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Blog</h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-400">Latest posts and updates</p>
      </div>

      <div className={`grid gap-8 ${hasSidebar ? 'lg:grid-cols-4' : ''}`}>
        <div className={hasSidebar ? 'lg:col-span-3' : ''}>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {posts.length ? (
              posts.map((post) => (
                <article key={post.id} className="group cursor-pointer">
                  <Link href={`/blog/${post.slug}`}>
                    <div className="rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                      {post.ogImage ? (
                        <div className="aspect-video overflow-hidden">
                          <Image
                            src={post.ogImage}
                            alt={post.title}
                            width={400}
                            height={225}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                      ) : (
                        <div className="aspect-video bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 flex items-center justify-center">
                          <svg className="w-12 h-12 text-violet-400 dark:text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                          </svg>
                        </div>
                      )}
                      <div className="p-6">
                        <div className="flex flex-wrap gap-1 mb-3">
                          {post.categories.slice(0, 2).map((cat) => (
                            <span key={cat.id} className="bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2 py-1 rounded-full text-xs font-medium">
                              {cat.title}
                            </span>
                          ))}
                        </div>
                        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors line-clamp-2">
                          {post.title}
                        </h2>
                        {post.description && (
                          <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-3 mb-4">
                            {post.description}
                          </p>
                        )}
                        <time className="text-xs text-neutral-500 dark:text-neutral-500">
                          {formatDate(post.publishedAt || post.createdAt, { mode: 'short' })}
                        </time>
                      </div>
                    </div>
                  </Link>
                </article>
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-neutral-600 dark:text-neutral-400">No posts found.</div>
            )}
          </div>
          <div className="mt-6 lg:mt-8">
            <Pagination
              currentPage={_currentPage}
              totalPages={_totalPages}
              onPageChange={_onPageChange}
              totalItems={totalCount}
              itemsPerPage={pageSize}
            />
          </div>
        </div>

        {hasSidebar && (
          <div className="lg:col-span-1">
            <BlogSidebar
              recentPosts={(sidebarSettings?.showRecent ?? false) ? recentPosts?.slice(0, sidebarSettings?.recentCount ?? 5) : []}
              showRecent={sidebarSettings?.showRecent ?? false}
              content={sidebarSettings?.content ?? ''}
              html={sidebarSettings?.html ?? ''}
              widgetOrder={sidebarSettings?.widgetOrder ?? []}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Magazine Style - Featured post + sidebar
export function MagazineStyle({ posts, sidebarSettings, recentPosts, pagination }: BlogListingStyleProps) {
  const [featuredPost, ...otherPosts] = posts;
  const hasSidebar = sidebarSettings?.enabledIndex ?? sidebarSettings?.enabled;
  const router = useRouter();
  const _currentPage = pagination?.currentPage ?? 1;
  const pageSize = pagination?.pageSize ?? 10;
  const totalCount = pagination?.totalCount ?? posts.length;
  const _totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const _onPageChange = (p: number) => {
    const url = new URL(window.location.href);
    if (p === 1) url.searchParams.delete('page'); else url.searchParams.set('page', String(p));
    router.push(url.pathname + url.search);
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Blog</h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-400">Featured stories and highlights</p>
      </div>

      {posts.length ? (
        <div className={hasSidebar ? 'grid lg:grid-cols-3 gap-8' : 'space-y-8'}>
          {/* Left: Featured + grid */}
          <div className={hasSidebar ? 'lg:col-span-2 space-y-8' : 'space-y-8'}>
            {featuredPost && (
              <article className="relative overflow-hidden rounded-3xl shadow-xl">
                <Link href={`/blog/${featuredPost.slug}`} className="block">
                  {featuredPost.ogImage ? (
                    <div className="relative aspect-[16/9]">
                      <Image src={featuredPost.ogImage} alt={featuredPost.title} fill sizes="(min-width: 1024px) 66vw, (min-width: 640px) 100vw, 100vw" className="object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t dark:from-black/80 dark:via-black/40 dark:to-black/10 from-white/70 via-white/30 to-transparent" />
                      <div className="absolute left-6 bottom-6 text-neutral-900 dark:text-white">
                        <div className="flex gap-2 mb-3">
                          {featuredPost.categories.slice(0, 3).map(c => (
                            <span key={c.id} className="px-3 py-1 rounded-full text-sm font-medium drop-shadow-md dark:bg-black/30 dark:text-white dark:border-white/20 bg-white/80 text-neutral-900 border border-neutral-200">{c.title}</span>
                          ))}
                        </div>
                        <h2 className="text-3xl font-extrabold text-neutral-900 dark:text-white drop-shadow-xl dark:[text-shadow:_0_2px_10px_rgb(0_0_0_/_0.9)]">{featuredPost.title}</h2>
                        {featuredPost.description && <p className="mt-2 text-sm max-w-lg text-neutral-700 dark:text-white drop-shadow-lg dark:[text-shadow:_0_1px_6px_rgb(0_0_0_/_0.8)]">{featuredPost.description}</p>}
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-[16/9] bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors">
                      <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{featuredPost.title}</h2>
                    </div>
                  )}
                </Link>
              </article>
            )}

            {/* Grid of other posts */}
            <div className="grid gap-6 md:grid-cols-2">
              {otherPosts.map(post => (
                <article key={post.id} className="group rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
                  <Link href={`/blog/${post.slug}`}>
                    <div className="flex gap-4 p-4 items-center">
                      {post.ogImage ? (
                        <div className="w-28 h-20 flex-shrink-0 overflow-hidden rounded-lg">
                          <Image src={post.ogImage} alt={post.title} width={112} height={80} className="object-cover w-full h-full" />
                        </div>
                      ) : (
                        <div className="w-28 h-20 flex-shrink-0 rounded-lg bg-gradient-to-br from-violet-100 to-purple-100" />
                      )}
                      <div>
                        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{post.title}</h3>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2">{post.description}</p>
                        <time className="text-xs text-neutral-400 mt-2 block">{formatDate(post.publishedAt || post.createdAt, { mode: 'short' })}</time>
                      </div>
                    </div>
                  </Link>
                </article>
              ))}
            </div>

            <div className="mt-6">
              <Pagination
                currentPage={_currentPage}
                totalPages={_totalPages}
                onPageChange={_onPageChange}
                totalItems={totalCount}
                itemsPerPage={pageSize}
              />
            </div>
          </div>

          {/* Right: Sidebar (only when enabled) */}
          {hasSidebar && (
            <div className="lg:col-span-1">
              <BlogSidebar
                recentPosts={(sidebarSettings?.showRecent ?? false) ? recentPosts?.slice(0, sidebarSettings?.recentCount ?? 5) : []}
                showRecent={sidebarSettings?.showRecent ?? false}
                content={sidebarSettings?.content ?? ''}
                html={sidebarSettings?.html ?? ''}
                widgetOrder={sidebarSettings?.widgetOrder ?? []}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-neutral-600 dark:text-neutral-400">No posts found.</div>
      )}
    </div>
  );
}

// Minimal Style - Typography-focused
export function MinimalStyle({ posts, sidebarSettings, recentPosts }: Omit<BlogListingStyleProps, 'pagination'>) {
  const hasSidebar = sidebarSettings?.enabledIndex ?? sidebarSettings?.enabled;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 lg:px-8 py-16">
      <div className="text-center mb-16">
        <h1 className="text-5xl font-light text-neutral-900 dark:text-neutral-100 mb-4">Blog</h1>
        <div className="w-16 h-px bg-neutral-300 dark:bg-neutral-700 mx-auto mb-6"></div>
        <p className="text-neutral-600 dark:text-neutral-400">Latest thoughts and updates</p>
      </div>

      <div className={`grid gap-8 ${hasSidebar ? 'lg:grid-cols-3' : ''}`}>
        <div className={hasSidebar ? 'lg:col-span-2' : ''}>
          <div className="space-y-12">
            {posts.length ? (
              posts.map((post) => (
                <article key={post.id} className="group border-b border-neutral-200 dark:border-neutral-800 pb-12 last:border-b-0">
                  <time className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-500 font-medium">
                    {formatDate(post.publishedAt || post.createdAt, { mode: 'short' })}
                  </time>
                  <h2 className="text-2xl font-light text-neutral-900 dark:text-neutral-100 mt-3 mb-4 leading-tight">
                    <Link href={`/blog/${post.slug}`} className="hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
                      {post.title}
                    </Link>
                  </h2>
                  {post.description && (
                    <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed mb-4">
                      {post.description}
                    </p>
                  )}
                  {post.categories.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      {post.categories.map((cat) => (
                        <span key={cat.id} className="text-xs text-neutral-500 dark:text-neutral-500 border border-neutral-300 dark:border-neutral-700 px-2 py-1">
                          {cat.title}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))
            ) : (
              <div className="text-center py-12 text-neutral-600 dark:text-neutral-400">No posts found.</div>
            )}
          </div>
        </div>

        {hasSidebar && (
          <div className="lg:col-span-1">
            <BlogSidebar
              recentPosts={(sidebarSettings?.showRecent ?? false) ? recentPosts?.slice(0, sidebarSettings?.recentCount ?? 5) : []}
              showRecent={sidebarSettings?.showRecent ?? false}
              content={sidebarSettings?.content ?? ''}
              html={sidebarSettings?.html ?? ''}
              widgetOrder={sidebarSettings?.widgetOrder ?? []}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Timeline Style - Chronological layout
export function TimelineStyle({ posts, sidebarSettings, recentPosts, pagination }: BlogListingStyleProps) {
  const hasSidebar = sidebarSettings?.enabledIndex ?? sidebarSettings?.enabled;
  const router = useRouter();
  const _currentPage = pagination?.currentPage ?? 1;
  const pageSize = pagination?.pageSize ?? 10;
  const totalCount = pagination?.totalCount ?? posts.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const onPageChange = (p: number) => {
    const url = new URL(window.location.href);
    if (p === 1) url.searchParams.delete('page'); else url.searchParams.set('page', String(p));
    router.push(url.pathname + url.search);
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Blog</h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-400">Latest posts and updates</p>
      </div>

      <div className={`grid gap-8 ${hasSidebar ? 'lg:grid-cols-3' : ''}`}>
        <div className={hasSidebar ? 'lg:col-span-2' : ''}>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-8 top-0 bottom-0 w-px bg-neutral-200 dark:bg-neutral-700"></div>

            <div className={`space-y-8`}>
              {posts.length ? (
                posts.map((post) => (
                  <article key={post.id} className="relative flex items-start gap-6">
                    <div className="relative z-10 flex-shrink-0">
                      <div className="w-4 h-4 bg-violet-500 rounded-full border-4 border-white dark:border-neutral-900 shadow-sm"></div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <Link href={`/blog/${post.slug}`}>
                        <div className="group bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6 hover:shadow-lg hover:border-neutral-300 dark:hover:border-neutral-600 transition-all">
                          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                            {post.ogImage && (
                              <div className="w-full lg:w-32 lg:h-24 flex-shrink-0">
                                <Image
                                  src={post.ogImage}
                                  alt={post.title}
                                  width={128}
                                  height={96}
                                  className="w-full h-32 lg:h-24 object-cover rounded-lg group-hover:scale-105 transition-transform duration-300"
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <time className="text-xs text-violet-600 dark:text-violet-400 font-medium">
                                  {formatDate(post.publishedAt || post.createdAt, { mode: 'short' })}
                                </time>
                                {post.categories.length > 0 && (
                                  <>
                                    <span className="text-neutral-300 dark:text-neutral-600">•</span>
                                    <span className="text-xs text-neutral-500 dark:text-neutral-500">
                                      {post.categories[0].title}
                                    </span>
                                  </>
                                )}
                              </div>
                              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                                {post.title}
                              </h2>
                              {post.description && (
                                <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">
                                  {post.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    </div>
                  </article>
                ))
              ) : (
                <div className="text-center py-12 text-neutral-600 dark:text-neutral-400">No posts found.</div>
              )}
            </div>

            <div className="mt-6">
              <Pagination
                currentPage={_currentPage}
                totalPages={totalPages}
                onPageChange={onPageChange}
                totalItems={totalCount}
                itemsPerPage={pageSize}
              />
            </div>
          </div>
        </div>

        {hasSidebar && (
          <div className="lg:col-span-1">
            <BlogSidebar
              recentPosts={(sidebarSettings?.showRecent ?? false) ? recentPosts?.slice(0, sidebarSettings?.recentCount ?? 5) : []}
              showRecent={sidebarSettings?.showRecent ?? false}
              content={sidebarSettings?.content ?? ''}
              html={sidebarSettings?.html ?? ''}
              widgetOrder={sidebarSettings?.widgetOrder ?? []}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Classic Style - Traditional blog layout with left-floating thumbnails
export function ClassicStyle({ posts, sidebarSettings, recentPosts, pagination }: BlogListingStyleProps) {
  const hasSidebar = sidebarSettings?.enabledIndex ?? sidebarSettings?.enabled;
  const router = useRouter();
  const _currentPage = pagination?.currentPage ?? 1;
  const pageSize = pagination?.pageSize ?? 10;
  const totalCount = pagination?.totalCount ?? posts.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const onPageChange = (p: number) => {
    const url = new URL(window.location.href);
    if (p === 1) url.searchParams.delete('page'); else url.searchParams.set('page', String(p));
    router.push(url.pathname + url.search);
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Blog</h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-400">Latest posts and updates</p>
      </div>

      <div className={`grid gap-8 ${hasSidebar ? 'lg:grid-cols-3' : ''}`}>
        <div className={hasSidebar ? 'lg:col-span-2' : ''}>
          <div className="space-y-8">
            {posts.length ? (
              posts.map((post) => (
                <article key={post.id} className="group border-b border-neutral-200 dark:border-neutral-800 pb-8 last:border-b-0">
                  <Link href={`/blog/${post.slug}`}>
                    <div className="flex gap-6 items-start">
                      {/* Left-floating thumbnail */}
                      {post.ogImage ? (
                        <div className="w-32 h-24 flex-shrink-0 rounded-lg overflow-hidden">
                          <Image
                            src={post.ogImage}
                            alt={post.title}
                            width={128}
                            height={96}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                      ) : (
                        <div className="w-32 h-24 flex-shrink-0 rounded-lg bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 flex items-center justify-center">
                          <svg className="w-8 h-8 text-violet-400 dark:text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                          </svg>
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <time className="text-sm text-neutral-500 dark:text-neutral-500">
                            {formatDate(post.publishedAt || post.createdAt, { mode: 'short' })}
                          </time>
                          {post.categories.length > 0 && (
                            <>
                              <span className="text-neutral-300 dark:text-neutral-600">•</span>
                              <div className="flex flex-wrap gap-1">
                                {post.categories.slice(0, 2).map((cat) => (
                                  <span key={cat.id} className="text-xs text-violet-600 dark:text-violet-400 font-medium">
                                    {cat.title}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors line-clamp-2">
                          {post.title}
                        </h2>
                        {post.description && (
                          <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed line-clamp-3">
                            {post.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                </article>
              ))
            ) : (
              <div className="text-center py-12 text-neutral-600 dark:text-neutral-400">No posts found.</div>
            )}
          </div>
        </div>

        {hasSidebar && (
          <div className="lg:col-span-1">
            <BlogSidebar
              recentPosts={(sidebarSettings?.showRecent ?? false) ? recentPosts?.slice(0, sidebarSettings?.recentCount ?? 5) : []}
              showRecent={sidebarSettings?.showRecent ?? false}
              content={sidebarSettings?.content ?? ''}
              html={sidebarSettings?.html ?? ''}
              widgetOrder={sidebarSettings?.widgetOrder ?? []}
            />
          </div>
        )}
      </div>

            <div className="mt-6">
              <Pagination
                currentPage={_currentPage}
                totalPages={totalPages}
                onPageChange={onPageChange}
                totalItems={totalCount}
                itemsPerPage={pageSize}
              />
            </div>
    </div>
  );
}