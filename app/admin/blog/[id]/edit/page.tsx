export const dynamic = 'force-dynamic';
import { buildDashboardMetadata } from '@/lib/dashboardMetadata';
import { notFound } from 'next/navigation';
import PageEditor from '@/components/admin/pages/PageEditor';
import { getBlogPostById, listBlogCategories, toBlogPostDTO } from '@/lib/blog';
import { requireAdminSectionAccess } from '@/lib/route-guards';

interface EditBlogPostPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: EditBlogPostPageProps) {
  try {
    const resolved = await params;
    const post = await getBlogPostById(resolved.id);

    return buildDashboardMetadata({
      page: post ? `Edit ${post.title}` : 'Edit Blog Post',
      description: 'Edit an existing blog post with the full WYSIWYG experience.',
      audience: 'admin'
    });
  } catch {
    return buildDashboardMetadata({
      page: 'Edit Blog Post',
      description: 'Edit an existing blog post.',
      audience: 'admin'
    });
  }
}

export default async function EditBlogPostPage({ params }: EditBlogPostPageProps) {
  await requireAdminSectionAccess('blog');
  const resolved = await params;

  try {
    const [post, categories] = await Promise.all([
      getBlogPostById(resolved.id),
      listBlogCategories()
    ]);

    if (!post) {
      notFound();
    }

    const postDTO = toBlogPostDTO(post);

    return (
      <PageEditor
        mode="edit"
        initialPage={postDTO}
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
  } catch (error) {
    console.error('Error loading blog post:', error);
    notFound();
  }
}
