'use client';

import { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBullhorn, faXmark } from '@fortawesome/free-solid-svg-icons';

interface AnnouncementBannerProps {
  message: string;
}

export function AnnouncementBanner({ message }: AnnouncementBannerProps) {
  const dismissedKey = useMemo(
    () => `announcement-dismissed-${encodeURIComponent(message.slice(0, 50))}`,
    [message],
  );
  const [dismissedInSession, setDismissedInSession] = useState(false);

  const isPersistentlyDismissed = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      return Boolean(window.localStorage.getItem(dismissedKey));
    } catch {
      return false;
    }
  }, [dismissedKey]);

  const dismiss = () => {
    localStorage.setItem(dismissedKey, '1');
    setDismissedInSession(true);
  };

  if (!message.trim() || dismissedInSession || isPersistentlyDismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2 text-sm text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200"
    >
      <FontAwesomeIcon
        icon={faBullhorn}
        className="h-3.5 w-3.5 shrink-0 text-sky-500 dark:text-sky-400"
        aria-hidden
      />
      <p className="min-w-0 flex-1 leading-snug">{message}</p>
      <button
        type="button"
        onClick={dismiss}
        className="ml-1 shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-sky-600 transition hover:bg-sky-100 hover:text-sky-800 dark:text-sky-400 dark:hover:bg-sky-500/20 dark:hover:text-sky-200"
        aria-label="Don't show this announcement again"
      >
        Don&apos;t show again
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-md p-1 text-sky-500 transition hover:bg-sky-100 hover:text-sky-700 dark:text-sky-400 dark:hover:bg-sky-500/20 dark:hover:text-sky-200"
        aria-label="Dismiss"
      >
        <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
