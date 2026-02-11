export const dynamic = 'force-dynamic';
import { buildDashboardMetadata } from '../../../../lib/dashboardMetadata';
import PageEditor from '@/components/admin/pages/PageEditor';
import { requireAdminAuth } from '@/lib/route-guards';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'New Page',
    description: 'Create a new page for your site with our modern WYSIWYG editor.',
    audience: 'admin'
  });
}

export default async function NewPagePage() {
  await requireAdminAuth('/admin/pages/new');

  return (
    <PageEditor
      mode="create"
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