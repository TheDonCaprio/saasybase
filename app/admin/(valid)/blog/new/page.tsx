export const dynamic = 'force-dynamic';
import { buildDashboardMetadata } from '@/lib/dashboardMetadata';
import PageEditor from '@/components/admin/pages/PageEditor';
import { requireAdminSectionAccess } from '@/lib/route-guards';
import { listBlogCategories } from '@/lib/blog';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'New Blog Post',
    description: 'Draft a new story, changelog, or announcement for your blog.',
    audience: 'admin'
  });
}

export default async function NewBlogPostPage() {
  await requireAdminSectionAccess('blog');
  const categories = await listBlogCategories();

  return (
    <PageEditor
      mode="create"
      apiBasePath="/api/admin/blog"
      editBasePath="/admin/blog"
      storageNamespace="blog-editor"
      enableCategories
      categories={categories}
      entityLabel="Blog Post"
      entityLabelPlural="Blog Posts"
      previewPathPrefix="/blog"
      backHref="/admin/blog"
      categoriesHref="/admin/blog/categories"
      uploadScope="blog"
    />
  );
}
