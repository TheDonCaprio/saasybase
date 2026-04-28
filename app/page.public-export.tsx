import Link from 'next/link';
import type { Metadata } from 'next';

const FALLBACK_SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'SaaSyBase';

export const metadata: Metadata = {
  title: `${FALLBACK_SITE_NAME} Boilerplate`,
  description: 'A minimal placeholder homepage included in the public export. Replace this page with your own product homepage.',
};

export default function PublicExportHomePage() {
  return (
    <main className="min-h-screen bg-white text-slate-950 dark:bg-neutral-950 dark:text-neutral-50">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-20 sm:px-10">
        <div className="max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-12">
          <div className="mb-4 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            Public export homepage
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-5xl">
            Your SaaS boilerplate is ready.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 dark:text-neutral-300 sm:text-lg">
            This intentionally minimal homepage ships with the public export as a placeholder. Swap it for your own landing page,
            app shell, waitlist, or product marketing site.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-neutral-200"
            >
              Get Started
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              View Pricing
            </Link>
          </div>

          <div className="mt-10 grid gap-4 border-t border-slate-200 pt-8 text-sm text-slate-600 dark:border-neutral-800 dark:text-neutral-400 sm:grid-cols-3">
            <div>
              <div className="font-semibold text-slate-900 dark:text-neutral-100">Replace this page</div>
              <p className="mt-2">Use this homepage as a starter or swap it out completely with your own public site.</p>
            </div>
            <div>
              <div className="font-semibold text-slate-900 dark:text-neutral-100">Keep the app core</div>
              <p className="mt-2">Auth, billing, admin tooling, and dashboard infrastructure stay in place behind this surface.</p>
            </div>
            <div>
              <div className="font-semibold text-slate-900 dark:text-neutral-100">Ship your own brand</div>
              <p className="mt-2">Treat this as a clean boilerplate homepage, not a finished marketing site.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}