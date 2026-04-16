export type PageEditorVariant = 'simple' | 'rich';

export type PageEditorContentType = 'page' | 'blog';

export const pageEditorVariantByContentType: Record<PageEditorContentType, PageEditorVariant> = {
  page: 'simple',
  blog: 'rich',
};