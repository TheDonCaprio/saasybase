'use client';

import PageEditor, {
  type PageEditorCategoryManagerProps,
  type PageEditorProps,
} from '@/components/admin/pages/PageEditor';
import BlogCategoriesPanel from './BlogCategoriesPanel';

type BlogPostEditorProps = Omit<PageEditorProps, 'categoriesManagerComponent'>;

function BlogPostCategoryManager(props: PageEditorCategoryManagerProps) {
  return <BlogCategoriesPanel {...props} />;
}

export default function BlogPostEditor(props: BlogPostEditorProps) {
  return <PageEditor {...props} categoriesManagerComponent={BlogPostCategoryManager} />;
}