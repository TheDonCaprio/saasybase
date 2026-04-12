'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { NodeSelection, TextSelection, EditorState } from '@tiptap/pm/state';
import { Fragment, Slice } from '@tiptap/pm/model';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Editor as TiptapEditor, JSONContent } from '@tiptap/core';
import { useRouter } from 'next/navigation';
import NextLink from 'next/link';
import { useState, useEffect, useCallback, useRef, useMemo, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { showToast } from '../../ui/Toast';
import { dashboardPanelClass, dashboardMutedPanelClass } from '../../dashboard/dashboardSurfaces';
import { DashboardPageHeader } from '../../dashboard/DashboardPageHeader';
import { SitePageDTO } from './SitePagesList';
import ImageEditorModal from './ImageEditorModal';
import { ImagePickerModal } from '../../ui/ImagePickerModal';
import BlogCategoriesPanel from '../blog/BlogCategoriesPanel';
import { CustomImage } from './CustomImage';
import CustomIframe, { IframeAttrs } from './CustomIframe';
import Youtube from '@tiptap/extension-youtube';
import { useFormatSettings } from '../../FormatSettingsProvider';
import { formatDate } from '../../../lib/formatDate';
import './editor.css';
import type { BlogCategoryDTO } from '@/lib/blog';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPenToSquare, faPlus } from '@fortawesome/free-solid-svg-icons';
import {
  DEFAULT_IFRAME_SANDBOX,
  EmbedAlign,
  ImageEditorState,
  ImageNodeAttrs,
  canEditImageType,
  ensureExtensionForMime,
  inferMimeFromName,
  isValidLinkHref,
  parseDimension,
  runIframeEmbed,
  runYoutubeEmbed,
} from './richTextHelpers';

interface PageEditorProps {
  mode: 'create' | 'edit';
  initialPage?: SitePageDTO;
  apiBasePath?: string;
  editBasePath?: string;
  storageNamespace?: string;
  categories?: BlogCategoryDTO[];
  enableCategories?: boolean;
  entityLabel?: string;
  entityLabelPlural?: string;
  previewPathPrefix?: string;
  backHref?: string;
  categoriesHref?: string;
  uploadScope?: 'file' | 'blog' | 'logo';
}

interface FormData {
  title: string;
  slug: string;
  description: string;
  content: string;
  published: boolean;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  noIndex: boolean;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  categoryIds: string[];
}

const DEFAULT_FORM_DATA: FormData = {
  title: '',
  slug: '',
  description: '',
  content: '',
  published: false,
  metaTitle: '',
  metaDescription: '',
  canonicalUrl: '',
  noIndex: false,
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  categoryIds: [],
};

const MAX_SLUG_LENGTH = 30;
const CATEGORY_SELECTION_LIMIT = 3;


const sanitizeCategoryIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => (typeof id === 'string' ? id.trim() : ''))
    .filter((id): id is string => Boolean(id));
};

const mergeFormData = (data?: Partial<FormData> | null): FormData => ({
  ...DEFAULT_FORM_DATA,
  ...data,
  categoryIds: sanitizeCategoryIds(data?.categoryIds)
});


const normalizeSlug = (value: string) => {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/_+/g, '_');
  const trimmed = cleaned.replace(/^-+|-+$/g, '');
  const truncated = trimmed.slice(0, MAX_SLUG_LENGTH);
  return truncated.replace(/^-+|-+$/g, '');
};


const guessFilenameFromUrl = (value: string) => {
  try {
    const url = new URL(value, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    const last = url.pathname.split('/').filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  } catch {
    // ignore bad urls
  }
  return 'image-upload';
};

export default function PageEditor({
  mode,
  initialPage,
  apiBasePath = '/api/admin/pages',
  editBasePath = '/admin/pages',
  storageNamespace = 'page-editor',
  categories = [],
  enableCategories = false,
  entityLabel = 'Page',
  entityLabelPlural,
  previewPathPrefix = '',
  backHref,
  uploadScope = 'file'
}: PageEditorProps) {
  const router = useRouter();
  const { mode: formatMode, timezone: formatTimezone } = useFormatSettings();
  const normalizedApiBasePath = apiBasePath.replace(/\/$/, '');
  const normalizedEditBasePath = editBasePath.replace(/\/$/, '');
  const [formData, setFormData] = useState<FormData>(() => mergeFormData());
  const [isSaving, setIsSaving] = useState(false);
  const [hideBubbleMenus, setHideBubbleMenus] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);
  const [showEmbedModal, setShowEmbedModal] = useState(false);
  const [embedInput, setEmbedInput] = useState('');
  const [embedWidth, setEmbedWidth] = useState<string | null>(null);
  const [embedHeight, setEmbedHeight] = useState<string | null>(null);
  const [embedAlign, setEmbedAlign] = useState<EmbedAlign>('center');
  const [imagePickerTarget, setImagePickerTarget] = useState<'editor' | 'socialImage'>('editor');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkOpensInNewTab, setLinkOpensInNewTab] = useState(false);
  const [imageEditorState, setImageEditorState] = useState<ImageEditorState | null>(null);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);

  // Defer fullscreen state changes to avoid TipTap's internal flushSync
  // being called while React is already rendering (EditorContent remounts
  // when moving between the inline view and the fullscreen portal).
  const toggleEditorFullscreen = useCallback((value?: boolean) => {
    requestAnimationFrame(() => {
      setIsEditorFullscreen((prev) => (value !== undefined ? value : !prev));
    });
  }, []);
  const [isEditingSlug, setIsEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [showConfirmManualRestore, setShowConfirmManualRestore] = useState(false);
  const [showConfirmAutoRestore, setShowConfirmAutoRestore] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const wasFullscreenRef = useRef(isEditorFullscreen);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  // Refs used for DOM-teleport fullscreen approach
  const editorWrapperRef = useRef<HTMLDivElement | null>(null);
  const editorPlaceholderRef = useRef<HTMLDivElement | null>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  
  // Dual draft management
  const [manualDraft, setManualDraft] = useState<FormData | null>(null);
  const [autoDraft, setAutoDraft] = useState<FormData | null>(null);
  const [manualDraftSavedAt, setManualDraftSavedAt] = useState<Date | null>(null);
  const [autoDraftSavedAt, setAutoDraftSavedAt] = useState<Date | null>(null);
  
  const [manuallyEditedFields, setManuallyEditedFields] = useState({
    metaTitle: false,
    metaDescription: false,
    ogTitle: false,
    ogDescription: false,
  });
  const [editorCategories, setEditorCategories] = useState<BlogCategoryDTO[]>(() =>
    [...categories].sort((a, b) => a.title.localeCompare(b.title))
  );
  const availableCategories = useMemo(() => {
    return [...editorCategories].sort((a, b) => a.title.localeCompare(b.title));
  }, [editorCategories]);
  const entityNames = useMemo(() => {
    const singular = (entityLabel ?? 'Page').trim() || 'Page';
    const providedPlural = (entityLabelPlural ?? '').trim();
    const plural = providedPlural || (singular.endsWith('s') ? singular : `${singular}s`);
    return {
      singular,
      plural,
      singularLower: singular.toLowerCase(),
      pluralLower: plural.toLowerCase()
    };
  }, [entityLabel, entityLabelPlural]);
  const slugFallback = useMemo(() => {
    const normalized = entityNames.singularLower
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    return normalized || 'entry';
  }, [entityNames]);
  const normalizedPreviewBase = useMemo(() => {
    const trimmed = previewPathPrefix.trim();
    if (!trimmed || trimmed === '/') return '';
    const withoutTrailing = trimmed.replace(/\/+/g, '/').replace(/\/+$/, '');
    if (!withoutTrailing) return '';
    return withoutTrailing.startsWith('/') ? withoutTrailing : `/${withoutTrailing}`;
  }, [previewPathPrefix]);
  const slugPreview = formData.slug.trim() || `your-${slugFallback}`;
  const searchPreviewPath = useMemo(() => {
    const base = normalizedPreviewBase || '';
    const slugSegment = slugPreview.replace(/^\/+/, '');
    const rawPath = `${base}/${slugSegment}` || '/';
    const normalizedPath = rawPath.replace(/\/+/g, '/');
    return normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  }, [normalizedPreviewBase, slugPreview]);
  const searchPreviewUrl = `yoursite.com${searchPreviewPath}`;
  const previewHref = useMemo(() => {
    if (mode !== 'edit' || !initialPage?.slug) return null;
    const slugValue = initialPage.slug.trim();
    if (!slugValue) return null;
    const base = normalizedPreviewBase || '';
    const rawPath = `${base}/${slugValue}`;
    const normalizedPath = rawPath.replace(/\/+/g, '/');
    return normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  }, [initialPage?.slug, mode, normalizedPreviewBase]);
  const resolvedBackHref = useMemo(() => {
    const trimmed = backHref?.trim();
    if (trimmed) return trimmed;
    if (normalizedEditBasePath) return normalizedEditBasePath;
    return '/admin/pages';
  }, [backHref, normalizedEditBasePath]);
  const handleBackNavigation = useCallback(() => {
    const destination = resolvedBackHref;
    if (destination.startsWith('http')) {
      if (typeof window !== 'undefined') {
        window.location.href = destination;
        return;
      }
    }
    router.push(destination);
  }, [resolvedBackHref, router]);
  const normalizedStorageNamespace = useMemo(() => storageNamespace.replace(/\s+/g, '-'), [storageNamespace]);

  const draftStorageKeys = useMemo(() => {
    const namespace = normalizedStorageNamespace;
    if (mode === 'edit' && initialPage?.id) {
      return {
        manual: `${namespace}-${initialPage.id}-manual-draft`,
        auto: `${namespace}-${initialPage.id}-auto-draft`,
      };
    }
    return {
      manual: `${namespace}-new-manual-draft`,
      auto: `${namespace}-new-auto-draft`,
    };
  }, [mode, initialPage?.id, normalizedStorageNamespace]);
  const manualDraftStorageKey = draftStorageKeys.manual;
  const autoDraftStorageKey = draftStorageKeys.auto;
  const slugInputRef = useRef<HTMLInputElement>(null);
  const skipSlugCommitRef = useRef(false);
  const [, forceToolbarUpdate] = useState(0);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdatedLabel = useMemo(() => {
    if (!initialPage?.updatedAt) return null;
    const formatted = formatDate(initialPage.updatedAt, {
      mode: formatMode,
      timezone: formatTimezone
    });
    return formatted || null;
  }, [initialPage, formatMode, formatTimezone]);

  useEffect(() => {
    setEditorCategories([...categories].sort((a, b) => a.title.localeCompare(b.title)));
  }, [categories]);

  useEffect(() => {
    if (!isEditingSlug) {
      setSlugDraft(formData.slug);
    }
  }, [formData.slug, isEditingSlug]);

  useEffect(() => {
    if (isEditingSlug) {
      slugInputRef.current?.focus();
      slugInputRef.current?.select();
    }
  }, [isEditingSlug]);

  const handleCategoriesPanelChange = useCallback((nextCategories: BlogCategoryDTO[]) => {
    setEditorCategories([...nextCategories].sort((a, b) => a.title.localeCompare(b.title)));
    setFormData((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.filter((id) => nextCategories.some((category) => category.id === id)),
    }));
  }, []);

  // Track client-side mounting to prevent hydration issues
  useEffect(() => {
    setIsMounted(true);
    
    // Cleanup auto-save timeout on unmount
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    if (typeof window === 'undefined') return;

    try {
      const storedManual = localStorage.getItem(manualDraftStorageKey);
      if (storedManual) {
        const parsed = JSON.parse(storedManual);
        if (parsed?.data) {
          setManualDraft(mergeFormData(parsed.data));
          setManualDraftSavedAt(parsed.savedAt ? new Date(parsed.savedAt) : null);
        }
      }
    } catch (error) {
      console.warn('Failed to load manual draft from storage:', error);
    }

    try {
      const storedAuto = localStorage.getItem(autoDraftStorageKey);
      if (storedAuto) {
        const parsed = JSON.parse(storedAuto);
        if (parsed?.data) {
          setAutoDraft(mergeFormData(parsed.data));
          setAutoDraftSavedAt(parsed.savedAt ? new Date(parsed.savedAt) : null);
        }
      }
    } catch (error) {
      console.warn('Failed to load auto draft from storage:', error);
    }
  }, [isMounted, manualDraftStorageKey, autoDraftStorageKey]);

  const headingLevels = [1, 2, 3] as const;
  const textAlignments = ['left', 'center', 'right'] as const;

  const openImageEditor = useCallback((state: ImageEditorState) => {
    setImageEditorState((previous) => {
      if (previous) URL.revokeObjectURL(previous.objectUrl);
      return state;
    });
  }, []);

  const closeImageEditor = useCallback(() => {
    setImageEditorState((previous) => {
      if (previous) URL.revokeObjectURL(previous.objectUrl);
      return null;
    });
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable built-in link/underline so we can configure manually
        link: false,
        underline: false,
        horizontalRule: false, // Disable to avoid duplicate with separate import
        heading: {
          levels: [1, 2, 3, 4, 5, 6]
        }
      }),
      CustomImage.configure({
        HTMLAttributes: {
          class: 'h-auto rounded-lg block editor-image',
          style: 'max-width: 100% !important; width: auto !important;'
        },
        inline: false,
        allowBase64: true,
      }),
      // Allow pasted/inserted iframe embeds
  CustomIframe,
  // Official TipTap YouTube extension to handle YouTube embeds
  Youtube.configure({ 
    HTMLAttributes: { class: 'iframe-wrapper' },
    controls: true,
    nocookie: false
  }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: 'text-violet-600 hover:text-violet-700 underline',
          rel: null,
          target: null
        },
        validate: (href) => {
          if (!href) return false;
          const value = href.trim();
          return (
            /^https?:\/\//i.test(value) ||
            value.startsWith('/') ||
            value.startsWith('#') ||
            value.startsWith('mailto:') ||
            value.startsWith('tel:')
          );
        }
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph', 'image'],
      }),
      Color,
      TextStyle,
      Highlight.configure({
        multicolor: true,
      }),
      Placeholder.configure({
        placeholder: 'Start writing your content here...',
        emptyEditorClass: 'is-editor-empty',
      }),
      HorizontalRule,
    ],
    content: initialPage?.content || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl mx-auto focus:outline-none min-h-[400px] max-w-none prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:my-4 prose-p:leading-relaxed',
      },
      handleDOMEvents: {
        focus: () => {
          // Add placeholder when editor is empty
          if (editor && !editor.isDestroyed && editor.isEmpty) {
            try {
              editor.commands.setContent('<p></p>');
            } catch (error) {
              console.warn('Error setting content on focus:', error);
            }
          }
          return false;
        }
      },
      handlePaste(view, event) {
        try {
          const clipboard = (event instanceof ClipboardEvent)
            ? event.clipboardData
            : (window as Window & { clipboardData?: DataTransfer }).clipboardData;
          if (!clipboard) return false;

          const html = clipboard.getData && clipboard.getData('text/html');
          const text = clipboard.getData && clipboard.getData('text/plain');

          const parser = new DOMParser();

          // If we have HTML clipboard content, parse it. If not, but the
          // plain-text contains an <iframe> snippet, parse that as HTML too
          // (some apps/OSes place raw HTML in text/plain).
          const effectiveHtml = html || (text && text.includes('<iframe') ? text : null);

          if (effectiveHtml) {
            const doc = parser.parseFromString(effectiveHtml, 'text/html');

            // Handle iframe paste
            const iframes = Array.from(doc.querySelectorAll('iframe'));
            if (iframes.length) {
              event.preventDefault();
              for (const iframeEl of iframes) {
                const src = iframeEl.getAttribute('src') || '';
                if (!src) continue;
                // Collect allowed attributes and default alignment/size
                const iframeAttrs: IframeAttrs = {
                  src,
                  sandbox: iframeEl.getAttribute('sandbox') ?? DEFAULT_IFRAME_SANDBOX,
                  'data-align': iframeEl.getAttribute('data-align') || 'center',
                };
                const widthAttr = iframeEl.getAttribute('width');
                const heightAttr = iframeEl.getAttribute('height');
                const parsedWidth = widthAttr ? parseInt(widthAttr, 10) : NaN;
                const parsedHeight = heightAttr ? parseInt(heightAttr, 10) : NaN;

                // Prefer provided width/height; otherwise default to 600x338 (16:9)
                const defaultWidth = 600;
                const width = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : defaultWidth;
                const height = Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : Math.round(width * 9 / 16);
                iframeAttrs.width = width;
                iframeAttrs.height = height;

                const allowAttr = iframeEl.getAttribute('allow');
                if (allowAttr) iframeAttrs.allow = allowAttr;
                const frameborderAttr = iframeEl.getAttribute('frameborder');
                if (frameborderAttr) iframeAttrs.frameborder = frameborderAttr;
                const allowFullscreenAttr = iframeEl.getAttribute('allowfullscreen');
                if (allowFullscreenAttr !== null) iframeAttrs.allowfullscreen = allowFullscreenAttr || 'true';
                const referrerPolicyAttr = iframeEl.getAttribute('referrerpolicy');
                if (referrerPolicyAttr) iframeAttrs.referrerpolicy = referrerPolicyAttr;

                const nodeType = view.state.schema.nodes.iframe;
                if (!nodeType) continue;
                const node = nodeType.create(iframeAttrs);
                const tr = view.state.tr.replaceSelectionWith(node).scrollIntoView();
                view.dispatch(tr);
              }
              return true;
            }

            // Handle pasted <img> tags in HTML
            const imgs = Array.from(doc.querySelectorAll('img'));
            if (imgs.length) {
              event.preventDefault();
              for (const imgEl of imgs) {
                const src = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
                if (!src) continue;
                // Mark pasted images as external so we can disable the in-editor
                // "Edit" path for them (avoids attempting to fetch/cors-edit).
                const imageAttrs: ImageNodeAttrs = {
                  src,
                  'data-align': imgEl.getAttribute('data-align') || 'center',
                  'data-external': 'true',
                };
                const nodeType = view.state.schema.nodes.image;
                if (!nodeType) continue;
                const node = nodeType.create(imageAttrs);
                const tr = view.state.tr.replaceSelectionWith(node).scrollIntoView();
                view.dispatch(tr);
              }
              return true;
            }
          }

          // If plain text looks like an image url, insert it
          if (text && /https?:\/\/.+\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(text.trim())) {
            event.preventDefault();
            const src = text.trim();
            const nodeType = view.state.schema.nodes.image;
            if (nodeType) {
              // Insert pasted plain-text image URLs as external images (not editable in-browser)
              const node = nodeType.create({ src, 'data-align': 'center', 'data-external': 'true' });
              const tr = view.state.tr.replaceSelectionWith(node).scrollIntoView();
              view.dispatch(tr);
              return true;
            }
          }

          // If plain text looks like a YouTube URL, use the YouTube extension
          if (text) {
            const trimmedText = text.trim();
            const youtubeMatch = trimmedText.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|music\.youtube\.com)\/[\w\-&=?.]/);
            if (youtubeMatch) {
              event.preventDefault();
              if (!runYoutubeEmbed(editor, { src: trimmedText })) {
                console.warn('Failed to insert YouTube video from pasted URL: command unavailable');
              }
              return true;
            }
          }

          // Automatically convert plain URLs into link-marked text when pasting single-line content
          if (text && !text.includes('\n')) {
            const urlMatches = Array.from(text.matchAll(/https?:\/\/[^\s]+/gi)) as RegExpMatchArray[];
            if (urlMatches.length) {
              event.preventDefault();
              const { state } = view;
              const { schema } = state;
              const pieces: PMNode[] = [];
              let lastIndex = 0;

              urlMatches.forEach(match => {
                const matchText = match[0] ?? '';
                if (!matchText) {
                  return;
                }
                const startIndex = match.index ?? 0;
                if (startIndex > lastIndex) {
                  pieces.push(schema.text(text.slice(lastIndex, startIndex)));
                }
                const linkMark = schema.marks.link ? schema.marks.link.create({ href: matchText }) : null;
                pieces.push(schema.text(matchText, linkMark ? [linkMark] : undefined));
                lastIndex = startIndex + matchText.length;
              });

              if (lastIndex < text.length) {
                pieces.push(schema.text(text.slice(lastIndex)));
              }

              if (pieces.length) {
                const fragment = Fragment.fromArray(pieces);
                const slice = new Slice(fragment, 0, 0);
                const tr = state.tr.replaceSelection(slice).scrollIntoView();
                view.dispatch(tr);
                return true;
              }
            }
          }
        } catch (err) {
          console.warn('handlePaste failed:', err);
        }
        return false;
      }
    },
    onUpdate: ({ editor }) => {
      try {
        if (!editor || editor.isDestroyed) return;
        setHasUnsavedChanges(true);
        // Trigger auto-save
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }
        autoSaveTimeoutRef.current = setTimeout(() => {
          handleAutoSave();
        }, 5000); // Auto-save after 5 seconds of inactivity
      } catch (error) {
        console.warn('Editor onUpdate error:', error);
      }
    },
  });

  useEffect(() => {
    return () => {
      if (imageEditorState) {
        URL.revokeObjectURL(imageEditorState.objectUrl);
      }
    };
  }, [imageEditorState]);

  // Cleanup editor and timeouts on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      if (editor && !editor.isDestroyed) {
        try {
          editor.destroy();
        } catch (error) {
          console.warn('Error destroying editor:', error);
        }
      }
    };
  }, [editor]);

  useEffect(() => {
    if (!isEditorFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isEditorFullscreen]);

  useEffect(() => {
    if (!editor) return;
    wasFullscreenRef.current = isEditorFullscreen;
  }, [editor, isEditorFullscreen]);

  // DOM-teleport effect: when fullscreen activates, physically move the editor
  // wrapper out of the React tree into the portal container in document.body.
  // This avoids both the CSS stacking-context clipping AND the flushSync error
  // (because EditorContent never remounts). isMounted is a dependency because
  // the portal container ref is only populated after the first client render.
  useEffect(() => {
    const wrapper = editorWrapperRef.current;
    const placeholder = editorPlaceholderRef.current;
    const portal = fullscreenContainerRef.current;
    if (!wrapper || !placeholder || !portal) return;

    if (isEditorFullscreen) {
      // Move wrapper into portal (document.body level — escapes any CSS stacking context)
      portal.appendChild(wrapper);
    } else {
      // Move wrapper back before the placeholder in its original location
      if (wrapper.parentNode !== placeholder.parentNode) {
        placeholder.parentNode?.insertBefore(wrapper, placeholder);
      }
    }
  }, [isEditorFullscreen, isMounted]);

  useEffect(() => {
    if (!isEditorFullscreen) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        toggleEditorFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditorFullscreen, toggleEditorFullscreen]);

  useEffect(() => {
    if (!editor) return;

    const update = () => {
      forceToolbarUpdate((value) => value + 1);
    };

  editor.on('selectionUpdate', update);
  editor.on('update', update);

    return () => {
  editor.off('selectionUpdate', update);
  editor.off('update', update);
    };
  }, [editor]);

  // Image alignment functions - defined after editor is available
  const alignImage = useCallback((alignment: 'left' | 'center' | 'right' | 'float-left' | 'float-right') => {
    if (!editor || editor.isDestroyed) return;
    
    try {
      const { selection } = editor.state;
      if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
        // Update the image node with data-align attribute
        editor.chain().focus().updateAttributes('image', { 
          'data-align': alignment 
        }).run();
      }
    } catch (error) {
      console.warn('Failed to align image:', error);
    }
  }, [editor]);

  const getImageAlignment = useCallback(() => {
    if (!editor || editor.isDestroyed) return null;
    
    try {
      const { selection } = editor.state;
      if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
        return selection.node.attrs['data-align'] || null;
      }
    } catch (error) {
      console.warn('Failed to get image alignment:', error);
    }
    return null;
  }, [editor]);

  useEffect(() => {
    if (initialPage && editor) {
      const pageCategories = (initialPage as SitePageDTO & { categories?: { id: string }[] }).categories;
      const categoryIds = (pageCategories ?? []).map((category) => category.id);

      setFormData(
        mergeFormData({
          title: initialPage.title,
          slug: initialPage.slug,
          description: initialPage.description || '',
          content: initialPage.content,
          published: initialPage.published,
          metaTitle: initialPage.metaTitle || initialPage.title.slice(0, 60),
          metaDescription: initialPage.metaDescription || (initialPage.description || '').slice(0, 160),
          canonicalUrl: initialPage.canonicalUrl || '',
          noIndex: initialPage.noIndex,
          ogTitle: initialPage.ogTitle || initialPage.title.slice(0, 60),
          ogDescription: initialPage.ogDescription || (initialPage.description || '').slice(0, 160),
          ogImage: initialPage.ogImage || '',
          categoryIds,
        })
      );

      // Mark fields as manually edited if they differ from auto-populated values
      setManuallyEditedFields({
        metaTitle: !!(initialPage.metaTitle && initialPage.metaTitle !== initialPage.title),
        metaDescription: !!(initialPage.metaDescription && initialPage.metaDescription !== (initialPage.description || '')),
        ogTitle: !!(initialPage.ogTitle && initialPage.ogTitle !== initialPage.title),
        ogDescription: !!(initialPage.ogDescription && initialPage.ogDescription !== (initialPage.description || '')),
      });
      
      // Use a slight delay to ensure editor is fully initialized
      setTimeout(() => {
        if (!editor || editor.isDestroyed) return;
        
        try {
          const content = initialPage.content || '';
          if (content) {
            editor.commands.setContent(content);
          } else {
            // Set placeholder for empty editor
            editor.commands.setContent('<p></p>');
            editor.commands.focus();
          }
        } catch (error) {
          console.warn('Error setting initial content:', error);
        }
      }, 100);
      
      // Set last saved time for existing pages
      if (mode === 'edit' && initialPage.updatedAt) {
        setLastSaved(new Date(initialPage.updatedAt));
      }
    }
  }, [initialPage, editor, mode]);

  // Sync editor content changes back to form state
  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      try {
        const content = editor.getHTML();
        setFormData(prev => ({ ...prev, content }));
      } catch (error) {
        console.error('Error getting editor content:', error);
        // Continue without updating content to prevent crashes
      }
    };

    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor]);

  const generateSlug = useCallback((title: string) => {
    return normalizeSlug(title);
  }, []);

  const handleAutoSave = useCallback(async () => {
    if (!hasUnsavedChanges || isAutoSaving || isSaving) return;
    if (!formData.title.trim()) return;

    setIsAutoSaving(true);

    try {
      let content = formData.content;
      if (!content && editor) {
        try {
          content = editor.getHTML() || '';
        } catch (error) {
          console.error('Error getting editor content for auto-save:', error);
          content = formData.content || '';
        }
      }
      content = content || '';

      const autoDraftData = {
        ...formData,
        content,
        slug: formData.slug.trim() || formData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30),
      };

      const timestamp = new Date();
      setAutoDraft(autoDraftData);
      setAutoDraftSavedAt(timestamp);
      setHasUnsavedChanges(false);
      setLastSaved(timestamp);

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            autoDraftStorageKey,
            JSON.stringify({ data: autoDraftData, savedAt: timestamp.toISOString() })
          );
        } catch (storageError) {
          console.warn('Failed to persist auto draft:', storageError);
        }
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      setIsAutoSaving(false);
    }
  }, [hasUnsavedChanges, isAutoSaving, isSaving, formData, editor, autoDraftStorageKey]);

  // Helper function to trigger auto-save
  const triggerAutoSave = useCallback(() => {
    setHasUnsavedChanges(true);
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      handleAutoSave();
    }, 5000);
  }, [handleAutoSave]);

  const handleTitleChange = (title: string) => {
    // Limit title to 80 characters
    const limitedTitle = title.slice(0, 80);
    setFormData(prev => ({
      ...prev,
      title: limitedTitle,
      slug: mode === 'create' ? generateSlug(limitedTitle) : prev.slug,
      metaTitle: !manuallyEditedFields.metaTitle ? limitedTitle.slice(0, 60) : prev.metaTitle,
      ogTitle: !manuallyEditedFields.ogTitle ? limitedTitle.slice(0, 60) : prev.ogTitle,
    }));
    triggerAutoSave();
  };

  const handleDescriptionChange = (description: string) => {
    setFormData(prev => ({
      ...prev,
      description,
      metaDescription: !manuallyEditedFields.metaDescription ? description.slice(0, 160) : prev.metaDescription,
      ogDescription: !manuallyEditedFields.ogDescription ? description.slice(0, 160) : prev.ogDescription,
    }));
    triggerAutoSave();
  };

  const adjustDescriptionHeight = useCallback(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, []);

  useEffect(() => {
    // Run after mount and whenever description updates (including restores)
    adjustDescriptionHeight();
  }, [formData.description, adjustDescriptionHeight]);

  useEffect(() => {
    // Measure toolbar height and update on resize
    const measure = () => {
      const h = toolbarRef.current?.getBoundingClientRect().height ?? 0;
      setToolbarHeight(h);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isEditorFullscreen]);

  const handleCategoryToggle = (categoryId: string) => {
    let limited = false;
    setFormData((prev) => {
      const isSelected = prev.categoryIds.includes(categoryId);
      if (!isSelected && prev.categoryIds.length >= CATEGORY_SELECTION_LIMIT) {
        limited = true;
        return prev;
      }
      const nextIds = isSelected
        ? prev.categoryIds.filter((id) => id !== categoryId)
        : [...prev.categoryIds, categoryId];
      return { ...prev, categoryIds: nextIds };
    });
    if (limited) {
      showToast(`Select up to ${CATEGORY_SELECTION_LIMIT} categories`, 'info');
      return;
    }
    triggerAutoSave();
  };

  const openSlugEditor = useCallback(() => {
    setSlugDraft(formData.slug);
    setIsEditingSlug(true);
  }, [formData.slug]);

  const handleSlugDraftChange = (value: string) => {
    const sanitized = value
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/_+/g, '_');
    // Don't trim leading/trailing while editing - allow user to type freely
    setSlugDraft(sanitized.slice(0, MAX_SLUG_LENGTH));
  };

  const commitSlug = useCallback(() => {
    setFormData((prev) => {
      const base = slugDraft || prev.slug || prev.title || slugFallback;
      const normalized = normalizeSlug(base);
      return { ...prev, slug: normalized };
    });
    setIsEditingSlug(false);
    skipSlugCommitRef.current = false;
    triggerAutoSave();
  }, [slugDraft, slugFallback, triggerAutoSave]);

  const handleSlugBlur = () => {
    if (skipSlugCommitRef.current) {
      skipSlugCommitRef.current = false;
      return;
    }
    // Trim leading/trailing hyphens and underscores when losing focus
    const trimmed = slugDraft.replace(/(^[-_]+|[-_]+$)/g, '');
    if (trimmed !== slugDraft) {
      setSlugDraft(trimmed);
    }
    commitSlug();
  };

  const handleSlugKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      // Trim leading/trailing hyphens and underscores on Enter
      const trimmed = slugDraft.replace(/(^[-_]+|[-_]+$)/g, '');
      if (trimmed !== slugDraft) {
        setSlugDraft(trimmed);
      }
      commitSlug();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      skipSlugCommitRef.current = true;
      setIsEditingSlug(false);
      setSlugDraft(formData.slug);
    }
  };

  const uploadImageFile = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      // Use the same system as logo upload for AWS/local fallback
      const response = await fetch('/api/admin/file/upload', {
        method: 'POST',
        headers: {
          'x-filename': file.name,
          'x-mimetype': file.type,
          'x-upload-scope': uploadScope
        },
        body: file
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const { url } = await response.json();
      return url;
    } catch (error) {
      console.error('Upload error:', error);
      showToast('Failed to upload image', 'error');
      throw error;
    } finally {
      setIsUploading(false);
    }
  }, [uploadScope]);

  // processImageFile removed — not currently referenced in the editor flow.

  const addImage = useCallback(async () => {
    setShowImagePickerModal(true);
  }, []);

  const handleImageSelected = useCallback(async (imageUrl: string) => {
    if (imagePickerTarget === 'editor') {
      if (!editor) return;
      
      try {
        // Insert the selected image directly into the editor. Cast to a
        // loose options shape so we can include our `data-align` attribute
        // which TipTap will store on the node.
  const imageInsertOptions: ImageNodeAttrs = { src: imageUrl, 'data-align': 'center' };
  editor.chain().focus().setImage(imageInsertOptions).run();
      } catch (error) {
        console.error('Failed to insert image:', error);
        showToast('Failed to insert image', 'error');
      }
    } else if (imagePickerTarget === 'socialImage') {
      // Update the social image URL
      setFormData((prev) => ({ ...prev, ogImage: imageUrl }));
      triggerAutoSave();
    }
    
    setShowImagePickerModal(false);
    // Reset target back to editor for next use
    setImagePickerTarget('editor');
  }, [editor, imagePickerTarget, triggerAutoSave]);

  const editSelectedImage = useCallback(async () => {
    if (!editor || editor.isDestroyed) return;
    
    const attrs = editor.getAttributes('image');
    const src = typeof attrs.src === 'string' ? attrs.src : '';
    if (!src) {
      showToast('Select an image to edit first', 'error');
      return;
    }

    const selection = editor.state.selection;
    const nodePos = selection instanceof NodeSelection ? selection.from : selection.from;

    try {
      setIsPreparingImage(true);
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error('Failed to load image');
      }
      const blob = await response.blob();
      const mime = blob.type || inferMimeFromName(src);
      if (!mime || !canEditImageType(mime)) {
        showToast('Only PNG, JPEG, or WEBP images can be edited in the browser.', 'info');
        return;
      }

      const filename = guessFilenameFromUrl(src);
      const objectUrl = URL.createObjectURL(blob);
      openImageEditor({
        mode: 'edit',
        objectUrl,
        filename,
        mimeType: mime,
        nodePos,
      });
    } catch (error) {
      console.error('Image edit fetch error', error);
      showToast('Unable to load image for editing', 'error');
    } finally {
      setIsPreparingImage(false);
    }
  }, [editor, openImageEditor]);

  const handleImageEditorConfirm = useCallback(async (result: { blob: Blob; width: number; height: number; mimeType: string; filename: string }) => {
    if (!imageEditorState) return;

    try {
      const finalMime = result.mimeType || imageEditorState.mimeType;
      const finalName = ensureExtensionForMime(imageEditorState.filename, finalMime);
      const file = new File([result.blob], finalName, { type: finalMime });
      const url = await uploadImageFile(file);

      // Set appropriate sizing to prevent overflow while maintaining quality
      const containerWidth = 800; // Typical editor container width
      const maxWidth = Math.min(result.width, containerWidth);
      const displayHeight = Math.round((maxWidth * result.height) / Math.max(1, result.width));

      // Insert explicit width/height attributes (numbers) so the
      // CustomImage node and its NodeView can apply sizing consistently.
      type TiptapImageOptions = { src: string; width?: number; height?: number; [key: string]: string | number | undefined };
      // Preserve existing alignment when editing an image; otherwise default to center
      const existingAttrs = editor?.getAttributes('image') ?? {};
      const existingAlign = typeof existingAttrs['data-align'] === 'string' ? existingAttrs['data-align'] : undefined;

      const imageAttrs: TiptapImageOptions = {
        src: url,
        width: Math.round(maxWidth),
        height: displayHeight,
        'data-original-width': result.width.toString(),
        'data-original-height': result.height.toString(),
        'data-align': existingAlign ?? 'center',
      };

      if (imageEditorState.mode === 'edit' && typeof imageEditorState.nodePos === 'number') {
  // updateAttributes accepts a generic attributes object. Our
  // `imageAttrs` is typed as a simple string|number map which satisfies
  // the call without using `any`.
  editor?.chain().focus().setNodeSelection(imageEditorState.nodePos).updateAttributes('image', imageAttrs).run();
      } else if (typeof imageEditorState.onComplete === 'function') {
        imageEditorState.onComplete(url);
      } else {
  editor?.chain().focus().setImage(imageAttrs).run();
      }

      closeImageEditor();
    } catch (error) {
      if (error instanceof Error) {
        console.error('Image editor confirm error', error);
      }
      // uploadImageFile already showed a toast; add fallback for unexpected errors.
      if (!(error instanceof Error)) {
        showToast('Unable to save edited image', 'error');
      }
    }
  }, [editor, imageEditorState, uploadImageFile, closeImageEditor]);

  const setLink = useCallback(() => {
    const attrs = editor?.getAttributes('link') ?? {};
    const previousUrl = typeof attrs.href === 'string' ? attrs.href : '';
    setLinkUrl(previousUrl);
    setLinkOpensInNewTab(attrs.target === '_blank');
    setShowLinkModal(true);
  }, [editor]);

  const handleLinkSubmit = () => {
    const trimmed = linkUrl.trim();
    if (trimmed === '') {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    } else if (!isValidLinkHref(trimmed)) {
      showToast('Enter a valid URL, relative path, mailto:, or tel: link', 'error');
      return;
    } else {
      editor
        ?.chain()
        .focus()
        .extendMarkRange('link')
        .setLink({
          href: trimmed,
          target: linkOpensInNewTab ? '_blank' : undefined,
          rel: linkOpensInNewTab ? 'noopener noreferrer' : undefined
        })
        .run();
    }
    setShowLinkModal(false);
    setLinkUrl('');
    setLinkOpensInNewTab(false);
  };
  const handleSave = async (saveType: 'draft' | 'publish' = 'draft') => {
    if (!formData.title.trim()) {
      showToast('Please enter a title', 'error');
      return;
    }

    if (!formData.slug.trim()) {
      showToast('Please enter a slug', 'error');
      return;
    }

    // Hide bubble menus immediately to prevent coordsAtPos errors
    setHideBubbleMenus(true);
    
    // Blur editor to close any active menus
    if (editor && !editor.isDestroyed) {
      try {
        editor.commands.blur();
      } catch (error) {
        console.warn('Error blurring editor:', error);
      }
    }

    // Safely get content from editor with fallback
    let content = formData.content;
    if (!content && editor) {
      try {
        content = editor.getHTML() || '';
      } catch (error) {
        console.error('Error getting editor content:', error);
        content = formData.content || '';
      }
    }
    content = content || '';

    setIsSaving(true);
    try {
      const manualDraftData: FormData = {
        ...formData,
        slug: formData.slug.trim(),
        content,
        published: saveType === 'publish' || formData.published,
      };
      const { categoryIds, ...restManualDraft } = manualDraftData;
      const payload = {
        ...restManualDraft,
        ...(enableCategories
          ? { categoryIds: categoryIds.slice(0, CATEGORY_SELECTION_LIMIT) }
          : {})
      };

      // First, create manual draft
      const manualTimestamp = new Date();
      setManualDraft(manualDraftData);
      setManualDraftSavedAt(manualTimestamp);

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            manualDraftStorageKey,
            JSON.stringify({ data: manualDraftData, savedAt: manualTimestamp.toISOString() })
          );
        } catch (storageError) {
          console.warn('Failed to persist manual draft:', storageError);
        }
      }

      // If saving as draft for a published page, don't update the live version
      if (saveType === 'draft' && formData.published && mode === 'edit') {
        setHasUnsavedChanges(false);
        setLastSaved(manualTimestamp);
        showToast('Draft saved successfully', 'success');
        return;
      }

      // Otherwise, save to API
      const url = mode === 'create' 
        ? normalizedApiBasePath
        : `${normalizedApiBasePath}/${initialPage?.id}`;
      
      const method = mode === 'create' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const genericErrorMessage = `Failed to save ${entityNames.singularLower}`;
        const error = await response.json().catch(() => ({ error: genericErrorMessage }));
        console.error('API validation error:', error);
        throw new Error(error.error || error.message || genericErrorMessage);
      }

      // parse response body for created/updated page data
      let responseBody: unknown = null;
      try {
        responseBody = await response.json();
      } catch {
        // ignore parse errors; some endpoints may not return JSON
        responseBody = null;
      }

      setHasUnsavedChanges(false);
      setLastSaved(new Date());

      if (saveType === 'publish' || mode === 'create') {
        setManualDraft(null);
        setManualDraftSavedAt(null);
        setAutoDraft(null);
        setAutoDraftSavedAt(null);

        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem(manualDraftStorageKey);
            localStorage.removeItem(autoDraftStorageKey);
          } catch (storageError) {
            console.warn('Failed to clear stored drafts:', storageError);
          }
        }
      }
      
      const successMessage = saveType === 'publish'
        ? (mode === 'create'
            ? `${entityNames.singular} published successfully`
            : `${entityNames.singular} updated and published successfully`)
        : (mode === 'create'
            ? `${entityNames.singular} created successfully`
            : `${entityNames.singular} updated successfully`);
      
      showToast(successMessage, 'success');
      
      // Trigger storage event to notify pages list to refresh
      if (typeof window !== 'undefined') {
        try {
          const eventKey = `${normalizedStorageNamespace}-action-${Date.now()}`;
          localStorage.setItem(eventKey, JSON.stringify({
            action: saveType,
            pageId: initialPage?.id || 'new',
            timestamp: Date.now()
          }));
          // Clean up the temporary event key after a short delay
          setTimeout(() => {
            localStorage.removeItem(eventKey);
          }, 1000);
        } catch (storageError) {
          console.warn('Failed to trigger refresh event:', storageError);
        }
      }
      
      if (saveType === 'publish' || mode === 'create') {
        // Instead of redirecting to the pages list, keep the user in the
        // editor. For newly created pages, replace the URL to the new
        // edit route so the editor is now editing the persisted page.
  type PageLike = { id?: string; content?: string };
  const pageData = (responseBody as { page?: PageLike })?.page ?? (responseBody as PageLike | null);

        setTimeout(() => {
          try {
            if (mode === 'create' && pageData?.id) {
              // Replace the URL to the edit route for the new page. This
              // updates the address bar and lets Next.js load the correct
              // route/component state without sending the user to the list.
              router.replace(`${normalizedEditBasePath}/${pageData.id}/edit`);
            } else if (pageData?.content && editor && !editor.isDestroyed) {
              // For updates/publishes, refresh the editor content from the
              // server to ensure the persisted version matches what's shown.
              editor.commands.setContent(pageData.content);
            }
          } catch (err) {
            console.warn('Failed to refresh editor after save:', err);
          } finally {
            // Restore bubble menus after cleanup
            setHideBubbleMenus(false);
          }
        }, 100);
      } else {
        // Restore bubble menus after a short delay if not navigating away
        setTimeout(() => {
          setHideBubbleMenus(false);
        }, 100);
      }
    } catch (error) {
      console.error('Save error:', error);
      const fallbackMessage = `Failed to save ${entityNames.singularLower}`;
      showToast(
        error instanceof Error ? error.message : fallbackMessage,
        'error'
      );
      // Restore bubble menus on error
      setHideBubbleMenus(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Draft restoration functions
  const restoreFromManualDraft = () => {
    if (!manualDraft) return;
    setFormData(mergeFormData(manualDraft));
    if (editor && !editor.isDestroyed && manualDraft.content) {
      try {
        editor.commands.setContent(manualDraft.content);
      } catch (error) {
        console.warn('Error restoring manual draft:', error);
      }
    }
    setHasUnsavedChanges(true);
    showToast('Manual draft restored', 'success');
  };

  const restoreFromAutoDraft = () => {
    if (!autoDraft) return;
    setFormData(mergeFormData(autoDraft));
    if (editor && !editor.isDestroyed && autoDraft.content) {
      try {
        editor.commands.setContent(autoDraft.content);
      } catch (error) {
        console.warn('Error restoring auto draft:', error);
      }
    }
    setHasUnsavedChanges(true);
    showToast('Auto draft restored', 'success');
  };

  if (!editor) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-violet-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <DashboardPageHeader
        eyebrow={mode === 'create' ? `Create ${entityNames.singularLower}` : `Edit ${entityNames.singularLower}`}
        eyebrowIcon={<FontAwesomeIcon icon={mode === 'create' ? faPlus : faPenToSquare} />}
        title={
          mode === 'create'
            ? `Create a new ${entityNames.singularLower}`
            : `Edit ${initialPage?.title ?? entityNames.singularLower}`
        }
        description=""
        actionsAlign="right"
        actions={
          <>
            <button
              type="button"
              onClick={handleBackNavigation}
              className="inline-flex items-center gap-2 rounded-lg border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.55))] bg-[color:rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.55))] px-4 py-2 text-sm font-medium text-[color:rgb(var(--text-secondary))] transition-colors hover:bg-[color:rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.70))] hover:text-[color:rgb(var(--text-primary))]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to {entityNames.pluralLower}
            </button>

            {mode === 'edit' && formData.published && previewHref ? (
              <NextLink
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.25))] bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.10))] px-4 py-2 text-sm font-medium text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.92))] transition-colors hover:bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.16))]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                Preview {entityNames.singular}
              </NextLink>
            ) : null}
          </>
        }
      >
        {lastUpdatedLabel ? (
          <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Last updated {lastUpdatedLabel}
          </p>
        ) : null}
      </DashboardPageHeader>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2.35fr)_minmax(320px,0.8fr)]">
        <div className="space-y-6">
          <div className={dashboardPanelClass('space-y-5')}>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                  {entityNames.singular} title
                </label> <span className="text-xs text-neutral-500 dark:text-neutral-400">{formData.title.length}/80 characters</span>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder={`Enter ${entityNames.singularLower} title...`}
                  maxLength={80}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-lg font-medium text-neutral-900 placeholder-neutral-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                  <span>Slug</span>
                  {isEditingSlug ? (
                    <span className="inline-flex h-7 items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900">
                      <span className="text-neutral-400 dark:text-neutral-500">/</span>
                      <input
                        ref={slugInputRef}
                        value={slugDraft}
                        onChange={(event) => handleSlugDraftChange(event.target.value)}
                        onBlur={handleSlugBlur}
                        onKeyDown={handleSlugKeyDown}
                        maxLength={MAX_SLUG_LENGTH}
                        aria-label="Edit URL slug"
                        className="h-full w-64 min-w-[12rem] flex-1 bg-transparent px-1 text-sm text-neutral-900 outline-none placeholder-neutral-400 dark:text-neutral-100"
                      />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={openSlugEditor}
                      className="inline-flex h-7 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-violet-400 hover:text-violet-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-violet-500 dark:hover:text-violet-300"
                    >
                      <code className="font-mono text-[11px] text-neutral-900 dark:text-neutral-100">/{slugPreview}</code>
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                      <span className="sr-only">Edit URL slug</span>
                    </button>
                  )}
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">Max 30 characters. Use letters, numbers, hyphen, or underscore.</span>
                </div>
              </div>

              {/* Description moved to right panel */}
            </div>
          </div>

          {/* Categories moved to right panel */}

          <div className="space-y-3">
            {!isEditorFullscreen && (
              <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-center sm:justify-between sm:px-0">
                <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Content</label>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">Rich text with semantic HTML</span>
              </div>
            )}

            {/* Placeholder keeps layout space while editor is teleported */}
            <div ref={editorPlaceholderRef} className={isEditorFullscreen ? 'min-h-[520px]' : ''} />
            <div
              ref={editorWrapperRef}
              className={clsx(
                'relative flex flex-col bg-white shadow-sm dark:bg-neutral-900',
                isEditorFullscreen
                  ? 'flex-col h-full w-full'
                  : 'rounded-xl border border-neutral-200 dark:border-neutral-700 min-h-[520px]'
              )}
            >
              {editor ? (
                <>
                  {/* Sticky toolbar inside editor */}
                  <div
                    ref={toolbarRef}
                    className={clsx(
                      'sticky z-10 border-b border-neutral-200 bg-white/95 p-4 backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/95',
                      isEditorFullscreen ? 'top-0 shadow-sm' : ''
                    )}
                    style={!isEditorFullscreen ? { top: 'var(--sticky-header-height, 0px)' } : undefined}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1 border-r border-neutral-200 pr-2 dark:border-neutral-700">
                          <button
                            type="button"
                            onClick={() => {
                              if (!editor) return;
                              editor.chain().focus().toggleBold().run();
                            }}
                            className={`rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                              editor?.isActive('bold')
                                ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                                : ''
                            }`}
                            title="Bold"
                          >
                            <span className="text-sm font-bold">B</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!editor) return;
                              editor.chain().focus().toggleItalic().run();
                            }}
                            className={`rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                              editor?.isActive('italic')
                                ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                                : ''
                            }`}
                            title="Italic"
                          >
                            <span className="text-sm font-medium italic">I</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!editor) return;
                              editor.chain().focus().toggleUnderline().run();
                            }}
                            className={`rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                              editor?.isActive('underline')
                                ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                                : ''
                            }`}
                            title="Underline"
                          >
                            <span className="text-sm font-medium underline">U</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!editor) return;
                              editor.chain().focus().toggleStrike().run();
                            }}
                            className={`rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                              editor?.isActive('strike')
                                ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                                : ''
                            }`}
                            title="Strikethrough"
                          >
                            <span className="text-sm font-medium line-through">S</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-1 border-r border-neutral-200 pr-2 dark:border-neutral-700">
                          <button
                            type="button"
                            onClick={() => {
                              if (!editor) return;
                              editor.chain().focus().undo().run();
                            }}
                            disabled={!editor?.can().undo()}
                            className={`rounded p-2 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800`}
                            title="Undo (Ctrl+Z)"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!editor) return;
                              editor.chain().focus().redo().run();
                            }}
                            disabled={!editor?.can().redo()}
                            className={`rounded p-2 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800`}
                            title="Redo (Ctrl+Y)"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
                            </svg>
                          </button>
                        </div>

                        <div className="flex items-center gap-1 border-r border-neutral-200 pr-2 dark:border-neutral-700">
                          {headingLevels.map((level) => (
                            <button
                              key={level}
                              type="button"
                              onClick={() => {
                                if (!editor) return;
                                editor.chain().focus().toggleHeading({ level }).run();
                              }}
                              className={`rounded px-3 py-2 text-sm font-medium transition hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                                editor?.isActive('heading', { level })
                                  ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                                  : ''
                              }`}
                              title={`Heading ${level}`}
                            >
                              H{level}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-1 border-r border-neutral-200 pr-2 dark:border-neutral-700">
                          <button
                            type="button"
                            onClick={() => {
                              if (!editor) return;
                              editor.chain().focus().toggleBulletList().run();
                            }}
                            className={`rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                              editor?.isActive('bulletList')
                                ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                                : ''
                            }`}
                            title="Bullet list"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!editor) return;
                              editor.chain().focus().toggleOrderedList().run();
                            }}
                            className={`rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                              editor?.isActive('orderedList')
                                ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                                : ''
                            }`}
                            title="Numbered list"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5V7a2 2 0 00-2-2H5a2 2 0 00-2 2v14l3.5-2 3.5 2z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!editor) return;
                              editor.chain().focus().toggleBlockquote().run();
                            }}
                            className={`rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                              editor?.isActive('blockquote')
                                ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                                : ''
                            }`}
                            title="Quote"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!editor) return;
                              editor.chain().focus().toggleCodeBlock().run();
                            }}
                            className={`rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                              editor?.isActive('codeBlock')
                                ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                                : ''
                            }`}
                            title="Code block"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!editor) return;
                              editor.chain().focus().setHorizontalRule().run();
                            }}
                            className="rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                            title="Horizontal line"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                            </svg>
                          </button>
                        </div>

                        <div className="flex items-center gap-1 border-r border-neutral-200 pr-2 dark:border-neutral-700">
                          <button
                            type="button"
                            onClick={setLink}
                            className={`rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                              editor?.isActive('link') ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' : ''
                            }`}
                            title="Add link"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={addImage}
                            disabled={isUploading || isPreparingImage}
                            className="rounded p-2 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800"
                            title="Add image"
                          >
                            {isUploading || isPreparingImage ? (
                              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowEmbedModal(true)}
                            className="ml-1 rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                            title="Insert embed"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 11l3 2 5-4" />
                            </svg>
                          </button>
                        </div>

                        <div className="flex items-center gap-1 border-r border-neutral-200 pr-2 dark:border-neutral-700">
                          <button
                            type="button"
                            onClick={() => {
                              if (!editor) return;
                              editor.chain().focus().unsetAllMarks().run();
                            }}
                            className="rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                            title="Clear formatting"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!editor) return;
                              editor.chain().focus().clearNodes().run();
                            }}
                            className="rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                            title="Clear block formatting"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5V7a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2z" />
                            </svg>
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          {textAlignments.map((position) => (
                            <button
                              key={position}
                              type="button"
                              onClick={() => editor.chain().focus().setTextAlign(position).run()}
                              className={`rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                                editor.isActive({ textAlign: position })
                                  ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                                  : ''
                              }`}
                              title={`Align ${position}`}
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                {position === 'left' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />}
                                {position === 'center' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M8 12h8m-8 6h8" />}
                                {position === 'right' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M12 12h8M4 18h16" />}
                              </svg>
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-1 border-l border-neutral-200 pl-2 dark:border-neutral-700">
                          <button
                            type="button"
                            onClick={() => toggleEditorFullscreen()}
                            aria-pressed={isEditorFullscreen}
                            className="inline-flex items-center gap-2 rounded p-2 transition hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-white dark:hover:bg-neutral-800 dark:focus:ring-offset-neutral-900"
                            title={isEditorFullscreen ? 'Exit full screen' : 'Enter full screen'}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              {isEditorFullscreen ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H5v4M19 9V5h-4M9 19H5v-4M19 15v4h-4" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 9V5a1 1 0 011-1h4M20 15v4a1 1 0 01-1 1h-4M15 4h4a1 1 0 011 1v4M9 20H5a1 1 0 01-1-1v-4" />
                              )}
                            </svg>
                          </button>
                        </div>

                        {isEditorFullscreen && (
                          <div className="flex items-center gap-1 border-l border-neutral-200 pl-2 dark:border-neutral-700">
                            <button
                              type="button"
                              onClick={() => toggleEditorFullscreen(false)}
                              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-white dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:focus:ring-offset-neutral-900"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H5v4M19 9V5h-4M9 19H5v-4M19 15v4h-4" />
                              </svg>
                              <span className="text-xs font-medium">Exit full screen</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Editor content area */}
                  <div
                    className={clsx(
                      'flex-1 overflow-y-auto',
                      isEditorFullscreen ? 'px-8 pb-8 pt-6' : 'p-4'
                    )}
                    style={{ minHeight: isEditorFullscreen ? undefined : '400px' }}
                  >
                    <EditorContent
                      editor={editor}
                      onClick={(event) => {
                        if (!editor || editor.isDestroyed) return;
                        const target = event.target as HTMLElement | null;
                        const linkElement = target?.closest('a');
                        if (!linkElement) return;

                        try {
                          editor.chain().focus().extendMarkRange('link').run();
                        } catch (error) {
                          console.warn('Failed to select link on click:', error);
                        }
                      }}
                      className="prose prose-sm sm:prose lg:prose-lg xl:prose-xl mx-auto max-w-none focus:outline-none prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:my-4 prose-p:leading-relaxed prose-img:mx-auto prose-img:rounded-lg prose-img:shadow-sm editor-content"
                    />
                  </div>
                  {!isSaving && !hideBubbleMenus && editor && !editor.isDestroyed && (
                      <BubbleMenu
                        editor={editor}
                        options={{ placement: 'top' }}
                      shouldShow={(props: { editor: TiptapEditor; state: EditorState }) => {
                        try {
                          const { editor: menuEditor, state } = props;
                          if (!menuEditor || !state || menuEditor.isDestroyed) return false;
                          
                          // Additional safety check for DOM availability and docView
                          if (!menuEditor.view || !menuEditor.view.dom || !menuEditor.view.dom.isConnected) {
                            return false;
                          }
                          
                          // Check if docView is available (needed for coordsAtPos)
                          // Use a safe unknown cast instead of `any` to avoid
                          // lint complaints while still checking for docView.
                          if (!((menuEditor.view as unknown as { docView?: unknown }).docView)) {
                            return false;
                          }

                          if (menuEditor.isActive('link')) {
                            return true;
                          }

                          const { selection } = state;
                          if (selection instanceof TextSelection) {
                            const marksAtFrom = selection.$from.marks();
                            const marksAtTo = selection.$to.marks();
                            const hasLinkMark = [...marksAtFrom, ...marksAtTo].some(mark => mark.type.name === 'link');
                            if (hasLinkMark) {
                              return true;
                            }

                            const storedMarks = state.storedMarks ?? [];
                            if (storedMarks.some(mark => mark.type.name === 'link')) {
                              return true;
                            }

                            const nodeBefore = selection.$from.nodeBefore;
                            if (nodeBefore?.marks?.some(mark => mark.type.name === 'link')) {
                              return true;
                            }

                            const nodeAfter = selection.$from.nodeAfter;
                            if (nodeAfter?.marks?.some(mark => mark.type.name === 'link')) {
                              return true;
                            }
                          }

                          return false;
                        } catch (error) {
                          console.warn('BubbleMenu shouldShow error:', error);
                          return false;
                        }
                      }}
                    >
                      <div
                        className="flex overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-700 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 z-50"
                        style={{ transform: toolbarHeight && !isEditorFullscreen ? `translateY(${toolbarHeight + 8}px)` : undefined }}
                      >
                        <button
                          type="button"
                          onClick={() => setLink()}
                          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition hover:bg-neutral-100 dark:hover:bg-neutral-700"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          Edit link
                        </button>
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
                          className="inline-flex items-center gap-2 border-l border-neutral-200 px-3 py-2 text-xs font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-700"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 7l-10 10m3-10h7a2 2 0 012 2v7" />
                          </svg>
                          Unlink
                        </button>
                      </div>
                    </BubbleMenu>
                  )}

                  {!isSaving && !hideBubbleMenus && editor && !editor.isDestroyed && (
                      <BubbleMenu
                        editor={editor}
                        options={{ placement: 'top' }}
                      shouldShow={(props: { editor: TiptapEditor; state: EditorState }) => {
                      try {
                        if (!props.editor || !props.state || props.editor.isDestroyed) return false;
                        
                        // Additional safety check for DOM availability and docView
                        if (!props.editor.view || !props.editor.view.dom || !props.editor.view.dom.isConnected) {
                          return false;
                        }
                        
                        // Check if docView is available (needed for coordsAtPos)
                        if (!((props.editor.view as unknown as { docView?: unknown }).docView)) {
                          return false;
                        }
                        
                        const selection = props.state.selection;
                        if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
                          return true;
                        }
                        return props.editor.isActive('image');
                      } catch (error) {
                        console.warn('BubbleMenu shouldShow error:', error);
                        return false;
                      }
                    }}
                  >
                    <div
                      className="flex overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-700 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 z-50"
                      style={{ transform: toolbarHeight && !isEditorFullscreen ? `translateY(${toolbarHeight + 8}px)` : undefined }}
                    >
                      {(() => {
                        const selectedAttrs = editor?.getAttributes('image') ?? {};
                        const isSelectedExternal = selectedAttrs?.['data-external'] === 'true';
                        const editDisabled = isUploading || isPreparingImage || isSelectedExternal;
                        const titleText = isSelectedExternal ? 'External image — editing disabled' : 'Edit image';

                        return (
                          <button
                            type="button"
                            onClick={() => void editSelectedImage()}
                            disabled={editDisabled}
                            aria-disabled={editDisabled}
                            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition hover:bg-neutral-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-neutral-700"
                            title={titleText}
                            aria-label={titleText}
                          >
                            {isPreparingImage ? (
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V2C5.373 2 0 7.373 0 14h4z" />
                              </svg>
                            ) : isSelectedExternal ? (
                              // Show a small globe/info icon to indicate external source
                              <svg className="h-4 w-4 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2a10 10 0 100 20 10 10 0 000-20z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6l3 3" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            )}
                            {isSelectedExternal ? 'External' : 'Edit'}
                          </button>
                        );
                      })()}
                      <div className="border-l border-neutral-200 dark:border-neutral-700" />
                      <button
                        type="button"
                        onClick={() => alignImage('left')}
                        className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
                          getImageAlignment() === 'left' ? 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300' : ''
                        }`}
                        title="Align left"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h18M3 9h12M3 15h18M3 21h12" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => alignImage('center')}
                        className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
                          getImageAlignment() === 'center' ? 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300' : ''
                        }`}
                        title="Align center"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h18M7 9h10M3 15h18M7 21h10" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => alignImage('right')}
                        className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
                          getImageAlignment() === 'right' ? 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300' : ''
                        }`}
                        title="Align right"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h18M9 9h12M3 15h18M9 21h12" />
                        </svg>
                      </button>
                      <div className="border-l border-neutral-200 dark:border-neutral-700" />
                      <button
                        type="button"
                        onClick={() => alignImage('float-left')}
                        className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
                          getImageAlignment() === 'float-left' ? 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300' : ''
                        }`}
                        title="Float left (wrap text)"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h7M4 10h7M4 14h7M4 18h7M14 8h6M14 12h6M14 16h6" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => alignImage('float-right')}
                        className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
                          getImageAlignment() === 'float-right' ? 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300' : ''
                        }`}
                        title="Float right (wrap text)"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 6h6M14 10h6M14 14h6M14 18h6M4 8h7M4 12h7M4 16h7" />
                        </svg>
                      </button>
                      <div className="border-l border-neutral-200 dark:border-neutral-700" />
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().deleteSelection().run()}
                        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-neutral-700 dark:hover:text-red-400"
                        title="Remove image"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-3h4m-6 3h8M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" />
                        </svg>
                        Remove
                      </button>
                    </div>
                  </BubbleMenu>
                  )}
                </>
              ) : null}
            </div>
          </div>

          {/* SEO settings */}
          <div className={dashboardPanelClass('space-y-4')}>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              SEO settings
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Meta title</label>
                <input
                  type="text"
                  value={formData.metaTitle}
                  onChange={(e) => {
                    const value = e.target.value.slice(0, 60);
                    setFormData((prev) => ({ ...prev, metaTitle: value }));
                    setManuallyEditedFields(prev => ({ ...prev, metaTitle: true }));
                    triggerAutoSave();
                  }}
                  placeholder="SEO title for search engines"
                  maxLength={60}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{formData.metaTitle.length}/60 characters</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Meta description</label>
                <textarea
                  value={formData.metaDescription}
                  onChange={(e) => {
                    const value = e.target.value.slice(0, 160);
                    setFormData((prev) => ({ ...prev, metaDescription: value }));
                    setManuallyEditedFields(prev => ({ ...prev, metaDescription: true }));
                    triggerAutoSave();
                  }}
                  placeholder="Brief description for search results"
                  rows={3}
                  maxLength={160}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{formData.metaDescription.length}/160 characters</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Canonical URL</label>
                <input
                  type="url"
                  value={formData.canonicalUrl}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, canonicalUrl: e.target.value }));
                    triggerAutoSave();
                  }}
                  placeholder="https://example.com/canonical-url"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
                <input
                  type="checkbox"
                  checked={formData.noIndex}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, noIndex: e.target.checked }));
                    triggerAutoSave();
                  }}
                  className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500"
                />
                Prevent search engines from indexing this {entityNames.singularLower}
              </label>
            </div>
          </div>

          {/* Search preview */}
          <div className={dashboardMutedPanelClass('space-y-4')}>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              <svg className="h-5 w-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Search preview
            </h3>
            <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4 text-sm dark:border-neutral-700 dark:bg-neutral-900">
              <div className="text-blue-600 dark:text-blue-400">
                {formData.metaTitle || formData.title || `${entityNames.singular} title`}
              </div>
              <div className="text-xs text-emerald-600 dark:text-emerald-400">{searchPreviewUrl}</div>
              <div className="text-xs text-neutral-600 dark:text-neutral-400">
                {formData.metaDescription || formData.description || `${entityNames.singular} description will appear here in search results...`}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className={dashboardPanelClass('p-4')}>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFormData((prev) => ({ ...prev, published: !prev.published }));
                  triggerAutoSave();
                }}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition sm:text-sm ${
                  formData.published
                    ? 'bg-blue-600 hover:bg-blue-500 dark:hover:bg-blue-500/90 [&]:!text-white [&_*]:!text-white'
                    : 'bg-neutral-200 text-neutral-800 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                {formData.published ? (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Published
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L12 12l4.242-4.242M9.878 9.878L7.5 7.5m4.242 4.242L9.878 14.12" />
                    </svg>
                    Draft
                  </>
                )}
              </button>
              
              {/* Save Draft Button */}
              <button
                type="button"
                onClick={() => handleSave('draft')}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-neutral-200 px-3 py-2 text-xs font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 dark:focus:ring-neutral-500 dark:focus:ring-offset-neutral-900 sm:text-sm"
              >
                {isSaving ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V9a2 2 0 00-2-2H9a2 2 0 00-2 2v.01" />
                    </svg>
                    Save Draft
                  </>
                )}
              </button>
              
              {/* Publish Button */}
              <button
                type="button"
                onClick={() => handleSave('publish')}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-violet-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-neutral-900 sm:text-sm"
              >
                {isSaving ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Publishing
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    {formData.published ? 'Update' : 'Publish'}
                  </>
                )}
              </button>
            </div>
          </div>
          
          {/* Draft Restoration */}
          {(manualDraft || autoDraft) && (
            <div className={dashboardPanelClass('space-y-4')}>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Draft Management
              </h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Restore previous versions if you made a mistake
              </p>
              
              <div className="grid gap-3 sm:grid-cols-1">
                {manualDraft && (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-neutral-900 dark:text-neutral-100">Manual Draft</h4>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {manualDraftSavedAt ? `Saved: ${manualDraftSavedAt.toLocaleString()}` : 'Available'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowConfirmManualRestore(true)}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900"
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                )}
                
                {autoDraft && (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-neutral-900 dark:text-neutral-100">Auto Draft</h4>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {autoDraftSavedAt ? `Saved: ${autoDraftSavedAt.toLocaleString()}` : 'Available'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowConfirmAutoRestore(true)}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900"
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Description (moved from left) */}
          <div className={dashboardPanelClass('space-y-4')}>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Description</label>
              <textarea
                ref={descriptionRef}
                value={formData.description}
                onChange={(e) => {
                  const value = e.target.value.slice(0, 320);
                  handleDescriptionChange(value);
                }}
                onInput={() => adjustDescriptionHeight()}
                placeholder={`Brief description of this ${entityNames.singularLower}...`}
                rows={3}
                maxLength={320}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
              <div className="flex justify-end text-xs text-neutral-500 dark:text-neutral-400">
                {formData.description.length}/320 characters
              </div>
            </div>
          </div>

          {/* Categories (moved from left) */}
          {enableCategories && (
            <div className={dashboardPanelClass('space-y-4')}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Categories</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Select up to {CATEGORY_SELECTION_LIMIT} categories for this {entityNames.singularLower}.
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2 text-sm text-neutral-500 sm:items-end dark:text-neutral-400">
                  <span>
                    {formData.categoryIds.length}/{CATEGORY_SELECTION_LIMIT} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCategoriesModal(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-2 py-1 font-medium text-neutral-700 transition hover:border-violet-400 hover:text-violet-600 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-violet-400"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
                    </svg>
                    Manage
                  </button>
                </div>
              </div>

              {availableCategories.length ? (
                <div className="flex flex-wrap gap-2">
                  {availableCategories.map((category) => {
                    const isSelected = formData.categoryIds.includes(category.id);
                    const disableSelection = !isSelected && formData.categoryIds.length >= CATEGORY_SELECTION_LIMIT;
                    const postCountLabel = category.postCount === 1 ? '1 post' : `${category.postCount} posts`;
                    return (
                      <button
                        type="button"
                        key={category.id}
                        onClick={() => handleCategoryToggle(category.id)}
                        disabled={disableSelection}
                        className={clsx(
                          'inline-flex items-center gap-3 rounded-md border px-3 py-1.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60',
                          isSelected
                            ? 'border-violet-500 bg-violet-50/80 text-violet-700 dark:border-violet-500/60 dark:bg-violet-900/20 dark:text-violet-100'
                            : 'border-neutral-200 bg-white hover:border-violet-200 hover:bg-violet-50/40 dark:bg-neutral-900'
                        )}
                        aria-pressed={isSelected}
                      >
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">{category.title}</span>
                        <span
                          className={clsx(
                            'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                            isSelected
                              ? 'border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-500/60 dark:bg-violet-900/40 dark:text-violet-100'
                              : 'border-neutral-200 text-neutral-500 dark:border-neutral-600 dark:text-neutral-400'
                          )}
                        >
                          {isSelected ? 'Selected' : postCountLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-300">
                  No categories yet.
                  {' '}
                  <button
                    type="button"
                    onClick={() => setShowCategoriesModal(true)}
                    className="text-violet-600 underline hover:text-violet-500"
                  >
                    Create one
                  </button>
                  {' '}to get started.
                </div>
              )}
            </div>
          )}

          {/* Auto-save status */}
          <div className="flex items-center justify-center text-xs text-neutral-500 dark:text-neutral-400">
            {isAutoSaving ? (
              <div className="flex items-center gap-2">
                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving draft...
              </div>
            ) : lastSaved ? (
              <span>
                Last saved: {lastSaved.toLocaleString()}
              </span>
            ) : hasUnsavedChanges ? (
              <span className="text-amber-600 dark:text-amber-400">Unsaved changes</span>
            ) : null}
          </div>

          

          <div className={dashboardPanelClass('space-y-4')}>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
              Social sharing
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Social title</label>
                <input
                  type="text"
                  value={formData.ogTitle}
                  onChange={(e) => {
                    const value = e.target.value.slice(0, 60);
                    setFormData((prev) => ({ ...prev, ogTitle: value }));
                    setManuallyEditedFields(prev => ({ ...prev, ogTitle: true }));
                    triggerAutoSave();
                  }}
                  placeholder="Title for social media sharing"
                  maxLength={60}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{formData.ogTitle.length}/60 characters</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Social description</label>
                <textarea
                  value={formData.ogDescription}
                  onChange={(e) => {
                    const value = e.target.value.slice(0, 160);
                    setFormData((prev) => ({ ...prev, ogDescription: value }));
                    setManuallyEditedFields(prev => ({ ...prev, ogDescription: true }));
                    triggerAutoSave();
                  }}
                  placeholder="Description for social media sharing"
                  rows={3}
                  maxLength={160}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
                <div className="flex justify-end text-xs text-neutral-500 dark:text-neutral-400">
                  {formData.ogDescription.length}/160 characters
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Social image URL</label>
                <input
                  type="url"
                  value={formData.ogImage}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, ogImage: e.target.value }));
                    triggerAutoSave();
                  }}
                  placeholder="https://example.com/your-image.jpg"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImagePickerTarget('socialImage');
                    setShowImagePickerModal(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Select image
                </button>
              </div>
            </div>
          </div>

          {/* Search preview moved to bottom */}
        </div>

        {imageEditorState ? (
          <ImageEditorModal
            open={true}
            imageUrl={imageEditorState.objectUrl}
            filename={imageEditorState.filename}
            mimeType={imageEditorState.mimeType}
            onCancel={closeImageEditor}
            onConfirm={handleImageEditorConfirm}
          />
        ) : null}
      </div>

      {/* Link Modal */}
      {isMounted && showLinkModal && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-800">
            <h3 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Add Link
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  URL
                </label>
                <input
                  type="text"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  autoFocus
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
                <input
                  type="checkbox"
                  checked={linkOpensInNewTab}
                  onChange={(event) => setLinkOpensInNewTab(event.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 dark:border-neutral-600"
                />
                Open in new tab
              </label>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowLinkModal(false);
                    setLinkUrl('');
                    setLinkOpensInNewTab(false);
                  }}
                  className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLinkSubmit}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
                >
                  {linkUrl.trim() ? 'Save Link' : 'Remove Link'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isMounted && showConfirmManualRestore && createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-800">
            <h3 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Restore manual draft?</h3>
            <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">This will overwrite your current editor content with the saved manual draft. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmManualRestore(false)}
                className="rounded px-3 py-2 bg-neutral-200 text-neutral-800 hover:bg-neutral-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmManualRestore(false);
                  try {
                    restoreFromManualDraft();
                  } catch (err) {
                    console.warn('Manual restore failed:', err);
                  }
                }}
                className="rounded px-3 py-2 bg-blue-600 text-white hover:bg-blue-700"
              >
                Restore
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isMounted && showConfirmAutoRestore && createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-800">
            <h3 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Restore auto draft?</h3>
            <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">This will overwrite your current editor content with the most recent auto-saved draft. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmAutoRestore(false)}
                className="rounded px-3 py-2 bg-neutral-200 text-neutral-800 hover:bg-neutral-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmAutoRestore(false);
                  try {
                    restoreFromAutoDraft();
                  } catch (err) {
                    console.warn('Auto restore failed:', err);
                  }
                }}
                className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700"
              >
                Restore
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isMounted && showCategoriesModal && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex h-[min(90vh,900px)] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-700">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Manage blog categories</h3>
              <button
                type="button"
                onClick={() => setShowCategoriesModal(false)}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <BlogCategoriesPanel
                initialCategories={availableCategories}
                onCategoriesChange={handleCategoriesPanelChange}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Embed Modal */}
      {isMounted && showEmbedModal && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-800">
            <h3 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Insert Embed</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">URL or iframe HTML</label>
                <textarea
                  value={embedInput}
                  onChange={(e) => setEmbedInput(e.target.value)}
                  placeholder="Paste an iframe HTML snippet or a provider URL (YouTube, Twitter, etc.)"
                  className="mt-1 h-28 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-sm text-neutral-700 dark:text-neutral-200">Width (px)</label>
                  <input value={embedWidth ?? ''} onChange={(e) => setEmbedWidth(e.target.value || null)} placeholder="e.g. 800" type="text" className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
                </div>
                <div>
                  <label className="text-sm text-neutral-700 dark:text-neutral-200">Height (px)</label>
                  <input value={embedHeight ?? ''} onChange={(e) => setEmbedHeight(e.target.value || null)} placeholder="e.g. 450" type="text" className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
                </div>
                <div>
                  <label className="text-sm text-neutral-700 dark:text-neutral-200">Align</label>
                  <select
                    value={embedAlign}
                    onChange={(e) => setEmbedAlign(e.target.value as EmbedAlign)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                    <option value="float-left">Float left</option>
                    <option value="float-right">Float right</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => {
                  setShowEmbedModal(false);
                  setEmbedInput('');
                  setEmbedWidth(null);
                  setEmbedHeight(null);
                  setEmbedAlign('center');
                }} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600">Cancel</button>
                <button type="button" onClick={async () => {
                  if (!editor) return;
                  const raw = embedInput.trim();
                  if (!raw) {
                    showToast('Please paste a URL or iframe HTML.', 'error');
                    return;
                  }
                    try {
                    const isIframeHtml = raw.includes('<iframe');
                    let iframeAttrs: IframeAttrs;

                    if (isIframeHtml) {
                      const parser = new DOMParser();
                      const doc = parser.parseFromString(raw, 'text/html');
                      const iframe = doc.querySelector('iframe');
                      if (!iframe) throw new Error('No iframe found');
                      const srcAttr = iframe.getAttribute('src') || '';
                      if (!srcAttr) throw new Error('Iframe missing src attribute');
                      const widthAttr = iframe.getAttribute('width');
                      const heightAttr = iframe.getAttribute('height');
                      const parsedWidth = widthAttr ? parseInt(widthAttr, 10) : NaN;
                      const fallbackWidth = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : 600;
                      const parsedHeight = heightAttr ? parseInt(heightAttr, 10) : NaN;
                      const fallbackHeight = Number.isFinite(parsedHeight) && parsedHeight > 0
                        ? parsedHeight
                        : Math.round(fallbackWidth * 9 / 16);

                      const allowAttr = iframe.getAttribute('allow');
                      const sandboxAttr = iframe.getAttribute('sandbox');
                      const frameborderAttr = iframe.getAttribute('frameborder');
                      const allowFullscreenAttr = iframe.getAttribute('allowfullscreen');
                      const referrerPolicyAttr = iframe.getAttribute('referrerpolicy');

                      iframeAttrs = {
                        src: srcAttr,
                        width: fallbackWidth,
                        height: fallbackHeight,
                        allow: allowAttr || undefined,
                        sandbox: sandboxAttr ?? DEFAULT_IFRAME_SANDBOX,
                        frameborder: frameborderAttr || undefined,
                        allowfullscreen: allowFullscreenAttr !== null ? allowFullscreenAttr || 'true' : undefined,
                        referrerpolicy: referrerPolicyAttr || undefined,
                        'data-align': embedAlign,
                      };
                    } else {
                      iframeAttrs = {
                        src: raw,
                        width: embedWidth ?? undefined,
                        height: embedHeight ?? undefined,
                        sandbox: DEFAULT_IFRAME_SANDBOX,
                        'data-align': embedAlign,
                      };
                    }

                    const youtubeMatch = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{5,})/.test(raw);
                    const twitterMatch = raw.match(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]+\/status\/(\d+)/i);

                    if (youtubeMatch) {
                      const parsedWidth = parseDimension(embedWidth);
                      const parsedHeight = parseDimension(embedHeight);
                      const handled = runYoutubeEmbed(editor, {
                        src: raw,
                        width: parsedWidth,
                        height: parsedHeight,
                      });
                      if (!handled) {
                        runIframeEmbed(editor, iframeAttrs);
                      }
                    } else if (twitterMatch) {
                      const statusId = twitterMatch[1];
                      const tweetUrl = raw.includes('http') ? raw : `https://twitter.com/i/web/status/${statusId}`;
                      const tweetContent: JSONContent = {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: tweetUrl,
                            marks: [{ type: 'link', attrs: { href: tweetUrl } }],
                          },
                        ],
                      };
                      try {
                        editor.chain().focus().insertContent(tweetContent).run();
                      } catch (err) {
                        console.error('Failed to insert twitter URL, falling back to iframe', err);
                        runIframeEmbed(editor, iframeAttrs);
                      }
                    } else {
                      runIframeEmbed(editor, iframeAttrs);
                    }
                    showToast('Embed inserted', 'success');
                    setShowEmbedModal(false);
                    setEmbedInput('');
                    setEmbedWidth(null);
                    setEmbedHeight(null);
                    setEmbedAlign('center');
                  } catch (err) {
                    console.error('Failed to insert embed', err);
                    showToast('Failed to insert embed', 'error');
                  }
                }} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">Insert</button>
              </div>
            </div>
          </div>
        </div>, document.body
      )}


      {/* Image Picker Modal */}
      <ImagePickerModal
        isOpen={showImagePickerModal}
        onClose={() => setShowImagePickerModal(false)}
        onSelectImage={handleImageSelected}
        title="Select or Upload Image"
        allowUpload={true}
        uploadScope={uploadScope}
      />

      {/* Fullscreen backdrop portal - renders at body level to escape CSS stacking contexts */}
      {isMounted && isEditorFullscreen && createPortal(
        <div
          className="fixed inset-0 z-[59] bg-neutral-950/50 backdrop-blur-sm"
          onClick={() => toggleEditorFullscreen(false)}
          aria-hidden="true"
        />,
        document.body
      )}

      {/* Fullscreen portal container - editor wrapper is teleported into this */}
      {isMounted && createPortal(
        <div
          ref={fullscreenContainerRef}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'flex',
            flexDirection: 'column',
            background: 'white',
            visibility: isEditorFullscreen ? 'visible' : 'hidden',
            pointerEvents: isEditorFullscreen ? 'auto' : 'none',
          }}
          className="dark:bg-neutral-900"
        />,
        document.body
      )}

    </div>
  );
}