'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';

interface CroppedArea {
  width: number;
  height: number;
  x: number;
  y: number;
}

interface ImageEditorModalProps {
  open: boolean;
  imageUrl: string;
  filename: string;
  mimeType: string;
  onCancel: () => void;
  onConfirm: (result: { blob: Blob; width: number; height: number; mimeType: string; filename: string }) => void | Promise<void>;
}

const SUPPORTED_EXPORT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type AspectMode = 'original' | 'square' | 'landscape' | 'portrait';

const ASPECT_OPTIONS: Array<{ value: AspectMode; label: string; ratio?: number }> = [
  { value: 'original', label: 'Original image' },
  { value: 'square', label: 'Square 1:1', ratio: 1 },
  { value: 'landscape', label: 'Landscape 16:9', ratio: 16 / 9 },
  { value: 'portrait', label: 'Portrait 4:5', ratio: 4 / 5 }
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function getCroppedImage(
  imageSrc: string,
  crop: CroppedArea,
  mimeType: string,
  requestedWidth: number
): Promise<{ blob: Blob; width: number; height: number }> {
  const image = await loadImage(imageSrc);
  const outputType = SUPPORTED_EXPORT_TYPES.has(mimeType) ? mimeType : 'image/jpeg';

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  const sourceWidth = crop.width * scaleX;
  const sourceHeight = crop.height * scaleY;
  
  // Calculate output dimensions - avoid scaling up to prevent blurriness
  const maxOutputWidth = Math.min(requestedWidth, sourceWidth);
  const outputWidth = Math.max(32, Math.round(maxOutputWidth));
  const outputHeight = Math.max(32, Math.round((sourceHeight / sourceWidth) * outputWidth));

  // Use higher resolution canvas for better quality when scaling down
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const canvasWidth = outputWidth * pixelRatio;
  const canvasHeight = outputHeight * pixelRatio;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  canvas.style.width = `${outputWidth}px`;
  canvas.style.height = `${outputHeight}px`;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context unavailable.');
  }

  // Scale context for high DPI rendering
  ctx.scale(pixelRatio, pixelRatio);

  // Optimize rendering for quality
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputWidth,
    outputHeight
  );

  // Use maximum quality for output
  const quality = outputType === 'image/jpeg' ? 1.0 : undefined;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((value) => resolve(value), outputType, quality)
  );

  if (!blob) {
    throw new Error('Failed to generate edited image.');
  }

  return { blob, width: outputWidth, height: outputHeight };
}

export function ImageEditorModal({ open, imageUrl, filename, mimeType, onCancel, onConfirm }: ImageEditorModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState<CroppedArea | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [requestedWidth, setRequestedWidth] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aspectMode, setAspectMode] = useState<AspectMode>('original');
  const [widthManuallyAdjusted, setWidthManuallyAdjusted] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedPixels(null);
    setRequestedWidth(null);
    setImageDimensions(null);
    setAspectMode('original');
    setWidthManuallyAdjusted(false);

    loadImage(imageUrl)
      .then((image) => {
        if (cancelled) return;
        setImageDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load image preview.');
      });

    return () => {
      cancelled = true;
    };
  }, [imageUrl, open]);

  useEffect(() => {
    if (!open) return;
    if (!imageDimensions) return;
    if (widthManuallyAdjusted) return;
    const width = imageDimensions.width;
    if (!Number.isFinite(width) || width <= 0) return;
    setRequestedWidth((current) => {
      if (current !== null) return current;
      return clamp(Math.round(width), 64, 4096);
    });
  }, [open, imageDimensions, widthManuallyAdjusted]);

  useEffect(() => {
    if (!open) return;
    if (!croppedPixels || !Number.isFinite(croppedPixels.width) || croppedPixels.width <= 1) return;
    if (widthManuallyAdjusted) return;
    const nextWidth = clamp(Math.round(croppedPixels.width), 64, 4096);
    setRequestedWidth(nextWidth);
  }, [croppedPixels, open, widthManuallyAdjusted]);

  const widthLimits = useMemo(() => {
    const fallbackWidth = (() => {
      if (imageDimensions && Number.isFinite(imageDimensions.width) && imageDimensions.width > 0) {
        return Math.round(imageDimensions.width);
      }
      return 1024;
    })();

    const baseWidth = (() => {
      if (croppedPixels && Number.isFinite(croppedPixels.width) && croppedPixels.width > 1) {
        return Math.round(croppedPixels.width);
      }
      return fallbackWidth;
    })();

    const clampedBase = clamp(baseWidth, 64, 4096);
    const max = Math.max(128, clampedBase);

    return {
      min: 64,
      max,
      defaultValue: clampedBase
    };
  }, [croppedPixels, imageDimensions]);

  const aspectValue = useMemo(() => {
    switch (aspectMode) {
      case 'square':
        return 1;
      case 'landscape':
        return 16 / 9;
      case 'portrait':
        return 4 / 5;
      case 'original': {
        if (!imageDimensions || imageDimensions.height <= 0) return undefined;
        const ratio = imageDimensions.width / imageDimensions.height;
        return Number.isFinite(ratio) && ratio > 0 ? ratio : undefined;
      }
      default:
        return undefined;
    }
  }, [aspectMode, imageDimensions]);

  const widthMin = widthLimits.min;
  const widthMax = widthLimits.max;
  const widthDefault = widthLimits.defaultValue;
  const sliderMax = Math.max(widthMin, widthMax);
  const normalizedWidth = useMemo(() => {
    const raw = typeof requestedWidth === 'number' && Number.isFinite(requestedWidth) ? requestedWidth : widthDefault;
    return clamp(raw, widthMin, sliderMax);
  }, [requestedWidth, sliderMax, widthDefault, widthMin]);

  const handleConfirm = useCallback(async () => {
    if (!open || !croppedPixels) return;
    try {
      setSubmitting(true);
      setError(null);
      const { blob, width, height } = await getCroppedImage(imageUrl, croppedPixels, mimeType, normalizedWidth);
      await onConfirm({ blob, width, height, mimeType, filename });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to process image.');
    } finally {
      setSubmitting(false);
    }
  }, [open, croppedPixels, normalizedWidth, imageUrl, mimeType, filename, onConfirm]);

  const handleSkipCropping = useCallback(async () => {
    if (!open) return;
    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error('Failed to load original image.');
      }

      const blob = await response.blob();

      let width = imageDimensions?.width ?? 0;
      let height = imageDimensions?.height ?? 0;

      if (!width || !height) {
        const blobUrl = URL.createObjectURL(blob);
        try {
          const image = await loadImage(blobUrl);
          width = image.naturalWidth;
          height = image.naturalHeight;
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      }

      if (!width || !height) {
        throw new Error('Unable to determine original image dimensions.');
      }

      await onConfirm({ blob, width, height, mimeType, filename });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to process image.');
    } finally {
      setSubmitting(false);
    }
  }, [open, imageUrl, imageDimensions, mimeType, filename, onConfirm]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={() => (!submitting ? onCancel() : null)} />
      <div className="relative z-[121] w-full max-w-3xl rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Edit image</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Drag to crop, then adjust zoom and output width if needed.</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label="Close editor"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l8 8M6 14L14 6" />
            </svg>
          </button>
        </div>
        <div className="space-y-5 px-6 py-5">
          <div className="relative h-[360px] overflow-hidden rounded-xl border border-neutral-200 bg-neutral-900/5 dark:border-neutral-700 dark:bg-neutral-900">
            {error ? (
              <div className="flex h-full items-center justify-center text-sm text-red-500">{error}</div>
            ) : (
              <Cropper
                image={imageUrl}
                crop={crop}
                zoom={zoom}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_: Area, areaPixels: Area) => setCroppedPixels(areaPixels)}
                aspect={aspectValue}
                restrictPosition={false}
                showGrid={true}
                classes={{ containerClassName: 'bg-neutral-950/70 dark:bg-black/80' }}
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-2 text-sm text-neutral-700 dark:text-neutral-200">
              Aspect ratio
              <select
                value={aspectMode}
                onChange={(event) => {
                  const value = event.target.value as AspectMode;
                  setAspectMode(value);
                  setWidthManuallyAdjusted(false);
                }}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 transition focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                {ASPECT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-neutral-700 dark:text-neutral-200">
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  setZoom(value);
                }}
                className="w-full accent-violet-500"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-neutral-700 dark:text-neutral-200">
              Output width ({Math.round(normalizedWidth)} px)
              <input
                type="range"
                min={widthMin}
                max={sliderMax}
                step={1}
                value={normalizedWidth}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  setWidthManuallyAdjusted(true);
                  setRequestedWidth(value);
                }}
                className="w-full accent-violet-500"
                disabled={!croppedPixels}
              />
            </label>
          </div>

          <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <div>
              {croppedPixels && (
                <span>
                  Crop: {Math.round(croppedPixels.width)} × {Math.round(croppedPixels.height)} px
                </span>
              )}
              {imageDimensions && (
                <span className="ml-3">
                  Original: {imageDimensions.width} × {imageDimensions.height} px
                </span>
              )}
            </div>
            <div>MIME: {SUPPORTED_EXPORT_TYPES.has(mimeType) ? mimeType : `${mimeType} → JPEG`}</div>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-neutral-200 bg-neutral-50 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-950/40 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <button
              type="button"
              onClick={handleSkipCropping}
              disabled={submitting}
              className="w-full rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-violet-600 transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 dark:text-violet-300 dark:hover:bg-neutral-800/60 sm:w-auto"
            >
              Skip cropping
            </button>
            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>
          <div className="flex items-center gap-3 sm:ml-auto">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting || !croppedPixels}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
            >
              {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />}
              Save image
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImageEditorModal;
