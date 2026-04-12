"use client";

import { useEffect, useState, useCallback } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { JSONContent } from '@tiptap/core';
import clsx from 'clsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
	faLink,
	faImage,
	faCode,
	faPlay,
	faMinus,
	faEraser,
	faExpand,
	faCompress,
	faListUl,
	faListOl,
	faTrash,
	faAlignLeft,
	faAlignCenter,
	faAlignRight
} from '@fortawesome/free-solid-svg-icons';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { createPortal } from 'react-dom';
import { showToast } from '@/components/ui/Toast';
import { CustomImage } from './CustomImage';
import CustomIframe, { IframeAttrs } from './CustomIframe';
import Youtube from '@tiptap/extension-youtube';
import ImageEditorModal from './ImageEditorModal';
import { ImagePickerModal } from '@/components/ui/ImagePickerModal';
import {
	DEFAULT_IFRAME_SANDBOX,
	EmbedAlign,
	ImageEditorState,
	ImageNodeAttrs,
	YoutubeCommandOptions,
	canEditImageType,
	ensureExtensionForMime,
	inferMimeFromName,
	isValidLinkHref,
	parseDimension,
	runIframeEmbed,
	runYoutubeEmbed,
} from './richTextHelpers';
import './editor.css';

interface SimplePageEditorProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	uploadScope?: 'file' | 'blog' | 'logo';
}

export function SimplePageEditor({ value, onChange, placeholder = 'Start writing…', uploadScope = 'file' }: SimplePageEditorProps) {
	const [isMounted, setIsMounted] = useState(false);
	const [showLinkModal, setShowLinkModal] = useState(false);
	const [linkUrl, setLinkUrl] = useState('');
	const [linkOpensInNewTab, setLinkOpensInNewTab] = useState(false);
	const [showEmbedModal, setShowEmbedModal] = useState(false);
	const [embedInput, setEmbedInput] = useState('');
	const [embedWidth, setEmbedWidth] = useState<string | null>(null);
	const [embedHeight, setEmbedHeight] = useState<string | null>(null);
	const [embedAlign, setEmbedAlign] = useState<EmbedAlign>('center');
	const [showImagePickerModal, setShowImagePickerModal] = useState(false);
	const [imageEditorState, setImageEditorState] = useState<ImageEditorState | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [isPreparingImage, setIsPreparingImage] = useState(false);
	const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);

	useEffect(() => {
		setIsMounted(true);
	}, [uploadScope]);

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				link: false,
				underline: false,
				horizontalRule: false,
				heading: { levels: [1, 2, 3, 4, 5, 6] },
			}),
			CustomImage.configure({
				HTMLAttributes: {
					class: 'h-auto rounded-lg block editor-image',
					style: 'max-width: 100% !important; width: auto !important;',
				},
				inline: false,
				allowBase64: true,
			}),
			CustomIframe,
			Youtube.configure({ HTMLAttributes: { class: 'iframe-wrapper' }, controls: true, nocookie: false }),
			Link.configure({
				openOnClick: false,
				autolink: true,
				HTMLAttributes: {
					class: 'text-violet-600 hover:text-violet-700 underline',
					rel: null,
					target: null,
				},
				validate: isValidLinkHref,
			}),
			Underline,
			TextAlign.configure({ types: ['heading', 'paragraph', 'image'] }),
			Color,
			TextStyle,
			Highlight.configure({ multicolor: true }),
			Placeholder.configure({ placeholder, emptyEditorClass: 'is-editor-empty' }),
			HorizontalRule,
		],
		content: value || '<p></p>',
		immediatelyRender: false,
		editorProps: {
			attributes: {
				class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl mx-auto focus:outline-none min-h-[240px] max-w-none prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:my-4 prose-p:leading-relaxed',
			},
		},
		onUpdate: ({ editor }) => {
			try {
				if (!editor || editor.isDestroyed) return;
				const html = editor.getHTML();
				onChange(html);
			} catch (error) {
				console.warn('Sidebar editor update failed', error);
			}
		},
	});

	useEffect(() => {
		if (!editor) return;
		const current = editor.getHTML();
		if (value && value !== current) {
			try {
				editor.commands.setContent(value);
			} catch (error) {
				console.warn('Failed to sync sidebar content', error);
			}
		}
	}, [editor, value]);

	const uploadImageFile = useCallback(async (file: File) => {
		setIsUploading(true);
		try {
			const response = await fetch('/api/admin/file/upload', {
				method: 'POST',
				headers: {
					'x-filename': file.name,
					'x-mimetype': file.type,
					'x-upload-scope': uploadScope,
				},
				body: file,
			});
			if (!response.ok) {
				const error = await response.json().catch(() => ({}));
				throw new Error(error.error || 'Upload failed');
			}
			const { url } = await response.json();
			return url as string;
		} catch (error) {
			console.error('Sidebar image upload failed', error);
			showToast('Failed to upload image', 'error');
			throw error;
		} finally {
			setIsUploading(false);
		}
	}, [uploadScope]);

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
				.setLink({ href: trimmed, target: linkOpensInNewTab ? '_blank' : null })
				.run();
		}
		setShowLinkModal(false);
		setLinkUrl('');
		setLinkOpensInNewTab(false);
	};

	const addImage = useCallback(() => setShowImagePickerModal(true), []);

	const handleImageSelected = useCallback(async (imageUrl: string) => {
		if (!editor) return;
		try {
			const attrs: ImageNodeAttrs = { src: imageUrl, 'data-align': 'center' };
			editor.chain().focus().setImage(attrs).run();
		} catch (error) {
			console.error('Failed to insert sidebar image', error);
			showToast('Failed to insert image', 'error');
		} finally {
			setShowImagePickerModal(false);
		}
	}, [editor]);

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
			if (!response.ok) throw new Error('Failed to load image');
			const blob = await response.blob();
			const mime = blob.type || inferMimeFromName(src);
			if (!mime || !canEditImageType(mime)) {
				showToast('Only PNG, JPEG, or WEBP images can be edited here.', 'info');
				return;
			}
			const filename = src.split('/').pop() || 'image-edit';
			const objectUrl = URL.createObjectURL(blob);
			openImageEditor({ mode: 'edit', objectUrl, filename, mimeType: mime, nodePos });
		} catch (error) {
			console.error('Sidebar image edit failed', error);
			showToast('Unable to load image for editing', 'error');
		} finally {
			setIsPreparingImage(false);
		}
	}, [editor, openImageEditor]);

	const handleImageEditorConfirm = useCallback(async (result: { blob: Blob; width: number; height: number; mimeType: string; filename: string }) => {
		if (!imageEditorState || !editor) return;
		try {
			const finalMime = result.mimeType || imageEditorState.mimeType;
			const finalName = ensureExtensionForMime(imageEditorState.filename, finalMime);
			const file = new File([result.blob], finalName, { type: finalMime });
			const url = await uploadImageFile(file);

			const imageAttrs: ImageNodeAttrs = {
				src: url,
				width: Math.round(result.width),
				height: Math.round(result.height),
				'data-align': editor.getAttributes('image')['data-align'] || 'center',
				'data-original-width': result.width.toString(),
				'data-original-height': result.height.toString(),
			};

			if (imageEditorState.mode === 'edit' && typeof imageEditorState.nodePos === 'number') {
				editor.chain().focus().setNodeSelection(imageEditorState.nodePos).updateAttributes('image', imageAttrs).run();
			} else {
				editor.chain().focus().setImage(imageAttrs).run();
			}

			closeImageEditor();
		} catch (error) {
			console.error('Sidebar image editor confirm error', error);
			showToast('Unable to save edited image', 'error');
		}
	}, [imageEditorState, editor, uploadImageFile, closeImageEditor]);

	const alignImage = useCallback((alignment: EmbedAlign) => {
		if (!editor || editor.isDestroyed) return;
		const { selection } = editor.state;
		if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
			editor.chain().focus().updateAttributes('image', { 'data-align': alignment }).run();
		}
	}, [editor]);

	const getImageAlignment = useCallback(() => {
		if (!editor || editor.isDestroyed) return null;
		const { selection } = editor.state;
		if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
			return selection.node.attrs['data-align'] || null;
		}
		return null;
	}, [editor]);

	const insertEmbed = useCallback(async () => {
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
				const fallbackHeight = Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : Math.round(fallbackWidth * 9 / 16);
				iframeAttrs = {
					src: srcAttr,
					width: fallbackWidth,
					height: fallbackHeight,
					allow: iframe.getAttribute('allow') || undefined,
					sandbox: iframe.getAttribute('sandbox') ?? DEFAULT_IFRAME_SANDBOX,
					frameborder: iframe.getAttribute('frameborder') || undefined,
					allowfullscreen: iframe.getAttribute('allowfullscreen') ?? undefined,
					referrerpolicy: iframe.getAttribute('referrerpolicy') || undefined,
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
				const handled = runYoutubeEmbed(editor, { src: raw, width: parsedWidth, height: parsedHeight } as YoutubeCommandOptions);
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
				editor.chain().focus().insertContent(tweetContent).run();
			} else {
				runIframeEmbed(editor, iframeAttrs);
			}

			showToast('Embed inserted', 'success');
			setShowEmbedModal(false);
			setEmbedInput('');
			setEmbedWidth(null);
			setEmbedHeight(null);
			setEmbedAlign('center');
		} catch (error) {
			console.error('Sidebar embed failed', error);
			showToast('Failed to insert embed', 'error');
		}
	}, [editor, embedInput, embedWidth, embedHeight, embedAlign]);

	if (!editor) {
		return <div className="rounded-lg border border-neutral-200 bg-white p-4 text-center text-sm text-neutral-500">Loading editor…</div>;
	}

	const headingLevels = [1, 2, 3] as const;
	const textAlignments = ['left', 'center', 'right'] as const;

	const renderToolbar = () => (
		<div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-900/60">
			<div className="flex items-center gap-1 border-r border-neutral-200 pr-2 dark:border-neutral-700">
				{['bold', 'italic', 'underline', 'strike'].map((mark) => (
					<button
						key={mark}
						type="button"
						onClick={() => {
							if (!editor) return;
							const chain = editor.chain().focus();
							if (mark === 'bold') chain.toggleBold().run();
							if (mark === 'italic') chain.toggleItalic().run();
							if (mark === 'underline') chain.toggleUnderline().run();
							if (mark === 'strike') chain.toggleStrike().run();
						}}
						className={clsx('rounded p-2 text-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-800', editor.isActive(mark as never) && 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400')}
					>
						{mark === 'bold' && <span className="font-bold">B</span>}
						{mark === 'italic' && <span className="font-medium italic">I</span>}
						{mark === 'underline' && <span className="font-medium underline">U</span>}
						{mark === 'strike' && <span className="font-medium line-through">S</span>}
					</button>
				))}
			</div>

			<div className="flex items-center gap-1 border-r border-neutral-200 pr-2 dark:border-neutral-700">
				{headingLevels.map((level) => (
					<button
						key={level}
						type="button"
						onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
						className={clsx('rounded px-3 py-1 text-sm font-semibold transition hover:bg-neutral-100 dark:hover:bg-neutral-800', editor.isActive('heading', { level }) && 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400')}
					>
						H{level}
					</button>
				))}
			</div>

			<div className="flex items-center gap-1 border-r border-neutral-200 pr-2 dark:border-neutral-700">
				<button
					type="button"
					onClick={() => editor.chain().focus().toggleBulletList().run()}
					className={clsx('rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800', editor.isActive('bulletList') && 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400')}
					title="Bullet list"
				>
					<FontAwesomeIcon icon={faListUl} />
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().toggleOrderedList().run()}
					className={clsx('rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800', editor.isActive('orderedList') && 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400')}
					title="Numbered list"
				>
					<FontAwesomeIcon icon={faListOl} />
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().toggleBlockquote().run()}
					className={clsx('rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800', editor.isActive('blockquote') && 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400')}
					title="Quote"
				>
					❝
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().toggleCodeBlock().run()}
					className={clsx('rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800', editor.isActive('codeBlock') && 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400')}
					title="Code block"
				>
					<FontAwesomeIcon icon={faCode} />
				</button>
			</div>

			<div className="flex items-center gap-1 border-r border-neutral-200 pr-2 dark:border-neutral-700">
				<button type="button" onClick={setLink} className={clsx('rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800', editor.isActive('link') && 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400')} title="Add or edit link">
					<FontAwesomeIcon icon={faLink} />
				</button>
				<button type="button" onClick={addImage} disabled={isUploading || isPreparingImage} className="rounded p-2 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800" title="Add image">
					<FontAwesomeIcon icon={faImage} />
				</button>
				<button type="button" onClick={() => setShowEmbedModal(true)} className="rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800" title="Insert embed (iframe, YouTube, tweet)">
					<FontAwesomeIcon icon={faPlay} />
				</button>
			</div>

			<div className="flex items-center gap-1 border-r border-neutral-200 pr-2 dark:border-neutral-700">
				<button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className="rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800" title="Divider">
					<FontAwesomeIcon icon={faMinus} />
				</button>
				<button type="button" onClick={() => editor.chain().focus().unsetAllMarks().run()} className="rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800" title="Clear formatting">
					<FontAwesomeIcon icon={faEraser} />
				</button>
			</div>

			<div className="flex items-center gap-1">
				{textAlignments.map((position) => (
					<button
						key={position}
						type="button"
						onClick={() => editor.chain().focus().setTextAlign(position).run()}
						className={clsx('rounded p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800', editor.isActive({ textAlign: position }) && 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400')}
						title={`Align ${position}`}
					>
						{position === 'left' && <FontAwesomeIcon icon={faAlignLeft} />}
						{position === 'center' && <FontAwesomeIcon icon={faAlignCenter} />}
						{position === 'right' && <FontAwesomeIcon icon={faAlignRight} />}
					</button>
				))}
			</div>

			<button
				type="button"
				onClick={() => setIsEditorFullscreen((prev) => !prev)}
				className="ml-auto rounded p-2 text-sm font-medium transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
				title={isEditorFullscreen ? 'Exit full screen' : 'Full screen'}
			>
				<FontAwesomeIcon icon={isEditorFullscreen ? faCompress : faExpand} />
			</button>
		</div>
	);

	return (
		<div className="rounded-[var(--theme-surface-radius)] overflow-hidden border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950/50">
			{renderToolbar()}
			<div className="max-h-[700px] overflow-y-auto p-4">
				<EditorContent
					editor={editor}
					className="editor-content"
					onClick={(event) => {
						const target = event.target as HTMLElement | null;
						if (!target) return;
						const linkElement = target.closest('a');
						if (!linkElement) return;
						try {
							editor.chain().focus().extendMarkRange('link').run();
						} catch (error) {
							console.warn('Failed to select link:', error);
						}
					}}
				/>
			</div>

			{imageEditorState && (
				<ImageEditorModal
					open={true}
					imageUrl={imageEditorState.objectUrl}
					filename={imageEditorState.filename}
					mimeType={imageEditorState.mimeType}
					onCancel={closeImageEditor}
					onConfirm={handleImageEditorConfirm}
				/>
			)}

			<ImagePickerModal
				isOpen={showImagePickerModal}
				onClose={() => setShowImagePickerModal(false)}
				onSelectImage={handleImageSelected}
				title="Select or Upload Image"
				allowUpload
				uploadScope={uploadScope}
			/>

			{isMounted && showLinkModal && createPortal(
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900">
						<h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Add Link</h3>
						<div className="mt-4 space-y-3">
							<input
								type="text"
								value={linkUrl}
								onChange={(event) => setLinkUrl(event.target.value)}
								className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-800"
								placeholder="https://example.com"
								autoFocus
							/>
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
									className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
								>
									Cancel
								</button>
								<button
									type="button"
									onClick={handleLinkSubmit}
									className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
								>
									{linkUrl.trim() ? 'Save Link' : 'Remove Link'}
								</button>
							</div>
						</div>
					</div>
				</div>,
				document.body
			)}

			{isMounted && showEmbedModal && createPortal(
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900">
						<h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Insert Embed</h3>
						<div className="mt-4 space-y-4">
							<textarea
								value={embedInput}
								onChange={(event) => setEmbedInput(event.target.value)}
								className="h-28 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-800"
								placeholder="Paste iframe HTML or URL"
							/>
							<div className="grid grid-cols-3 gap-3">
								<input
									value={embedWidth ?? ''}
									onChange={(event) => setEmbedWidth(event.target.value || null)}
									placeholder="Width"
									className="rounded-lg border border-neutral-300 px-2 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-800"
								/>
								<input
									value={embedHeight ?? ''}
									onChange={(event) => setEmbedHeight(event.target.value || null)}
									placeholder="Height"
									className="rounded-lg border border-neutral-300 px-2 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-800"
								/>
								<select
									value={embedAlign}
									onChange={(event) => setEmbedAlign(event.target.value as EmbedAlign)}
									className="rounded-lg border border-neutral-300 px-2 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-800"
								>
									<option value="left">Left</option>
									<option value="center">Center</option>
									<option value="right">Right</option>
									<option value="float-left">Float left</option>
									<option value="float-right">Float right</option>
								</select>
							</div>
							<div className="flex justify-end gap-3">
								<button
									type="button"
									onClick={() => {
										setShowEmbedModal(false);
										setEmbedInput('');
										setEmbedWidth(null);
										setEmbedHeight(null);
										setEmbedAlign('center');
									}}
									className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
								>
									Cancel
								</button>
								<button
									type="button"
									onClick={insertEmbed}
									className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
								>
									Insert
								</button>
							</div>
						</div>
					</div>
				</div>,
				document.body
			)}

			{!isEditorFullscreen && editor && !editor.isDestroyed && (
				<>
					<BubbleMenu
						editor={editor}
						options={{ placement: 'top' }}
						shouldShow={({ editor: bubbleEditor, state }) => {
							if (!bubbleEditor || bubbleEditor.isDestroyed) return false;
							if (!bubbleEditor.view?.dom?.isConnected) return false;
							if (!((bubbleEditor.view as unknown as { docView?: unknown }).docView)) {
								return false;
							}
							if (bubbleEditor.isActive('link')) return true;
							const { selection } = state;
							if (selection instanceof TextSelection) {
								return selection.content().size > 0;
							}
							return false;
						}}
					>
						<div className="flex overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-700 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
							<button
								type="button"
								onClick={() => setLink()}
								className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition hover:bg-neutral-100 dark:hover:bg-neutral-700"
								title="Edit link"
								aria-label="Edit link"
							>
								<FontAwesomeIcon icon={faLink} />
							</button>
							<button
								type="button"
								onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
								className="inline-flex items-center gap-2 border-l border-neutral-200 px-3 py-2 text-xs font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-700"
								title="Remove link"
								aria-label="Remove link"
							>
								<FontAwesomeIcon icon={faTrash} />
							</button>
						</div>
					</BubbleMenu>

					<BubbleMenu
						editor={editor}
						options={{ placement: 'top' }}
						shouldShow={({ editor: bubbleEditor, state }) => {
							if (!bubbleEditor || bubbleEditor.isDestroyed) return false;
							if (!bubbleEditor.view?.dom?.isConnected) return false;
							if (!((bubbleEditor.view as unknown as { docView?: unknown }).docView)) {
								return false;
							}
							const selection = state.selection;
							if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
								return true;
							}
							return bubbleEditor.isActive('image');
						}}
					>
						<div className="flex overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-700 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
							<button
								type="button"
								onClick={() => void editSelectedImage()}
								disabled={isUploading || isPreparingImage}
								className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-neutral-700"
								title="Edit image"
								aria-label="Edit image"
							>
								<FontAwesomeIcon icon={faImage} />
							</button>
							{(['left', 'center', 'right', 'float-left', 'float-right'] as EmbedAlign[]).map((position) => (
								<button
									key={position}
									type="button"
									onClick={() => alignImage(position)}
									className={clsx('inline-flex items-center px-3 py-2 text-xs font-medium transition hover:bg-neutral-100 dark:hover:bg-neutral-700', getImageAlignment() === position && 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300')}
									title={position === 'float-left' ? 'Float left' : position === 'float-right' ? 'Float right' : `Align ${position}`}
									aria-label={position === 'float-left' ? 'Float left' : position === 'float-right' ? 'Float right' : `Align ${position}`}
								>
									{position === 'left' && <FontAwesomeIcon icon={faAlignLeft} />}
									{position === 'center' && <FontAwesomeIcon icon={faAlignCenter} />}
									{position === 'right' && <FontAwesomeIcon icon={faAlignRight} />}
									{position === 'float-left' && <FontAwesomeIcon icon={faChevronLeft} />}
									{position === 'float-right' && <FontAwesomeIcon icon={faChevronRight} />}
								</button>
							))}
							<button
								type="button"
								onClick={() => editor.chain().focus().deleteSelection().run()}
								className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-neutral-700"
								title="Remove image"
								aria-label="Remove image"
							>
								<FontAwesomeIcon icon={faTrash} />
							</button>
						</div>
					</BubbleMenu>
				</>
			)}
		</div>
	);
}

export default SimplePageEditor;
