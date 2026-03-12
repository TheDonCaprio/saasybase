import Link from 'next/link';
import { buildDashboardMetadata } from '../../lib/dashboardMetadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Access denied',
    description: 'You do not have permission to view that page.',
    audience: 'user'
  });
}

export default function AccessDeniedPage() {
  return (
    <div className="mx-auto max-w-3xl py-24 px-6 text-center">
      <h1 className="text-3xl font-semibold">Access denied</h1>
      <p className="mt-4 text-sm text-slate-600 dark:text-neutral-300">
        You don’t have permission to view that page. If you believe this is an error,
        contact a site administrator or check your account permissions.
      </p>

      <div className="mt-8 flex justify-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-md bg-[color:rgb(var(--accent-primary))] px-4 py-2 text-sm font-medium text-actual-white shadow-sm transition hover:bg-[color:rgb(var(--accent-hover))]"
        >
          Go to dashboard
        </Link>
        <Link href="/dashboard/support" className="rounded-md border px-4 py-2 text-sm font-medium">
          Contact support
        </Link>
      </div>
    </div>
  );
}
