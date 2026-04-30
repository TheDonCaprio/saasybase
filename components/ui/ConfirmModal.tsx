'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  // Optional children to render custom content inside the modal
  children?: React.ReactNode;
  // Optionally disable the confirm button (e.g. until checkbox checked)
  confirmDisabled?: boolean;
}

export function ConfirmModal({
  isOpen,
  title = 'Are you sure?',
  description = 'This action cannot be undone.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
  onClose,
  onConfirm
  ,
  children,
  confirmDisabled = false
}: ConfirmModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    if (!isOpen) return;
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[70000] flex min-h-screen items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/40 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/30">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-neutral-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 transition-colors hover:text-slate-700 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-white"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-slate-600 dark:text-neutral-300">{description}</p>
          {children}
        </div>

        <div className="flex gap-2.5 border-t border-slate-200 px-5 py-4 dark:border-neutral-800">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
            className={`flex-1 rounded-lg px-3.5 py-2 text-sm text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${loading || confirmDisabled ? 'bg-red-600/60' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Processing...
              </div>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
