'use client';

import PageEditor, { type PageEditorProps } from './PageEditor';
import { pageEditorVariantByContentType, type PageEditorContentType } from './PageEditorMode';

interface PageEditorEntryProps extends Omit<PageEditorProps, 'editorVariant'> {
  contentType?: PageEditorContentType;
}

export default function PageEditorEntry({
  contentType = 'page',
  ...props
}: PageEditorEntryProps) {
  return <PageEditor {...props} editorVariant={pageEditorVariantByContentType[contentType]} />;
}