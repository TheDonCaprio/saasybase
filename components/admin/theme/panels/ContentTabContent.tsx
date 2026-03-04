"use client";

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowDown,
  faArrowUp,
  faClock,
  faCode,
  faEye,
  faEyeSlash,
  faFileText,
  faGripVertical,
  faNewspaper,
  faTableCells,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import SimplePageEditor from '../../pages/SimplePageEditor';

const cx = (...inputs: ClassValue[]) => twMerge(clsx(...inputs));

export interface BlogSidebarWidget {
  id: string;
  type: 'recent-posts' | 'rich-content' | 'raw-html';
  title: string;
  enabled: boolean;
  order: number;
  settings: {
    recentCount?: number;
    content?: string;
    html?: string;
  };
}

export function ContentTabContent({
  blogListingStyle,
  setBlogListingStyle,
  blogListingPageSize,
  setBlogListingPageSize,
  blogSidebarEnabledIndex,
  setBlogSidebarEnabledIndex,
  blogSidebarEnabledSingle,
  setBlogSidebarEnabledSingle,
  blogSidebarEnabledArchive,
  setBlogSidebarEnabledArchive,
  blogSidebarEnabledPages,
  setBlogSidebarEnabledPages,
  blogRelatedPostsEnabled,
  setBlogRelatedPostsEnabled,
  blogHtmlBeforeFirst,
  setBlogHtmlBeforeFirst,
  blogHtmlMiddle,
  setBlogHtmlMiddle,
  blogHtmlAfterLast,
  setBlogHtmlAfterLast,
  sidebarWidgets,
  addWidget,
  removeWidget,
  toggleWidget,
  updateWidgetSettings,
  updateWidgetTitle,
  moveWidget,
  canMoveUp,
  canMoveDown,
}: {
  blogListingStyle: string;
  setBlogListingStyle: (value: string) => void;
  blogListingPageSize: number;
  setBlogListingPageSize: (value: number) => void;
  blogSidebarEnabledIndex: boolean;
  setBlogSidebarEnabledIndex: (value: boolean) => void;
  blogSidebarEnabledSingle: boolean;
  setBlogSidebarEnabledSingle: (value: boolean) => void;
  blogSidebarEnabledArchive: boolean;
  setBlogSidebarEnabledArchive: (value: boolean) => void;
  blogSidebarEnabledPages: boolean;
  setBlogSidebarEnabledPages: (value: boolean) => void;
  blogRelatedPostsEnabled: boolean;
  setBlogRelatedPostsEnabled: (value: boolean) => void;
  blogHtmlBeforeFirst: string;
  setBlogHtmlBeforeFirst: (value: string) => void;
  blogHtmlMiddle: string;
  setBlogHtmlMiddle: (value: string) => void;
  blogHtmlAfterLast: string;
  setBlogHtmlAfterLast: (value: string) => void;
  sidebarWidgets: BlogSidebarWidget[];
  addWidget: (type: BlogSidebarWidget['type']) => void;
  removeWidget: (id: string) => void;
  toggleWidget: (id: string) => void;
  updateWidgetSettings: (id: string, settings: Partial<BlogSidebarWidget['settings']>) => void;
  updateWidgetTitle: (id: string, title: string) => void;
  moveWidget: (id: string, direction: 'up' | 'down') => void;
  canMoveUp: (id: string) => boolean;
  canMoveDown: (id: string) => boolean;
}) {
  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-neutral-50 mb-2">
          <FontAwesomeIcon icon={faTableCells} className="h-5 w-5" />
          <div>Blog Listing Style</div>
        </div>
        <p className="text-sm text-slate-600 dark:text-neutral-400 mb-6">
          Configure how your blog listing page appears to visitors.
        </p>
        <div className="space-y-3">
          <label htmlFor="blog-listing-style" className="block text-sm font-medium text-slate-900 dark:text-neutral-100">
            Blog listing style
          </label>
          <select
            id="blog-listing-style"
            value={blogListingStyle}
            onChange={(e) => setBlogListingStyle(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          >
            <option value="simple">Simple List - Clean and minimal cards</option>
            <option value="grid">Grid - Card layout with featured images</option>
            <option value="magazine">Magazine - Featured post with sidebar</option>
            <option value="minimal">Minimal - Typography-focused design</option>
            <option value="timeline">Timeline - Chronological layout</option>
            <option value="classic">Classic - Traditional layout with left thumbnails</option>
          </select>
          <p className="text-xs text-slate-500 dark:text-neutral-500">
            Choose how your blog posts are displayed on the /blog page. Styles that support images will use social image URLs from your posts.
          </p>
          <div className="mt-3">
            <label htmlFor="blog-listing-page-size" className="block text-sm font-medium text-slate-900 dark:text-neutral-100">
              Posts per page
            </label>
            <input
              id="blog-listing-page-size"
              type="number"
              min={1}
              max={50}
              value={blogListingPageSize}
              onChange={(e) => setBlogListingPageSize(Math.max(1, Math.min(50, parseInt(e.target.value || '10', 10))))}
              className="mt-1 w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <p className="text-xs text-slate-500 dark:text-neutral-500 mt-1">Controls how many posts appear per page on the blog listing.</p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-neutral-50 mb-2">
            <FontAwesomeIcon icon={faNewspaper} className="h-5 w-5" />
            <div>Blog Sidebar & Related Posts</div>
          </div>
          <p className="text-sm text-slate-600 dark:text-neutral-400">
            Configure where sidebars appear and enable related posts. Manage sidebar widgets below.
          </p>

          <div className="mt-4 rounded-lg border border-slate-200 dark:border-neutral-700 bg-slate-50/50 dark:bg-neutral-800/50 p-4">
            <h4 className="text-sm font-medium text-slate-900 dark:text-neutral-100 mb-3">Display Settings</h4>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <input
                  id="blog-sidebar-enabled-index"
                  type="checkbox"
                  checked={blogSidebarEnabledIndex}
                  onChange={(e) => setBlogSidebarEnabledIndex(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-violet-600 focus:ring-violet-500 border-slate-300 rounded dark:border-neutral-600 dark:bg-neutral-700"
                />
                <div>
                  <label htmlFor="blog-sidebar-enabled-index" className="text-sm font-medium text-slate-900 dark:text-neutral-100">
                    Enable sidebar on blog listing
                  </label>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">Shows sidebar on the main blog page (/blog)</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <input
                  id="blog-sidebar-enabled-single"
                  type="checkbox"
                  checked={blogSidebarEnabledSingle}
                  onChange={(e) => setBlogSidebarEnabledSingle(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-violet-600 focus:ring-violet-500 border-slate-300 rounded dark:border-neutral-600 dark:bg-neutral-700"
                />
                <div>
                  <label htmlFor="blog-sidebar-enabled-single" className="text-sm font-medium text-slate-900 dark:text-neutral-100">
                    Enable sidebar on single posts
                  </label>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">Shows sidebar on individual blog posts (/blog/post-name)</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <input
                  id="blog-sidebar-enabled-archive"
                  type="checkbox"
                  checked={blogSidebarEnabledArchive}
                  onChange={(e) => setBlogSidebarEnabledArchive(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-violet-600 focus:ring-violet-500 border-slate-300 rounded dark:border-neutral-600 dark:bg-neutral-700"
                />
                <div>
                  <label htmlFor="blog-sidebar-enabled-archive" className="text-sm font-medium text-slate-900 dark:text-neutral-100">
                    Enable sidebar on archive pages
                  </label>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">Shows sidebar on category pages (/blog/category/name)</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <input
                  id="blog-sidebar-enabled-pages"
                  type="checkbox"
                  checked={blogSidebarEnabledPages}
                  onChange={(e) => setBlogSidebarEnabledPages(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-violet-600 focus:ring-violet-500 border-slate-300 rounded dark:border-neutral-600 dark:bg-neutral-700"
                />
                <div>
                  <label htmlFor="blog-sidebar-enabled-pages" className="text-sm font-medium text-slate-900 dark:text-neutral-100">
                    Enable sidebar on generic pages
                  </label>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">Shows sidebar on content pages (/privacy, /terms, etc.)</p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-neutral-600">
                <div className="flex items-start gap-3">
                  <input
                    id="blog-related-posts-enabled"
                    type="checkbox"
                    checked={blogRelatedPostsEnabled}
                    onChange={(e) => setBlogRelatedPostsEnabled(e.target.checked)}
                    className="mt-0.5 h-4 w-4 text-violet-600 focus:ring-violet-500 border-slate-300 rounded dark:border-neutral-600 dark:bg-neutral-700"
                  />
                  <div>
                    <label htmlFor="blog-related-posts-enabled" className="text-sm font-medium text-slate-900 dark:text-neutral-100">
                      Show related posts under blog articles
                    </label>
                    <p className="text-xs text-slate-500 dark:text-neutral-400">Displays up to 4 related posts at the bottom of each blog post</p>
                  </div>
                </div>

                <div className="mt-4">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-neutral-100 mb-2">HTML Snippets (Blog posts)</h4>
                  <p className="text-xs text-slate-500 dark:text-neutral-400 mb-3">Insert custom HTML snippets into blog posts. Use responsibly — this HTML is rendered as-is.</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300">Before first paragraph</label>
                      <textarea
                        value={blogHtmlBeforeFirst}
                        onChange={(e) => setBlogHtmlBeforeFirst(e.target.value)}
                        rows={3}
                        placeholder="<div class='promo'>Signup now</div>"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300">Insert in the middle of the post</label>
                      <textarea
                        value={blogHtmlMiddle}
                        onChange={(e) => setBlogHtmlMiddle(e.target.value)}
                        rows={3}
                        placeholder="<div class='ad'>Ad code</div>"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300">After last paragraph</label>
                      <textarea
                        value={blogHtmlAfterLast}
                        onChange={(e) => setBlogHtmlAfterLast(e.target.value)}
                        rows={3}
                        placeholder="<div class='related-cta'>More posts</div>"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {(blogSidebarEnabledIndex || blogSidebarEnabledSingle || blogSidebarEnabledArchive || blogSidebarEnabledPages) && (
          <div className="space-y-6">
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-700 dark:bg-blue-900/20">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Add New Widget</h4>
                  <p className="text-xs text-blue-700 dark:text-blue-300">Choose a widget type to add to your blog sidebar.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => addWidget('recent-posts')}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    <FontAwesomeIcon icon={faClock} className="h-3 w-3" />
                    Recent Posts
                  </button>
                  <button
                    type="button"
                    onClick={() => addWidget('rich-content')}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
                  >
                    <FontAwesomeIcon icon={faFileText} className="h-3 w-3" />
                    Rich Content
                  </button>
                  <button
                    type="button"
                    onClick={() => addWidget('raw-html')}
                    className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
                  >
                    <FontAwesomeIcon icon={faCode} className="h-3 w-3" />
                    Custom HTML
                  </button>
                </div>
              </div>
            </div>

            {sidebarWidgets.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-8 text-center dark:border-neutral-700 dark:bg-neutral-900/60">
                <FontAwesomeIcon icon={faNewspaper} className="h-12 w-12 text-slate-400 dark:text-neutral-500 mb-3" />
                <p className="text-lg font-medium text-slate-900 dark:text-neutral-100 mb-1">No widgets yet</p>
                <p className="text-sm text-slate-600 dark:text-neutral-400">Add your first widget to get started with your blog sidebar.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sidebarWidgets.map((widget, index) => (
                  <div
                    key={widget.id}
                    className={cx(
                      'rounded-xl border p-4 transition-all',
                      widget.enabled
                        ? 'border-slate-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900'
                        : 'border-slate-200 bg-slate-50 opacity-60 dark:border-neutral-700 dark:bg-neutral-800/60',
                    )}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-slate-600 dark:text-neutral-400">
                          <FontAwesomeIcon icon={faGripVertical} className="h-4 w-4" />
                          <span className="text-xs font-medium">#{index + 1}</span>
                        </div>
                        <div className="flex-1">
                          <input
                            type="text"
                            value={widget.title}
                            onChange={(e) => updateWidgetTitle(widget.id, e.target.value)}
                            className="w-full rounded-md border-0 bg-transparent px-2 py-1 text-sm font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 dark:text-neutral-100 dark:focus:bg-neutral-800"
                            placeholder="Widget title"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => moveWidget(widget.id, 'up')}
                            disabled={!canMoveUp(widget.id)}
                            className="rounded-md p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed dark:text-neutral-500 dark:hover:text-neutral-300"
                          >
                            <FontAwesomeIcon icon={faArrowUp} className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveWidget(widget.id, 'down')}
                            disabled={!canMoveDown(widget.id)}
                            className="rounded-md p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed dark:text-neutral-500 dark:hover:text-neutral-300"
                          >
                            <FontAwesomeIcon icon={faArrowDown} className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleWidget(widget.id)}
                            className={cx(
                              'rounded-md p-1 transition-colors',
                              widget.enabled
                                ? 'text-green-600 hover:text-green-700 dark:text-green-400'
                                : 'text-slate-400 hover:text-slate-600 dark:text-neutral-500',
                            )}
                          >
                            <FontAwesomeIcon icon={widget.enabled ? faEye : faEyeSlash} className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeWidget(widget.id)}
                            className="rounded-md p-1 text-rose-400 hover:text-rose-600 dark:text-rose-500 dark:hover:text-rose-400"
                          >
                            <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {widget.enabled && (
                        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-800/60">
                          {widget.type === 'recent-posts' && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                                <FontAwesomeIcon icon={faClock} className="h-3 w-3" />
                                Recent Posts Settings
                              </div>
                              <div className="space-y-2">
                                <label className="block text-xs font-medium text-slate-900 dark:text-neutral-100">
                                  Number of posts to show
                                </label>
                                <select
                                  value={widget.settings.recentCount || 5}
                                  onChange={(e) => updateWidgetSettings(widget.id, { recentCount: parseInt(e.target.value, 10) })}
                                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100"
                                >
                                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                                    <option key={num} value={num}>
                                      {num} post{num === 1 ? '' : 's'}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          )}

                          {widget.type === 'rich-content' && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                                <FontAwesomeIcon icon={faFileText} className="h-3 w-3" />
                                Rich Content Editor
                              </div>
                              <SimplePageEditor
                                value={widget.settings.content || ''}
                                onChange={(content) => updateWidgetSettings(widget.id, { content })}
                                placeholder="Create rich content for your sidebar..."
                              />
                            </div>
                          )}

                          {widget.type === 'raw-html' && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                                <FontAwesomeIcon icon={faCode} className="h-3 w-3" />
                                Custom HTML Code
                              </div>
                              <textarea
                                value={widget.settings.html || ''}
                                onChange={(e) => updateWidgetSettings(widget.id, { html: e.target.value })}
                                rows={4}
                                placeholder="<div>Custom HTML content...</div>"
                                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100"
                              />
                              <p className="text-xs text-slate-500 dark:text-neutral-500">
                                Raw HTML will be inserted directly into the sidebar. Use with caution.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
