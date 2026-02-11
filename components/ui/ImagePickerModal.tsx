'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { showToast } from './Toast';
import { ConfirmModal } from './ConfirmModal';

interface ImageFile {
  url: string;
  filename: string;
  size?: number;
  uploadedAt?: string;
  key?: string;
}

interface ImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectImage: (imageUrl: string) => void;
  title?: string;
  allowUpload?: boolean;
}

const FALLBACK_MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const inferMimeFromFilename = (name: string): string => {
  const lower = name.toLowerCase();
  for (const [ext, mime] of Object.entries(FALLBACK_MIME_BY_EXTENSION)) {
    if (lower.endsWith(ext)) {
      return mime;
    }
  }
  return '';
};

const imageIdentifier = (file: ImageFile) => file.key ?? file.url;

const formatBytes = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  if (value === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const num = value / Math.pow(1024, exponent);
  return `${num.toFixed(num >= 10 ? 0 : 1)} ${units[exponent]}`;
};

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export function ImagePickerModal({
  isOpen,
  onClose,
  onSelectImage,
  title = 'Select Image',
  allowUpload = true,
}: ImagePickerModalProps) {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageFile | null>(null);
  const [selectedDimensions, setSelectedDimensions] = useState<{ width: number; height: number } | null>(null);
  const [dimensionsLoading, setDimensionsLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState<string | null>(null);
  const confirmResolver = useRef<((value: boolean) => void) | null>(null);

  const fetchRequestIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const isFetchingRef = useRef(false);
  const activeFetchControllerRef = useRef<AbortController | null>(null);
  const isOpenRef = useRef(isOpen);
  const imagesRef = useRef<ImageFile[]>([]);

  const resetState = useCallback(() => {
    activeFetchControllerRef.current?.abort();
    activeFetchControllerRef.current = null;
    fetchRequestIdRef.current = 0;
    dragCounterRef.current = 0;
    isFetchingRef.current = false;
    imagesRef.current = [];
    setImages([]);
    setSelectedImage(null);
    setSelectedDimensions(null);
    setDimensionsLoading(false);
    setNextCursor(null);
    setHasMore(false);
    setDragActive(false);
    setSearchInput('');
    setSearchQuery('');
    setUploading(false);
    setLoading(false);
    setLoadingMore(false);
    setShowDetails(false);
    setDeleting(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const fetchImages = useCallback(
    async (cursorParam: string | null = null, reset: boolean = false, force = false) => {
      if (!isOpenRef.current) return;
      if (isFetchingRef.current && !force) return;

      if (force && isFetchingRef.current && activeFetchControllerRef.current) {
        activeFetchControllerRef.current.abort();
        activeFetchControllerRef.current = null;
        isFetchingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }

      const controller = new AbortController();
      activeFetchControllerRef.current = controller;
      const requestId = Date.now();
      fetchRequestIdRef.current = requestId;
      isFetchingRef.current = true;
      const isAppending = Boolean(cursorParam) && !reset;
      if (isAppending) {
        setLoadingMore(true);
      } else if (reset || imagesRef.current.length === 0) {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        params.set('limit', '20');
        if (cursorParam) {
          params.set('cursor', cursorParam);
        }
        if (searchQuery) {
          params.set('search', searchQuery);
        }

        const response = await fetch(`/api/admin/file/list?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch images: ${response.status}`);
        }

        const data = await response.json();
        if (fetchRequestIdRef.current !== requestId) {
          return;
        }

        const newImages: ImageFile[] = Array.isArray(data.files) ? data.files : [];
        const next = data.pagination?.nextCursor ?? null;

        setNextCursor(next);
        setHasMore(Boolean(next));

        if (reset) {
          setImages(newImages);
          imagesRef.current = newImages;
          setSelectedImage((previous) => {
            if (!newImages.length) return null;
            if (previous) {
              const previousId = imageIdentifier(previous);
              const existing = newImages.find((item) => imageIdentifier(item) === previousId);
              if (existing) {
                return existing;
              }
            }
            return newImages[0];
          });
        } else if (newImages.length) {
          setImages((prev) => {
            if (!prev.length) {
              imagesRef.current = newImages;
              return newImages;
            }
            const existingIds = new Set(prev.map(imageIdentifier));
            const deduped = newImages.filter((item) => !existingIds.has(imageIdentifier(item)));
            if (!deduped.length) {
              imagesRef.current = prev;
              return prev;
            }
            const merged = [...prev, ...deduped];
            imagesRef.current = merged;
            return merged;
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (process.env.NODE_ENV !== 'production') {
          console.error('Failed to fetch images:', error);
        }
      } finally {
        if (fetchRequestIdRef.current === requestId) {
          if (isAppending) {
            setLoadingMore(false);
          } else {
            setLoading(false);
          }
          isFetchingRef.current = false;
          if (activeFetchControllerRef.current === controller) {
            activeFetchControllerRef.current = null;
          }
        }
      }
    },
    [searchQuery],
  );

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      if (!allowUpload || !files.length || uploading) return;

      setUploading(true);

      try {
        let uploadedAny = false;
        for (const file of Array.from(files)) {
          const detectedType = typeof file.type === 'string' && file.type.startsWith('image/')
            ? file.type
            : inferMimeFromFilename(file.name);

          if (!detectedType || !detectedType.startsWith('image/')) {
            continue;
          }

          const response = await fetch('/api/admin/file/upload', {
            method: 'POST',
            headers: {
              'x-filename': file.name,
              'x-mimetype': detectedType,
              'x-upload-scope': 'file',
            },
            body: file,
          });

          if (!response.ok) {
            throw new Error(`Upload failed with status ${response.status}`);
          }

          uploadedAny = true;
        }

        if (uploadedAny) {
          await fetchImages(null, true, true);
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Upload failed:', error);
        }
      } finally {
        setUploading(false);
      }
    },
    [allowUpload, fetchImages, uploading],
  );

  const handleDrag = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!allowUpload) return;

      event.preventDefault();
      event.stopPropagation();

      if (event.type === 'dragenter') {
        dragCounterRef.current += 1;
        setDragActive(true);
      } else if (event.type === 'dragover') {
        setDragActive(true);
      } else if (event.type === 'dragleave') {
        dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
        if (dragCounterRef.current === 0) {
          setDragActive(false);
        }
      }
    },
    [allowUpload],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!allowUpload) return;

      event.preventDefault();
      event.stopPropagation();
      dragCounterRef.current = 0;
      setDragActive(false);

      if (event.dataTransfer?.files?.length) {
        void handleUpload(event.dataTransfer.files);
      }
    },
    [allowUpload, handleUpload],
  );

  const handleFileSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!allowUpload) return;
      if (event.target.files?.length) {
        void handleUpload(event.target.files);
      }
    },
    [allowUpload, handleUpload],
  );

  const handleImageClick = useCallback((image: ImageFile) => {
    setSelectedImage(image);
  }, []);

  const handleInsertImage = useCallback(
    (image?: ImageFile | null) => {
      const target = image ?? selectedImage;
      if (!target) return;
      onSelectImage(target.url);
      handleClose();
    },
    [handleClose, onSelectImage, selectedImage],
  );

  const toggleDetailsPanel = useCallback(() => {
    setShowDetails((previous) => !previous);
  }, []);

  const handleDeleteImage = useCallback(async () => {
    if (!selectedImage) return;
    const { key, filename } = selectedImage;
    if (!key) {
      showToast('Cannot delete this image (missing key reference).', 'error');
      return;
    }

    // Confirmation guard to avoid accidental removals (modal instead of window.confirm).
    const askConfirm = (): Promise<boolean> => {
      setConfirmText(`Delete “${filename}”?`);
      setConfirmOpen(true);
      return new Promise<boolean>((resolve) => {
        confirmResolver.current = resolve;
      });
    };

    const confirmed = typeof window === 'undefined' ? true : await askConfirm();
    if (!confirmed) {
      setConfirmOpen(false);
      confirmResolver.current = null;
      return;
    }

    setDeleting(true);
    const targetId = imageIdentifier(selectedImage);

    try {
      const response = await fetch('/api/admin/file/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key }),
      });

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      showToast('Image deleted', 'success');

      setImages((prev) => {
        const filtered = prev.filter((item) => imageIdentifier(item) !== targetId);
        imagesRef.current = filtered;
        return filtered;
      });

      setSelectedImage((prev) => {
        if (!prev) return prev;
        return imageIdentifier(prev) === targetId ? null : prev;
      });

      await fetchImages(null, true, true);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to delete image:', error);
      }
      showToast('Failed to delete image', 'error');
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
      confirmResolver.current = null;
    }
  }, [fetchImages, selectedImage]);

  const handleCopyImageUrl = useCallback(async () => {
    if (!selectedImage?.url) return;
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      showToast('Copy not supported in this browser', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedImage.url);
      showToast('Image URL copied', 'success');
    } catch {
      showToast('Failed to copy image URL', 'error');
    }
  }, [selectedImage]);

  // Confirm modal handlers for image deletion
  const handleConfirmClose = () => {
    if (confirmResolver.current) confirmResolver.current(false);
    setConfirmOpen(false);
    setConfirmText(null);
    confirmResolver.current = null;
  };

  const handleConfirm = () => {
    if (confirmResolver.current) confirmResolver.current(true);
    // don't close here; keep modal open while deletion runs
  };

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) {
      activeFetchControllerRef.current?.abort();
      activeFetchControllerRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      activeFetchControllerRef.current?.abort();
      activeFetchControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const updateLayout = () => {
      setIsMobileLayout(mediaQuery.matches);
    };

    updateLayout();
    mediaQuery.addEventListener('change', updateLayout);
    return () => mediaQuery.removeEventListener('change', updateLayout);
  }, []);

  useEffect(() => {
    if (!isMobileLayout) {
      setShowDetails(true);
      return;
    }

    if (!selectedImage) {
      setShowDetails(false);
    }
  }, [isMobileLayout, selectedImage]);

  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  useEffect(() => {
    if (!isOpen) return;
    const timeout = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [isOpen, searchInput]);

  useEffect(() => {
    if (!isOpen) return;
    fetchImages(null, true, true);
  }, [isOpen, searchQuery, fetchImages]);

  useEffect(() => {
    if (!selectedImage) {
      setSelectedDimensions(null);
      setDimensionsLoading(false);
      return;
    }

    let cancelled = false;
    setDimensionsLoading(true);

    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) {
        setSelectedDimensions({ width: img.naturalWidth, height: img.naturalHeight });
        setDimensionsLoading(false);
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setSelectedDimensions(null);
        setDimensionsLoading(false);
      }
    };
    img.src = selectedImage.url;

    return () => {
      cancelled = true;
    };
  }, [selectedImage]);

  if (!isOpen) return null;

  const selectedSizeLabel = formatBytes(selectedImage?.size);
  const selectedUploadedLabel = formatDateTime(selectedImage?.uploadedAt);
  const selectedDimensionsLabel = selectedImage
    ? dimensionsLoading
      ? 'Loading…'
      : selectedDimensions
        ? `${selectedDimensions.width} × ${selectedDimensions.height}px`
        : 'Unavailable'
    : '—';

  const detailsPanelContent = selectedImage ? (
    <div className="flex h-full w-full flex-col gap-4 overflow-x-hidden">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
        <Image
          src={selectedImage.url}
          alt={selectedImage.filename}
          width={360}
          height={360}
          className="h-full w-full object-contain"
          unoptimized
        />
      </div>
  <div className="min-h-[150px] w-full space-y-3 overflow-x-hidden text-sm text-neutral-600 dark:text-neutral-300">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-400">Filename</p>
          <p className="break-all text-neutral-900 dark:text-neutral-100">{selectedImage.filename}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-400">Dimensions</p>
          <p>{selectedDimensionsLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-400">File size</p>
          <p>{selectedSizeLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-400">Uploaded</p>
          <p>{selectedUploadedLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-400">Direct URL</p>
          <button
            type="button"
            onClick={handleCopyImageUrl}
            className="mt-1 inline-flex w-full min-w-0 items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 transition hover:border-violet-400 hover:text-violet-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-violet-500 dark:hover:text-violet-300 dark:focus-visible:ring-offset-neutral-900"
            title={selectedImage.url}
          >
            <span className="flex-1 truncate text-left font-mono text-[11px]">{selectedImage.url}</span>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16h8M8 12h8m-5-8h5a2 2 0 012 2v12a2 2 0 01-2 2h-5M9 20H7a2 2 0 01-2-2V6a2 2 0 012-2h2" />
            </svg>
          </button>
        </div>
      </div>
      {/* Delete button moved to modal footers (desktop aside/footer or mobile details footer) to avoid overlap */}
    </div>
  ) : (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center text-sm text-neutral-500 dark:text-neutral-400">
      <svg className="h-10 w-10 text-neutral-300 dark:text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h4.5a1 1 0 01.8.4l1.4 1.8a1 1 0 00.8.4H19a2 2 0 012 2v9a2 2 0 01-2 2h-5l-2 2-2-2H5a2 2 0 01-2-2V5z" />
      </svg>
      <p>Select an image to preview its details.</p>
    </div>
  );

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      <div className="relative flex h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-neutral-900 sm:h-auto sm:max-h-[85vh] mx-4">
        {allowUpload && dragActive && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="mx-8 w-full max-w-3xl rounded-2xl border-2 border-dashed border-violet-400 bg-violet-600/20 px-8 py-12 text-center text-violet-50 backdrop-blur-sm">
              <p className="text-lg font-semibold tracking-tight">Drop images to upload</p>
              <p className="mt-2 text-sm text-violet-50/80">Your files will start uploading immediately.</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-b border-neutral-200 p-4 sm:p-5 dark:border-neutral-700">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <span className="sr-only">Close</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-4 border-b border-neutral-200 p-4 sm:p-5 dark:border-neutral-700">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 min-w-0">
              <span className="sr-only">Search images</span>
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search images by name"
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-800 outline-none transition focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-violet-400 dark:focus:ring-violet-800/40"
              />
            </div>
            <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end sm:gap-3">
              {isMobileLayout && selectedImage ? (
                <button
                  type="button"
                  onClick={toggleDetailsPanel}
                  aria-expanded={showDetails}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 transition hover:border-violet-400 hover:text-violet-600 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-violet-500 dark:hover:text-violet-300"
                >
                  <svg
                    className={`h-4 w-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                  </svg>
                  {showDetails ? 'Hide details' : 'Show details'}
                </button>
              ) : null}

              {allowUpload ? (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Upload images
                  </button>
                  <p className="w-full text-xs text-neutral-500 dark:text-neutral-400 sm:w-auto sm:text-right">
                    Drag &amp; drop anywhere inside this window
                  </p>
                </>
              ) : null}
            </div>
          </div>

          {allowUpload && (
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          )}

          {uploading && (
            <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-300">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V2C5.373 2 0 7.373 0 14h4z" />
              </svg>
              Uploading images…
            </div>
          )}
        </div>

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {images.length === 0 && !loading ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-neutral-500 dark:text-neutral-400">
                <svg className="h-10 w-10 text-neutral-300 dark:text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h4.5a1 1 0 01.8.4l1.4 1.8a1 1 0 00.8.4H19a2 2 0 012 2v9a2 2 0 01-2 2h-5l-2 2-2-2H5a2 2 0 01-2-2V5z" />
                </svg>
                <div>
                  {searchQuery ? (
                    <p>No images found for “{searchQuery}”.</p>
                  ) : (
                    <p>No images found yet. Upload something to get started.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
                {images.map((image) => {
                  const isSelected = selectedImage && imageIdentifier(selectedImage) === imageIdentifier(image);
                  return (
                    <button
                      type="button"
                      key={imageIdentifier(image)}
                      onClick={() => handleImageClick(image)}
                      onDoubleClick={() => handleInsertImage(image)}
                      className={`group relative aspect-square overflow-hidden rounded-lg border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 ${
                        isSelected
                          ? 'border-violet-500 ring-2 ring-violet-500 ring-offset-2 ring-offset-white dark:ring-offset-neutral-900'
                          : 'border-neutral-200 hover:border-violet-400 dark:border-neutral-700 dark:hover:border-violet-500'
                      }`}
                      title={image.filename}
                    >
                      <Image
                        src={image.url}
                        alt={image.filename}
                        width={320}
                        height={320}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/25" />
                      <div className="absolute inset-x-0 bottom-0 flex items-center bg-black/60 px-2 py-1 text-xs text-white">
                        <span className="truncate">{image.filename}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center py-8">
                <svg className="h-6 w-6 animate-spin text-violet-600" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V2C5.373 2 0 7.373 0 14h4z" />
                </svg>
              </div>
            )}

            {hasMore && nextCursor && images.length > 0 && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => fetchImages(nextCursor, false)}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-violet-400 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-violet-500 dark:hover:text-violet-300"
                >
                  {loadingMore ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V2C5.373 2 0 7.373 0 14h4z" />
                      </svg>
                      Loading…
                    </>
                  ) : (
                    'Load more images'
                  )}
                </button>
              </div>
            )}
          </div>

          <aside className="hidden lg:flex lg:w-80 lg:flex-shrink-0 lg:flex-col lg:border-l lg:border-neutral-200 lg:bg-white/90 lg:text-sm lg:text-neutral-600 dark:lg:border-neutral-800 dark:lg:bg-neutral-900/60 dark:lg:text-neutral-300">
            <div className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
              <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Image details</h4>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {detailsPanelContent}
            </div>
            <div className="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
              <button
                type="button"
                onClick={handleDeleteImage}
                disabled={deleting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20 dark:focus-visible:ring-offset-neutral-900"
              >
                {deleting ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V2C5.373 2 0 7.373 0 14h4z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
                {deleting ? 'Deleting…' : 'Delete image'}
              </button>
            </div>
          </aside>
        </div>

        {isMobileLayout ? (
          <>
            {showDetails ? (
              <button
                type="button"
                onClick={toggleDetailsPanel}
                className="fixed inset-0 z-[60] cursor-pointer bg-black/20 focus:outline-none"
                aria-label="Close image details"
              />
            ) : null}
            <aside
              className={`fixed inset-x-0 bottom-0 z-[70] transform overflow-hidden bg-white shadow-2xl transition-transform duration-200 ease-in-out dark:bg-neutral-900 ${
                showDetails ? 'translate-y-0' : 'translate-y-full'
              }`}
            >
              <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
                <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Image details</h4>
                <button
                  type="button"
                  onClick={toggleDetailsPanel}
                  className="rounded-md p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                >
                  <span className="sr-only">Close details</span>
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden p-5">
                {detailsPanelContent}
              </div>
              <div className="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={handleDeleteImage}
                  disabled={deleting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20 dark:focus-visible:ring-offset-neutral-900"
                >
                  {deleting ? (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V2C5.373 2 0 7.373 0 14h4z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                  {deleting ? 'Deleting…' : 'Delete image'}
                </button>
              </div>
            </aside>
          </>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
          <div>Double-click a thumbnail to insert it immediately.</div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-neutral-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleInsertImage()}
              disabled={!selectedImage}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                selectedImage
                  ? 'bg-violet-600 text-white hover:bg-violet-700 focus-visible:ring-violet-500'
                  : 'cursor-not-allowed bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500'
              }`}
            >
              Insert image
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const combined = (
    <>
      {modal}
      <ConfirmModal
        isOpen={confirmOpen}
        title="Confirm delete"
        description={confirmText ?? ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleting}
        onClose={handleConfirmClose}
        onConfirm={handleConfirm}
      />
    </>
  );

  return typeof document !== 'undefined' ? createPortal(combined, document.body) : modal;
}