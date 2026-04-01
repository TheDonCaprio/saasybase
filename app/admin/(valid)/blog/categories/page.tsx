export const dynamic = 'force-dynamic';
import { buildDashboardMetadata } from '@/lib/dashboardMetadata';
import { requireAdminSectionAccess } from '@/lib/route-guards';
import { listBlogCategories } from '@/lib/blog';
import BlogCategoriesPanel from '@/components/admin/blog/BlogCategoriesPanel';
import { DashboardPageHeader } from '@/components/dashboard/DashboardPageHeader';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Blog categories',
    description: 'Organize posts into curated collections and power public directories.',
    audience: 'admin'
  });
}

export default async function BlogCategoriesPage() {
  await requireAdminSectionAccess('blog');
  const categories = await listBlogCategories();

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="emerald"
        eyebrow="Content"
        title="Blog categories"
      />
      <BlogCategoriesPanel initialCategories={categories} />
    </div>
  );
}
