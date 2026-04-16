export const dynamic = 'force-dynamic';
import { buildDashboardMetadata } from '../../../../../../lib/dashboardMetadata';
import { notFound } from 'next/navigation';
import PageEditorEntry from '@/components/admin/pages/PageEditorEntry';
import { getPageById, toSitePageDTO } from '@/lib/sitePages';
import { requireAdminPageAccess } from '@/lib/route-guards';
import { Logger } from '@/lib/logger';

interface EditPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: EditPageProps) {
  try {
    const resolved = await params;
    const page = await getPageById(resolved.id);
    
    return buildDashboardMetadata({
      page: page ? `Edit ${page.title}` : 'Edit Page',
      description: 'Edit an existing page with our modern WYSIWYG editor.',
      audience: 'admin'
    });
  } catch {
    return buildDashboardMetadata({
      page: 'Edit Page',
      description: 'Edit an existing page',
      audience: 'admin'
    });
  }
}

async function loadEditPageData(pageId: string) {
  try {
    const page = await getPageById(pageId);
    if (!page) {
      return null;
    }

    return toSitePageDTO(page);
  } catch (error) {
    Logger.error('Error loading page', error);
    return null;
  }
}

export default async function EditPagePage({ params }: EditPageProps) {
  const resolved = await params;
  await requireAdminPageAccess(`/admin/pages/${resolved.id}/edit`);

  const pageDTO = await loadEditPageData(resolved.id);
  if (!pageDTO) {
    notFound();
  }

  return (
    <PageEditorEntry
      contentType="page"
      mode="edit"
      initialPage={pageDTO}
      enableCategories={false}
      categories={[]}
      entityLabel="Page"
      entityLabelPlural="Pages"
      previewPathPrefix=""
      backHref="/admin/pages"
      categoriesHref=""
    />
  );
}