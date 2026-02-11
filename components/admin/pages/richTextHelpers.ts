import type { Editor as TiptapEditor } from '@tiptap/core';
import type { IframeAttrs } from './CustomIframe';

export type EmbedAlign = 'left' | 'center' | 'right' | 'float-left' | 'float-right';

export type YoutubeCommandOptions = {
  src: string;
  width?: number;
  height?: number;
  start?: number;
};

export interface ImageNodeAttrs {
  src: string;
  'data-align'?: string;
  'data-external'?: 'true' | 'false';
  width?: number;
  height?: number;
  [key: string]: string | number | undefined;
}

export interface ImageEditorState {
  mode: 'insert' | 'edit';
  objectUrl: string;
  filename: string;
  mimeType: string;
  nodePos?: number;
  onComplete?: (url: string) => void;
}

type YoutubeChain = ReturnType<TiptapEditor['chain']> & {
  focus: () => YoutubeChain;
  setYoutubeVideo?: (options: YoutubeCommandOptions) => YoutubeChain;
};

type IframeChain = ReturnType<TiptapEditor['chain']> & {
  focus: () => IframeChain;
  setIframe?: (options: IframeAttrs) => IframeChain;
};

const getYoutubeChain = (instance: TiptapEditor | null): YoutubeChain | null => {
  if (!instance) return null;
  const chain = instance.chain() as YoutubeChain;
  return typeof chain.setYoutubeVideo === 'function' ? chain : null;
};

const getIframeChain = (instance: TiptapEditor | null): IframeChain | null => {
  if (!instance) return null;
  const chain = instance.chain() as IframeChain;
  return typeof chain.setIframe === 'function' ? chain : null;
};

export const DEFAULT_IFRAME_SANDBOX = 'allow-scripts allow-same-origin';

export const runYoutubeEmbed = (instance: TiptapEditor | null, options: YoutubeCommandOptions): boolean => {
  if (!instance) return false;
  const chain = getYoutubeChain(instance);
  if (chain && typeof chain.setYoutubeVideo === 'function') {
    chain.focus().setYoutubeVideo(options).run();
    return true;
  }
  const commands = instance?.commands as TiptapEditor['commands'] & {
    setYoutubeVideo?: (opts: YoutubeCommandOptions) => boolean;
  };
  if (typeof commands?.setYoutubeVideo === 'function') {
    return commands.setYoutubeVideo(options);
  }
  return false;
};

export const runIframeEmbed = (instance: TiptapEditor | null, options: IframeAttrs): boolean => {
  if (!instance) return false;
  const chain = getIframeChain(instance);
  if (chain && typeof chain.setIframe === 'function') {
    chain.focus().setIframe(options).run();
    return true;
  }
  const commands = instance?.commands as TiptapEditor['commands'] & {
    setIframe?: (opts: IframeAttrs) => boolean;
  };
  if (typeof commands?.setIframe === 'function') {
    return commands.setIframe(options);
  }
  return false;
};

export const parseDimension = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

export const isValidLinkHref = (href: string) =>
  /^https?:\/\//i.test(href) ||
  href.startsWith('/') ||
  href.startsWith('#') ||
  href.startsWith('mailto:') ||
  href.startsWith('tel:');

const CROPPABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const canEditImageType = (mime: string) => CROPPABLE_IMAGE_TYPES.has(mime);

export const inferMimeFromName = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return '';
};

export const ensureExtensionForMime = (name: string, mime: string) => {
  const base = name.replace(/\.[^.]+$/, '');
  if (mime === 'image/png') return `${base}.png`;
  if (mime === 'image/webp') return `${base}.webp`;
  return `${base}.jpg`;
};
