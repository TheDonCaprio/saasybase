'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

interface TwitterWidgetsApi {
  widgets?: {
    load: (element?: Element | Document | null) => void;
  };
}

// Allow referencing the Twitter widgets global without ts-ignore comments
declare global {
  interface Window { twttr?: TwitterWidgetsApi }
}

interface SiteContentRendererProps {
  content: string;
  className?: string;
}

export function SiteContentRenderer({ content, className = '' }: SiteContentRendererProps) {
  // Ensure the important site-level styles are always applied by including
  // the `site-page-content` class in the rendered wrapper. Callers can pass
  // additional utility classes (e.g. `prose prose-sm`) and they'll be merged.
  const finalClassName = `${className ? className + ' ' : ''}site-page-content`;
  const contentRef = useRef<HTMLDivElement>(null);

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchString = searchParams ? searchParams.toString() : '';

  useEffect(() => {
    if (!contentRef.current) return;

    const images = contentRef.current.querySelectorAll('img');

    images.forEach((img) => {
      const element = img as HTMLElement;
      const style = element.style as CSSStyleDeclaration & { cssFloat?: string };
      const alignment = img.getAttribute('data-align');

      // Prefer the explicit display width/height (data-width/data-height) that
      // the editor/crop flow sets. Fall back to data-original-width only when
      // no display width is present. This avoids the original image size
      // being reapplied after hydration which caused the "stretching" bug.
      const displayWidthAttr = img.getAttribute('data-width');
      const displayHeightAttr = img.getAttribute('data-height');
      const originalWidthAttr = img.getAttribute('data-original-width');

      // Clear problematic inline styles from the editor to start from a clean slate
      style.removeProperty('width');
      style.removeProperty('height');
      style.removeProperty('max-width');
      style.removeProperty('float');
      if (style.cssFloat !== undefined) {
        style.cssFloat = '';
      }

      const widthSource = displayWidthAttr || originalWidthAttr;
      if (widthSource) {
        const widthValue = parseFloat(widthSource as string);
        if (!Number.isNaN(widthValue) && widthValue > 0) {
          style.setProperty('width', `${widthValue}px`, 'important');
          // Keep images responsive by default
          style.setProperty('max-width', '100%', 'important');

          // If the editor supplied an explicit display height, use it to set 
          // the aspect ratio. This prevents layout shift while allowing the 
          // image to scale proportionally (height: auto) when constrained by 
          // max-width (e.g. on mobile), avoiding the "squished" look.
          if (displayHeightAttr) {
            const heightValue = parseFloat(displayHeightAttr as string);
            if (!Number.isNaN(heightValue) && heightValue > 0) {
              style.setProperty('aspect-ratio', `${widthValue} / ${heightValue}`, 'important');
              style.setProperty('height', 'auto', 'important');
            } else {
              style.setProperty('height', 'auto', 'important');
            }
          } else {
            style.setProperty('height', 'auto', 'important');
          }
        }
      }

      // Float styles are now handled by CSS since we removed flexbox.
      // For floated images we intentionally remove the max-width so they can
      // appear at their chosen pixel width.
      if (alignment === 'float-left' || alignment === 'float-right') {
        style.setProperty('max-width', 'none', 'important');
      }
    });
  }, [content, pathname, searchString]);

  useEffect(() => {
    if (!contentRef.current) return;

    // Handle iframe wrappers and raw iframes inserted by the editor/paste flow.
    const iframeWrappers = Array.from(
      contentRef.current.querySelectorAll('.iframe-wrapper, iframe')
    ) as HTMLElement[];

    iframeWrappers.forEach((el) => {
      // If the element is an iframe directly, prefer it. If it's a wrapper div,
      // find the contained iframe.
      const iframe = el.tagName.toLowerCase() === 'iframe'
        ? (el as HTMLIFrameElement)
        : (el.querySelector('iframe') as HTMLIFrameElement | null);

      const wrapper = el.tagName.toLowerCase() === 'iframe' ? el.parentElement : el;

      if (!iframe) return;

      // Read persisted attributes that the editor/node view sets.
      const displayWidth = (iframe.getAttribute('data-width') || iframe.getAttribute('width')) || (wrapper?.getAttribute('data-width') ?? null);
      const displayHeight = (iframe.getAttribute('data-height') || iframe.getAttribute('height')) || (wrapper?.getAttribute('data-height') ?? null);
      const align = (wrapper?.getAttribute('data-align') || iframe.getAttribute('data-align') || 'center') as string;

      const iframeStyle = iframe.style;

      // Clear any old sizing so we can apply authoritative values
      iframeStyle.removeProperty('width');
      iframeStyle.removeProperty('height');
      iframeStyle.removeProperty('display');
      iframeStyle.removeProperty('margin-left');
      iframeStyle.removeProperty('margin-right');

      // Default to a sensible width when none is provided (matches editor default)
      let widthValue = 600;
      if (displayWidth) {
        const parsed = parseFloat(displayWidth as string);
        if (!Number.isNaN(parsed) && parsed > 0) widthValue = parsed;
      }

      // Make iframe responsive: let it fill available width up to the editor-specified max.
      // For iframes, `height: auto` does not preserve aspect ratio, so when no explicit
      // height is provided we enforce a 16:9 aspect-ratio so the iframe isn't rendered
      // as a tiny strip (browsers default iframe height to ~150px when height is absent).
      iframeStyle.setProperty('width', '100%', 'important');
      iframeStyle.setProperty('max-width', `${widthValue}px`, 'important');
      iframeStyle.setProperty('max-height', 'none', 'important');

      if (displayHeight) {
        const parsedH = parseFloat(displayHeight as string);
        if (!Number.isNaN(parsedH) && parsedH > 0) {
          iframeStyle.setProperty('height', `${parsedH}px`, 'important');
          // Remove enforced aspect-ratio when explicit height is present
          iframeStyle.removeProperty('aspect-ratio');
        } else {
          iframeStyle.setProperty('height', 'auto', 'important');
          iframeStyle.setProperty('aspect-ratio', '16/9', 'important');
        }
      } else {
        // No explicit height: enforce a 16:9 aspect ratio so sizing follows width
        iframeStyle.setProperty('height', 'auto', 'important');
        iframeStyle.setProperty('aspect-ratio', '16/9', 'important');
      }

      // Centering: use flexbox on the wrapper for consistent centering across CSS resets
      if (wrapper) {
        const wstyle = (wrapper as HTMLElement).style;
        wstyle.setProperty('display', 'flex');
        wstyle.setProperty('justify-content', align === 'float-left' ? 'flex-start' : align === 'float-right' ? 'flex-end' : 'center');
        wstyle.setProperty('width', '100%');
        wstyle.setProperty('box-sizing', 'border-box');
      } else {
        // Ensure the iframe is centered if there is no wrapper
        if (align === 'center' || !align) {
          iframeStyle.setProperty('display', 'block', 'important');
          iframeStyle.setProperty('margin-left', 'auto', 'important');
          iframeStyle.setProperty('margin-right', 'auto', 'important');
        }
      }
    });
    // Convert various tweet URL shapes into canonical Twitter blockquote markup
    // so widgets.js will render them. We handle:
    //  - A paragraph/div that contains only the tweet URL text
    //  - An anchor (<a href="tweet-url">) that is alone inside a block
    //  - A plain text node containing the URL
    const tweetUrlRegex = /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[A-Za-z0-9_]+\/status\/\d+/i;

    // Helper: create a blockquote.twitter-tweet element for a tweet URL
    const createTweetBlock = (url: string) => {
      // Normalize x.com URLs to twitter.com so Twitter's widgets.js recognizes them
      const normalizedUrl = url.replace(/^https?:\/\/(?:www\.)?x\.com/, 'https://twitter.com');
      
      const wrapper = document.createElement('blockquote');
      wrapper.className = 'twitter-tweet';
      const a = document.createElement('a');
      a.href = normalizedUrl;
      wrapper.appendChild(a);
      return wrapper;
    };

    // 1) Convert paragraphs/divs whose trimmed text is exactly a tweet URL
    const blockCandidates = Array.from(contentRef.current.querySelectorAll('p, div')) as HTMLElement[];
    blockCandidates.forEach((el) => {
      // Skip if it already contains an iframe or a blockquote tweet
      if (el.querySelector('iframe') || el.querySelector('blockquote.twitter-tweet')) return;
      const text = el.textContent?.trim() || '';
      const m = text.match(tweetUrlRegex);
      if (m && m[0] === text) {
        const url = m[0];
        const block = createTweetBlock(url);
        el.replaceWith(block);
      }
    });

    // 2) Convert anchors that point to tweet URLs. Prefer replacing the outer
    // block (paragraph/div) when the anchor is the only meaningful child.
    const anchors = Array.from(contentRef.current.querySelectorAll('a')) as HTMLAnchorElement[];
    anchors.forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (!tweetUrlRegex.test(href)) return;
      if (a.closest('blockquote.twitter-tweet')) return;

      // If the anchor is the only significant child of its block parent, replace the parent
      const blockParent = a.closest('p, div, figure') as HTMLElement | null;
      if (blockParent) {
        const textOnly = Array.from(blockParent.childNodes).every((n) => {
          if (n.nodeType === Node.TEXT_NODE) return !n.textContent?.trim();
          if (n.nodeType === Node.ELEMENT_NODE) return (n as Element).tagName.toLowerCase() === 'a' && (n as Element).isSameNode(a);
          return false;
        });
        if (textOnly) {
          const block = createTweetBlock(href);
          blockParent.replaceWith(block);
          return;
        }
      }

      // Otherwise, if anchor is standalone, replace the anchor itself
      const parent = a.parentElement;
      if (parent && parent.childElementCount === 1 && parent.textContent?.trim() === a.textContent?.trim()) {
        const block = createTweetBlock(href);
        parent.replaceWith(block);
        return;
      }
    });

    // Twitter embeds: if there are blockquotes with the twitter class, ensure
    // the widgets.js is loaded and then call twttr.widgets.load to convert them
    // into embedded tweets.
    const twitterBlocks = contentRef.current.querySelectorAll('blockquote.twitter-tweet, blockquote.twitter-media, .twitter-tweet');
    if (twitterBlocks.length > 0) {
      const ensureTwitter = () => {
        if (typeof window.twttr !== 'undefined' && window.twttr && typeof window.twttr.widgets?.load === 'function') {
          try {
            window.twttr.widgets.load(contentRef.current);
          } catch {
            // ignore widget failures - fall back to showing blockquote markup
          }
          return;
        }

        // Load platform script once
        const scriptId = 'twitter-wjs';
        if (!document.getElementById(scriptId)) {
          const script = document.createElement('script');
          script.id = scriptId;
          script.src = 'https://platform.twitter.com/widgets.js';
          script.async = true;
          script.onload = () => {
            // Defer slightly to ensure twttr is fully initialized before loading widgets
            setTimeout(() => {
              try {
                window.twttr?.widgets?.load(contentRef.current);
              } catch {
                // ignore widget load failures - tweet blockquotes will display as links
              }
            }, 100);
          };
          document.body.appendChild(script);
        } else {
          // Script already present but twttr wasn't ready yet; try calling load after a short timeout
          setTimeout(() => {
            try {
              window.twttr?.widgets?.load(contentRef.current);
            } catch {
              // ignore
            }
          }, 500);
        }
      };

      ensureTwitter();
    }
  }, [content, pathname, searchString]);

  return (
    <div 
      ref={contentRef}
      className={finalClassName}
      dangerouslySetInnerHTML={{ __html: content }} 
    />
  );
}