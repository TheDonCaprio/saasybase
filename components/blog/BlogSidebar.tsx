'use client';

import Link from 'next/link';
import Image from 'next/image';
import { formatDate } from '@/lib/formatDate';
import { SiteContentRenderer } from '@/components/site-pages/SiteContentRenderer';

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  ogImage: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

interface BlogSidebarProps {
  recentPosts?: BlogPost[];
  showRecent?: boolean;
  content?: string;
  html?: string;
  widgetOrder?: string[];
}

export function BlogSidebar({ 
  recentPosts = [], 
  showRecent = true, 
  content = '', 
  html = '', 
  widgetOrder = ['recent-posts', 'rich-content', 'raw-html'] 
}: BlogSidebarProps) {
  const hasContent = showRecent && recentPosts.length > 0 || content.trim() || html.trim();

  if (!hasContent) {
    return null;
  }

  // Define widget components
  const widgets = {
    'recent-posts': () => showRecent && recentPosts.length > 0 ? (
      <div key="recent-posts" className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Recent Posts</h3>
        <div className="space-y-4">
          {recentPosts.map((post) => (
            <article key={post.id} className="group">
              <Link href={`/blog/${post.slug}`}>
                <div className="flex gap-3 p-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors">
                  {post.ogImage ? (
                    <div className="w-16 h-12 flex-shrink-0 rounded overflow-hidden">
                      <Image
                        src={post.ogImage}
                        alt={post.title}
                        width={64}
                        height={48}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-12 flex-shrink-0 rounded bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-violet-400 dark:text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-neutral-900 dark:text-neutral-100 line-clamp-2 text-sm group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                      {post.title}
                    </h4>
                    <time className="text-xs text-neutral-500 dark:text-neutral-500 mt-1 block">
                      {formatDate(post.publishedAt || post.createdAt, { mode: 'short' })}
                    </time>
                  </div>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </div>
    ) : null,
    'rich-content': () => content.trim() ? (
      <div key="rich-content" className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
          <SiteContentRenderer content={content} className="prose prose-sm prose-neutral dark:prose-invert max-w-none" />
        </div>
      </div>
    ) : null,
    'raw-html': () => html.trim() ? (
      <div key="raw-html" className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
        <div 
          className="prose prose-sm prose-neutral dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    ) : null
  };

  // Render widgets in the specified order
  const orderedWidgets = widgetOrder
    .map(widgetType => widgets[widgetType as keyof typeof widgets]?.())
    .filter(Boolean);

  return (
    <aside className="space-y-8">
      {orderedWidgets}
    </aside>
  );
}