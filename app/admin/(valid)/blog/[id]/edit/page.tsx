export const dynamic = 'force-dynamic';
import { buildDashboardMetadata } from '@/lib/dashboardMetadata';
import { notFound } from 'next/navigation';
import BlogPostEditor from '@/components/admin/blog/BlogPostEditor';
import { getBlogPostById, listBlogCategories, toBlogPostDTO } from '@/lib/blog';
import { requireAdminSectionAccess } from '@/lib/route-guards';
import { Logger } from '@/lib/logger';

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

async function loadEditBlogPostData(postId: string) {
  try {
    const [post, categories] = await Promise.all([
      getBlogPostById(postId),
      listBlogCategories(),
    ]);

    if (!post) {
      return null;
    }

    return {
      categories,
      postDTO: toBlogPostDTO(post),
    };
  } catch (error) {
    Logger.error('Error loading blog post', error);
    return null;
  }
}

export default async function EditBlogPostPage({ params }: EditBlogPostPageProps) {
  await requireAdminSectionAccess('blog');
  const resolved = await params;

  const data = await loadEditBlogPostData(resolved.id);
  if (!data) {
    notFound();
  }

  return (
    <BlogPostEditor
      mode="edit"
      initialPage={data.postDTO}
      apiBasePath="/api/admin/blog"
      editBasePath="/admin/blog"
      storageNamespace="blog-editor"
      enableCategories
      categories={data.categories}
      entityLabel="Blog Post"
      entityLabelPlural="Blog Posts"
      previewPathPrefix="/blog"
      backHref="/admin/blog"
      categoriesHref="/admin/blog/categories"
      uploadScope="file"
    />
  );
}
