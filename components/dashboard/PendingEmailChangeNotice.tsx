'use client';

import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { showToast } from '../ui/Toast';

interface PendingEmailChangeNoticeProps {
  pendingEmail: string;
  expiresAt: string;
}

export function PendingEmailChangeNotice({ pendingEmail, expiresAt }: PendingEmailChangeNoticeProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-dashboard-page-header="true"]');
    if (!header?.parentElement) {
      setMountNode(null);
      return;
    }

    const container = document.createElement('div');
    container.setAttribute('data-pending-email-change-slot', 'true');
    container.className = 'mt-3 mb-2';
    header.insertAdjacentElement('afterend', container);
    setMountNode(container);

    return () => {
      container.remove();
      setMountNode(null);
    };
  }, []);

  const notice = (
    <div className="rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-2.5 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0 text-sm text-amber-900 dark:text-amber-100">
          <span className="font-semibold">Pending email change:</span>{' '}
          <span className="text-amber-800/90 dark:text-amber-100/85">
            Confirm the email sent to <span className="font-semibold">{pendingEmail}</span>. Current email stays active until then. Expires {expiresAt}.
          </span>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              const response = await fetch('/api/user/pending-email-change', { method: 'DELETE' });
              const data = await response.json().catch(() => ({}));

              if (!response.ok) {
                showToast(data.error || 'Could not cancel the pending email change.', 'error');
                return;
              }

              showToast('Pending email change canceled.', 'success');
              router.refresh();
            } catch {
              showToast('Could not cancel the pending email change.', 'error');
            } finally {
              setLoading(false);
            }
          }}
          className="inline-flex flex-shrink-0 items-center justify-center rounded-full border border-amber-400/80 bg-white px-3.5 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-400/40 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-500/10"
        >
          {loading ? 'Canceling…' : 'Cancel request'}
        </button>
      </div>
    </div>
  );

  return mountNode ? createPortal(notice, mountNode) : <div className="mb-3">{notice}</div>;
}