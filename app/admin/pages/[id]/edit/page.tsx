export const dynamic = 'force-dynamic';
import { buildDashboardMetadata } from '../../../../../lib/dashboardMetadata';
import { notFound } from 'next/navigation';
import PageEditor from '@/components/admin/pages/PageEditor';
import { getPageById, toSitePageDTO } from '@/lib/sitePages';
import { requireAdminAuth } from '@/lib/route-guards';

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

export default async function EditPagePage({ params }: EditPageProps) {
  const resolved = await params;
  await requireAdminAuth(`/admin/pages/${resolved.id}/edit`);

  try {
    const page = await getPageById(resolved.id);
    
    if (!page) {
      notFound();
    }

    const pageDTO = toSitePageDTO(page);

    return (
      <PageEditor
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
  } catch (error) {
    console.error('Error loading page:', error);
    notFound();
  }
}