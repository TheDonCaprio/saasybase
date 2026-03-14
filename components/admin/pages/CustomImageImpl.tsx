import * as React from 'react';
import { Image as TiptapImage } from '@tiptap/extension-image';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { type NodeViewProps } from '@tiptap/core';

interface ImageAttributes {
  [key: string]: string | null | undefined;
}

// React component for resizable image
function ResizableImageComponent(props: NodeViewProps) {
  const { node, updateAttributes, selected, editor, getPos } = props;
  const [isResizing, setIsResizing] = React.useState(false);
  const [resizeHandle, setResizeHandle] = React.useState<'se' | 'sw' | 'ne' | 'nw' | null>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const startSize = React.useRef({
    width: 0,
    height: 0,
    mouseX: 0,
    mouseY: 0,
    aspectRatio: 1
  });
  const alignment = typeof node.attrs['data-align'] === 'string' ? node.attrs['data-align'] : null;

  const ensureSelection = React.useCallback(() => {
    if (!editor || editor.isDestroyed || typeof getPos !== 'function') {
      return;
    }

    try {
      const position = getPos();
      if (typeof position === 'number') {
        editor.chain().focus().setNodeSelection(position).run();
      }
    } catch (error) {
      console.warn('Image resize selection error:', error);
    }
  }, [editor, getPos]);

  const handleMouseDown = (e: React.MouseEvent, handle: 'se' | 'sw' | 'ne' | 'nw') => {
    e.preventDefault();
    e.stopPropagation();

    if (!imgRef.current) return;

    ensureSelection();

    const rect = imgRef.current.getBoundingClientRect();
    const naturalWidth = imgRef.current.naturalWidth || rect.width;
    const naturalHeight = imgRef.current.naturalHeight || rect.height || 1;
    const aspectRatio = naturalHeight ? naturalHeight / naturalWidth : 1;

    startSize.current = {
      width: rect.width,
      height: rect.height,
      mouseX: e.clientX,
      mouseY: e.clientY,
      aspectRatio: Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1
    };

    console.log('Starting resize with:', startSize.current);

    setIsResizing(true);
    setResizeHandle(handle);
  };

  React.useEffect(() => {
    if (!isResizing) return;

    console.log('Resize started, handle:', resizeHandle);
    let finalWidth = startSize.current.width;
    let finalHeight = startSize.current.height;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!imgRef.current || !resizeHandle) return;

      const isEastHandle = resizeHandle === 'se' || resizeHandle === 'ne';
      const deltaX = isEastHandle
        ? e.clientX - startSize.current.mouseX
        : startSize.current.mouseX - e.clientX;

      const minWidth = 80;
      const maxWidth = Math.max(startSize.current.width * 2, imgRef.current.parentElement?.clientWidth ?? startSize.current.width * 2);
      const proposedWidth = startSize.current.width + deltaX;
      const constrainedWidth = Math.min(Math.max(proposedWidth, minWidth), maxWidth);
      const newWidth = Number.isFinite(constrainedWidth) ? constrainedWidth : startSize.current.width;
      const newHeight = Math.round(newWidth * startSize.current.aspectRatio * 100) / 100;

      // Store final dimensions
      finalWidth = newWidth;
      finalHeight = newHeight;

      // Update DOM directly during drag for visual feedback.
      // Use setProperty with 'important' priority because editor CSS sets
      // width/height to auto with !important and would otherwise override
      // inline styles.
      if (imgRef.current) {
        imgRef.current.style.setProperty('width', `${newWidth}px`, 'important');
        imgRef.current.style.setProperty('aspect-ratio', `${newWidth} / ${newHeight}`, 'important');
        imgRef.current.style.setProperty('height', 'auto', 'important');
        imgRef.current.style.setProperty('max-width', '100%', 'important');
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Resize ended, saving final size:', finalWidth, 'x', finalHeight);

      // Update TipTap node with new width and height as separate attributes.
      // When the node re-renders inside the editor the CSS rule in
      // `editor.css` uses `!important`, so persist a style string that
      // also includes `!important` to ensure the editor preview matches
      // the visual state.
      updateAttributes({
        width: finalWidth,
        height: finalHeight,
        style: `width: ${finalWidth}px !important; height: auto !important; aspect-ratio: ${finalWidth} / ${finalHeight} !important; max-width: 100% !important;`,
      });

      setIsResizing(false);
      setResizeHandle(null);
    };

    // Use capture phase to ensure we get the events before the editor
    document.addEventListener('mousemove', handleMouseMove, { capture: true });
    document.addEventListener('mouseup', handleMouseUp, { capture: true });

    return () => {
      document.removeEventListener('mousemove', handleMouseMove, { capture: true });
      document.removeEventListener('mouseup', handleMouseUp, { capture: true });
    };
  }, [isResizing, resizeHandle, updateAttributes]);

  const src = node.attrs.src as string;
  const alt = (node.attrs.alt as string) || '';
  // node.attrs.style exists but we keep style handling centralized in the
  // NodeView effects; we don't use the raw style string variable here.
  const width = node.attrs.width;
  const height = node.attrs.height;

  React.useEffect(() => {
    if (!imgRef.current) return;

    // Apply width and height from attributes if they exist. Use
    // setProperty with 'important' so editor stylesheet rules don't
    // override the inline sizing.
    if (width) {
      imgRef.current.style.setProperty('width', `${width}px`, 'important');
      imgRef.current.style.setProperty('max-width', '100%', 'important');
      
      if (height) {
        imgRef.current.style.setProperty('aspect-ratio', `${width} / ${height}`, 'important');
        imgRef.current.style.setProperty('height', 'auto', 'important');
      } else {
        imgRef.current.style.setProperty('height', 'auto', 'important');
      }
    } else {
      imgRef.current.style.removeProperty('width');
      imgRef.current.style.removeProperty('height');
      imgRef.current.style.removeProperty('aspect-ratio');
    }
  }, [width, height]);

  React.useEffect(() => {
    if (!imgRef.current) return;

    if (alignment) {
      imgRef.current.setAttribute('data-align', alignment);
    } else {
      imgRef.current.removeAttribute('data-align');
    }
  }, [alignment]);


  const wrapperClassName = `editor-image-wrapper relative ${selected || isResizing ? 'ring-2 ring-violet-500 ring-offset-2 rounded' : ''} ${isResizing ? 'is-resizing' : ''}`;
  const showHandles = selected || isResizing;

  return (
    <NodeViewWrapper
      className={wrapperClassName}
      data-align={alignment ?? undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="h-auto rounded-lg block editor-image"
        data-original-width={node.attrs['data-original-width']}
        data-original-height={node.attrs['data-original-height']}
        data-align={alignment ?? undefined}
        data-width={width}
        data-height={height}
        draggable={false}
      />

      {showHandles && (
        <>
          <div
            onMouseDown={(e) => handleMouseDown(e, 'nw')}
            className="image-resize-handle top-0 left-0 cursor-nw-resize"
            contentEditable={false}
            role="presentation"
            style={{ transform: 'translate(-50%, -50%)', pointerEvents: 'auto' }}
            data-drag-handle
          />
          <div
            onMouseDown={(e) => handleMouseDown(e, 'ne')}
            className="image-resize-handle top-0 right-0 cursor-ne-resize"
            contentEditable={false}
            role="presentation"
            style={{ transform: 'translate(50%, -50%)', pointerEvents: 'auto' }}
            data-drag-handle
          />
          <div
            onMouseDown={(e) => handleMouseDown(e, 'sw')}
            className="image-resize-handle bottom-0 left-0 cursor-sw-resize"
            contentEditable={false}
            role="presentation"
            style={{ transform: 'translate(-50%, 50%)', pointerEvents: 'auto' }}
            data-drag-handle
          />
          <div
            onMouseDown={(e) => handleMouseDown(e, 'se')}
            className="image-resize-handle bottom-0 right-0 cursor-se-resize"
            contentEditable={false}
            role="presentation"
            style={{ transform: 'translate(50%, 50%)', pointerEvents: 'auto' }}
            data-drag-handle
          />
        </>
      )}
    </NodeViewWrapper>
  );
}

export const CustomImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const width = element.getAttribute('data-width') || element.getAttribute('width') || element.style.width;
          return width ? parseFloat(String(width).replace(/px\s*$/i, '')) : null;
        },
        renderHTML: (attributes: ImageAttributes) => {
          if (!attributes.width) return {};
          return {
            'data-width': attributes.width,
          };
        },
      },
      height: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const height = element.getAttribute('data-height') || element.getAttribute('height') || element.style.height;
          return height ? parseFloat(String(height).replace(/px\s*$/i, '')) : null;
        },
        renderHTML: (attributes: ImageAttributes) => {
          if (!attributes.height) return {};
          return {
            'data-height': attributes.height,
          };
        },
      },
      'data-align': {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-align'),
        renderHTML: (attributes: ImageAttributes) => {
          if (!attributes['data-align']) {
            return {};
          }
          return {
            'data-align': attributes['data-align'],
          };
        },
      },
      'data-original-width': {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-original-width'),
        renderHTML: (attributes: ImageAttributes) => {
          if (!attributes['data-original-width']) {
            return {};
          }
          return {
            'data-original-width': attributes['data-original-width'],
          };
        },
      },
      'data-original-height': {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-original-height'),
        renderHTML: (attributes: ImageAttributes) => {
          if (!attributes['data-original-height']) {
            return {};
          }
          return {
            'data-original-height': attributes['data-original-height'],
          };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});
