import React from 'react';
import Link from 'next/link';

export function NotFoundPage() {
  return (
    <div
      data-not-found-page="true"
      className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col items-center justify-center px-6 py-24 text-center"
    >
      <div
        aria-hidden="true"
        className="select-none text-[clamp(6rem,20vw,10rem)] font-black leading-none tracking-tighter"
        style={{ color: 'rgb(var(--accent-primary-rgb) / 0.15)' }}
      >
        404
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: 'rgb(var(--accent-primary-rgb))' }}
          aria-hidden="true"
        />
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-neutral-100">
          Page not found
        </h1>
      </div>

      <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-neutral-400">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        Double-check the URL and try again, or head back somewhere safe.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-medium text-always-white shadow-sm transition hover:opacity-90"
          style={{ background: 'rgb(var(--accent-primary-rgb))' }}
        >
          Go home
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Dashboard
        </Link>
        <Link
          href="/dashboard/support"
          className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Contact support
        </Link>
      </div>

      <div className="mt-12 w-full rounded-2xl border border-slate-100 bg-white/60 p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/50">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
          Popular pages
        </p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { label: 'Pricing', href: '/pricing' },
            { label: 'Contact', href: '/contact' },
            { label: 'Sign in', href: '/sign-in' },
            { label: 'Sign up', href: '/sign-up' },
            { label: 'Privacy', href: '/privacy' },
            { label: 'Terms', href: '/terms' },
          ].map(({ label, href }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              >
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full opacity-50"
                  style={{ background: 'rgb(var(--accent-primary-rgb))' }}
                  aria-hidden="true"
                />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}