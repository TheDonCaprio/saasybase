import { requireAdminSectionAccess } from '@/lib/route-guards';
import { buildDashboardMetadata } from '@/lib/dashboardMetadata';
import { listBlogPostsPaginated, toBlogPostDTO } from '@/lib/blog';
import { DashboardPageHeader } from '@/components/dashboard/DashboardPageHeader';
import SitePagesList from '@/components/admin/pages/SitePagesList';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileLines } from '@fortawesome/free-solid-svg-icons';

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
    <div className="space-y-6">
      <DashboardPageHeader
        accent="rose"
        eyebrow="Content"
        eyebrowIcon={<FontAwesomeIcon icon={faFileLines} />}
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
      />
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
        previewPathPrefix="/blog"
      />
    </div>
  );
}
