export const dynamic = 'force-dynamic';
import { buildDashboardMetadata } from '@/lib/dashboardMetadata';
import BlogPostEditor from '@/components/admin/blog/BlogPostEditor';
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
    <BlogPostEditor
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
      uploadScope="file"
    />
  );
}
