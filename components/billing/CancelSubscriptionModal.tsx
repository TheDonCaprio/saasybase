'use client';

import { useEffect } from 'react';

interface CancelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  loading?: boolean;
}

export function CancelSubscriptionModal({ isOpen, onClose, onConfirm, loading = false }: CancelModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, loading]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-neutral-800">
          <h2 className="text-lg font-semibold text-white">Cancel Subscription</h2>
          <button onClick={onClose} disabled={loading} className="text-neutral-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-sm text-neutral-300">Are you sure you want to cancel your subscription?</div>
          <div className="text-xs text-neutral-400">If this is a recurring subscription, it will be scheduled to cancel at the end of the current billing period. You will retain access until then.</div>
        </div>

        <div className="flex gap-3 p-6 pt-0">
          <button onClick={onClose} disabled={loading} className="flex-1 px-4 py-2 border border-neutral-700 text-neutral-300 rounded hover:bg-neutral-800 transition-colors disabled:opacity-50">
            Close
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Cancelling...
              </div>
            ) : (
              'Confirm Cancel'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
