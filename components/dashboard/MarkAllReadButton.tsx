"use client";

import { showToast } from '../ui/Toast';
import { useState } from 'react';
import Confirm from '../ui/Confirm';

export default function MarkAllReadButton({ onSuccess }: { onSuccess?: () => void }) {
  const [loading, setLoading] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const handle = async () => {
    if (loading) return;
    setConfirmOpen(true);
  };

  const doMarkAll = async () => {
    setConfirmOpen(false);
    setLoading(true);
    try {
      const res = await fetch('/api/notifications/mark-all-read', { method: 'POST' });
      if (res.ok) {
        showToast('All notifications marked as read', 'success');
        // Dispatch a custom event so client lists can update without a reload
        try {
          window.dispatchEvent(new CustomEvent('notifications:mark-all-read', { detail: { success: true } }));
        } catch {
          // ignore dispatch errors
        }
        if (onSuccess) onSuccess();
      } else if (res.status === 401) {
        showToast('You must be signed in to mark notifications read', 'error');
      } else {
        const json = await res.json().catch(() => ({}));
        showToast(json?.error || 'Failed to mark notifications', 'error');
      }
    } catch (e) {
      console.error('Error marking all read', e);
      void e;
      showToast('Error updating notifications', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <button
      onClick={handle}
      disabled={loading}
      aria-label="Mark all notifications as read"
      title="Mark all as read"
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-white hover:text-slate-800 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-200 dark:hover:bg-neutral-900"
    >
      {loading ? (
        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" strokeWidth="2" className="opacity-25" />
          <path d="M12 6v6l4 2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
  <span className="uppercase">Mark all read</span>
    </button>
    <Confirm
      open={confirmOpen}
      title="Mark all notifications as read"
      description="This will mark all your unread notifications as read. You can’t undo this action."
      confirmText="Mark all read"
      cancelText="Cancel"
      onConfirm={doMarkAll}
      onCancel={() => setConfirmOpen(false)}
    />
    </>
  );
}
