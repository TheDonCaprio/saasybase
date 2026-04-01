import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Maintenance',
  description: 'The site is temporarily unavailable while maintenance is in progress.',
};

export default function MaintenancePage() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col items-center justify-center px-6 py-20 text-center">
      <div className="inline-flex rounded-full border border-amber-300/60 bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        Maintenance mode
      </div>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 dark:text-neutral-100">
        We&apos;re making a few updates.
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 dark:text-neutral-300">
        The app is temporarily unavailable while scheduled maintenance is in progress.
        Please check back shortly.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center rounded-md bg-[color:rgb(var(--accent-primary))] px-4 py-2 text-sm font-medium text-actual-white shadow-sm transition hover:bg-[color:rgb(var(--accent-hover))]"
        >
          Try again later
        </Link>
        <Link href="/sign-in" className="rounded-md border px-4 py-2 text-sm font-medium text-slate-700 dark:text-neutral-200">
          Admin sign in
        </Link>
      </div>
    </div>
  );
}
