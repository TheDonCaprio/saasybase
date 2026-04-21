import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

interface WorkspaceSuspendedNoticeProps {
  reason: string | null;
  supportEmail: string;
}

export function WorkspaceSuspendedNotice({ reason, supportEmail }: WorkspaceSuspendedNoticeProps) {
  const detail = reason?.trim()
    ? reason.trim()
    : 'The team plan associated with this workspace has expired or was cancelled.';

  return (
    <div
      role="alert"
      className="mb-4 flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <FontAwesomeIcon
        icon={faTriangleExclamation}
        className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400"
        aria-hidden
      />
      <p className="min-w-0 flex-1 leading-snug">
        <span className="font-semibold">Workspace suspended.&nbsp;</span>
        {detail}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Link
          href="/dashboard/billing"
          className="rounded-md px-2 py-0.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-500/20 dark:hover:text-amber-100"
        >
          Renew plan
        </Link>
        <span className="text-amber-300 dark:text-amber-600">·</span>
        <a
          href={`mailto:${supportEmail}`}
          className="rounded-md px-2 py-0.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-500/20 dark:hover:text-amber-100"
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
