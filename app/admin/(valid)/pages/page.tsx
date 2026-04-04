import { requireAdminAuth } from '../../../../lib/route-guards';
import { listSitePagesPaginated, toSitePageDTO } from '../../../../lib/sitePages';
import { DashboardPageHeader } from '../../../../components/dashboard/DashboardPageHeader';
import SitePagesList from '@/components/admin/pages/SitePagesList';
import { buildDashboardMetadata } from '../../../../lib/dashboardMetadata';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileLines } from '@fortawesome/free-solid-svg-icons';

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
    <div className="space-y-6">
      <DashboardPageHeader
        accent="violet"
        eyebrow="Content"
        eyebrowIcon={<FontAwesomeIcon icon={faFileLines} />}
        title="Site pages"
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
      />
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
