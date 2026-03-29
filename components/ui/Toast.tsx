'use client';

import { useState, useEffect } from 'react';

let toastSequence = 0;

function createToastId() {
  toastSequence += 1;
  return `${Date.now()}-${toastSequence}`;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  createdAt: number;
}

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const useToast = (): ToastContextType => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = createToastId();
    const newToast = { id, message, type, createdAt: Date.now() };

    setToasts(prev => {
      const now = Date.now();
      const normalized = message.trim().toLowerCase();
      const isDemoReadOnly = normalized.includes('demo mode is read-only');
      const hasRecentDuplicate = prev.some((toast) => {
        const toastMsg = toast.message.trim().toLowerCase();
        const ageMs = now - toast.createdAt;
        if (isDemoReadOnly) {
          return toastMsg.includes('demo mode is read-only') && ageMs < 2500;
        }
        return toastMsg === normalized && ageMs < 1500;
      });
      if (hasRecentDuplicate) return prev;
      return [...prev, newToast];
    });

    // Auto remove after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // keep removeToast referenced in this scope to avoid unused var lint in some builds
  void removeToast;

  // Render toasts
  useEffect(() => {
    if (toasts.length === 0) return;

    const container = document.getElementById('toast-container');
    if (!container) {
      const toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.className = 'fixed top-4 right-4 z-[100000] space-y-2';
      document.body.appendChild(toastContainer);
    }

    return () => {
      // Clean up empty container
      const container = document.getElementById('toast-container');
      if (container && toasts.length === 0) {
        container.remove();
      }
    };
  }, [toasts]);

  return { showToast };
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    // Listen for custom toast events
    const handleToast = (event: CustomEvent) => {
      const { message, type } = event.detail;
      const id = createToastId();
      const newToast = { id, message, type, createdAt: Date.now() };

      setToasts(prev => {
        const now = Date.now();
        const normalized = String(message ?? '').trim().toLowerCase();
        const isDemoReadOnly = normalized.includes('demo mode is read-only');
        const hasRecentDuplicate = prev.some((toast) => {
          const toastMsg = toast.message.trim().toLowerCase();
          const ageMs = now - toast.createdAt;
          if (isDemoReadOnly) {
            return toastMsg.includes('demo mode is read-only') && ageMs < 2500;
          }
          return toastMsg === normalized && ageMs < 1500;
        });
        if (hasRecentDuplicate) return prev;
        return [...prev, newToast];
      });

      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 5000);
    };

    window.addEventListener('show-toast', handleToast as EventListener);
    return () => window.removeEventListener('show-toast', handleToast as EventListener);
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100000] space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`max-w-sm rounded border p-4 shadow-lg animate-in slide-in-from-right-full duration-300 ${toast.type === 'success'
            ? 'bg-emerald-600 border-emerald-700 text-white dark:bg-emerald-600 dark:border-emerald-500 dark:text-white'
            : toast.type === 'error'
              ? 'bg-red-50 border-red-300 text-red-900 dark:bg-red-900/90 dark:border-red-700 dark:text-red-100'
              : 'bg-blue-600 border-blue-700 text-white dark:bg-blue-900/90 dark:border-blue-700 dark:text-blue-100'
            }`}
        >
          <div className="flex justify-between items-start gap-3">
            <div className="text-sm">{toast.message}</div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-current opacity-70 hover:opacity-100 transition-opacity"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Helper function to show toast from anywhere
export const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  const event = new CustomEvent('show-toast', { detail: { message, type } });
  window.dispatchEvent(event);
};
