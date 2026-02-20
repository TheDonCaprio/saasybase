import { requireAdminSectionAccess } from '@/lib/route-guards';
import { buildDashboardMetadata } from '@/lib/dashboardMetadata';
import { listBlogPostsPaginated, toBlogPostDTO } from '@/lib/blog';
import { DashboardPageHeader } from '@/components/dashboard/DashboardPageHeader';
import SitePagesList from '@/components/admin/pages/SitePagesList';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Blog posts',
    description: 'Draft, publish, and organize the long-form updates that power your marketing site.',
    audience: 'admin'
  });
}

export default async function AdminBlogPostsPage() {
  await requireAdminSectionAccess('blog');
  const PAGE_SIZE = 50;
  const result = await listBlogPostsPaginated({ page: 1, limit: PAGE_SIZE, includeStatusTotals: true });

  const dto = result.posts.map(toBlogPostDTO);
  const totalPosts = result.overallTotals?.total ?? result.totalCount;
  const publishedPosts = result.overallTotals?.published ?? result.posts.filter((post) => post.published).length;
  const draftPosts = result.overallTotals?.draft ?? Math.max(0, totalPosts - publishedPosts);
  const trashedPosts = result.overallTotals?.trashed ?? 0;
  const systemPosts = result.overallTotals?.system ?? result.posts.filter((post) => post.system).length;

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="rose"
        eyebrow="Content"
        title="Blog posts"
        stats={[
          {
            label: 'Total posts',
            value: totalPosts.toString(),
            helper: `${draftPosts} drafts`,
            tone: 'purple'
          },
          {
            label: 'Published',
            value: publishedPosts.toString(),
            helper: draftPosts > 0 ? 'Ship drafts when ready' : 'Everything is live',
            tone: publishedPosts > 0 ? 'emerald' : 'slate'
          }
        ]}
      >
        <div className="flex items-center justify-between">
          <p>
            Posts publish under
            <code className="ml-1 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-900 dark:bg-slate-900 dark:text-white">/blog/&lt;slug&gt;</code>
            by default. Reuse them across landing pages or curated feeds.
          </p>
          <Link
            href="/admin/blog/new"
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Write post
          </Link>
        </div>
      </DashboardPageHeader>
      <SitePagesList
        initialPages={dto}
        initialTotalCount={result.totalCount}
        initialPublishedCount={publishedPosts}
        initialDraftCount={draftPosts}
        initialTrashedCount={trashedPosts}
        initialSystemCount={systemPosts}
        pageSize={PAGE_SIZE}
        apiBasePath="/api/admin/blog"
        editBasePath="/admin/blog"
        newItemHref="/admin/blog/new"
        storageNamespace="blog-editor"
        entityLabel="Post"
        entityLabelPlural="Posts"
      />
    </div>
  );
}
