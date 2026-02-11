import { requireAdminAuth } from '../../../lib/route-guards';
import { listSitePagesPaginated, toSitePageDTO } from '../../../lib/sitePages';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import SitePagesList from '@/components/admin/pages/SitePagesList';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Pages',
    description: 'Draft, publish, and manage the legal and marketing pages that power your public site.',
    audience: 'admin'
  });
}

export default async function AdminPagesPage() {
  await requireAdminAuth('/admin/pages');
  const PAGE_SIZE = 50;
  const result = await listSitePagesPaginated({ page: 1, limit: PAGE_SIZE, includeStatusTotals: true });

  const dto = result.pages.map(toSitePageDTO);
  const totalPages = result.overallTotals?.total ?? result.totalCount;
  const publishedPages = result.overallTotals?.published ?? result.pages.filter((page) => page.published).length;
  const draftPages = result.overallTotals?.draft ?? Math.max(0, totalPages - publishedPages);
  const trashedPages = result.overallTotals?.trashed ?? 0;
  const systemPages = result.overallTotals?.system ?? result.pages.filter((page) => page.system).length;

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="violet"
        eyebrow="Content"
        title="Site pages"
        description=""
        stats={[
          {
            label: 'Total pages',
            value: totalPages.toString(),
            helper: `${draftPages} drafts`,
            tone: 'purple'
          },
          {
            label: 'Published',
            value: publishedPages.toString(),
            helper: draftPages > 0 ? 'Ship drafts when ready' : 'Everything is live',
            tone: publishedPages > 0 ? 'emerald' : 'slate'
          },
        ]}
      >
        <div className="flex items-center justify-between">
          <p>
            Core system pages like terms and privacy are protected but still editable here. All published pages resolve at
            <code className="ml-1 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-900 dark:bg-slate-900 dark:text-white">/&lt;slug&gt;</code> unless you map them elsewhere.
          </p>
          <Link
            href="/admin/pages/new"
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </Link>
        </div>
      </DashboardPageHeader>
      <SitePagesList
        initialPages={dto}
        initialTotalCount={result.totalCount}
        initialPublishedCount={publishedPages}
        initialDraftCount={draftPages}
        initialTrashedCount={trashedPages}
        initialSystemCount={systemPages}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
