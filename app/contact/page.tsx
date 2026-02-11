import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContactForm } from '@/components/contact/ContactForm';
import { SiteContentRenderer } from '@/components/site-pages/SiteContentRenderer';
import { buildSitePageMetadata, getPublishedPageBySlug } from '../../lib/sitePages';
import { getSiteName, getSupportEmail, SETTING_DEFAULTS, SETTING_KEYS } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildSitePageMetadata('contact');
}

export default async function ContactPage() {
  const [page, supportEmail, siteName] = await Promise.all([
    getPublishedPageBySlug('contact'),
    getSupportEmail().catch(() => 'support@example.com'),
    getSiteName().catch(() => process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME])
  ]);
  if (!page) {
    notFound();
  }

  const effectiveSupportEmail = supportEmail && supportEmail.trim().length > 0 ? supportEmail.trim() : 'support@example.com';
  const lastUpdated = new Date(page.updatedAt).toLocaleDateString();

  return (
    <div className="relative isolate">
      <section className="relative overflow-hidden bg-gradient-to-br from-violet-900 via-indigo-900 to-slate-950 py-28 md:py-32 text-white">
        <div className="absolute inset-0 -z-10 opacity-40" aria-hidden>
          <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-500 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 translate-y-1/2 rounded-full bg-indigo-500 blur-3xl" />
        </div>

        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-violet-200/80">Contact</p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              Need a hand with {siteName}?
            </h1>
            <p className="max-w-3xl text-base text-violet-100/90 sm:text-lg">
              Our team is here to help with onboarding, billing questions, and partnership ideas. For the fastest support, sign in and open a ticket directly from your dashboard—otherwise drop us a line below.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/6 p-6 backdrop-blur-lg">
              <h2 className="text-base font-semibold text-white">Existing customers</h2>
              <p className="mt-1 text-sm text-violet-100/90">Sign in and create a support ticket so we can route your request with full account context.</p>
              <Link
                href="/dashboard/support"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-violet-100 transition hover:text-white"
              >
                Open support center
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 5h8m0 0v8m0-8L5 15" />
                </svg>
              </Link>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/6 p-6 backdrop-blur-lg">
              <h2 className="text-base font-semibold text-white">Email our team</h2>
              <p className="mt-1 text-sm text-violet-100/90">Prefer your own inbox? Reach us at {effectiveSupportEmail}. We reply within one business day.</p>
              <a
                href={`mailto:${effectiveSupportEmail}`}
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-violet-100 transition hover:text-white"
              >
                Email {effectiveSupportEmail}
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 5h8m0 0v8m0-8L5 15" />
                </svg>
              </a>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/6 p-6 backdrop-blur-lg sm:col-span-2 lg:col-span-1">
              <h2 className="text-base font-semibold text-white">Stay in the loop</h2>
              <p className="mt-1 text-sm text-violet-100/90">We post realtime service notices in the dashboard banner and email impacted workspaces automatically—no extra setup required.</p>
              <p className="mt-4 text-xs uppercase tracking-wide text-violet-200/80">We will keep you informed.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="relative -mt-20 pb-24">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl shadow-violet-500/6 dark:border-neutral-800 dark:bg-neutral-900/70 dark:shadow-none">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-50">What happens next?</h2>
              <ul className="mt-3 space-y-3 text-sm text-slate-600 dark:text-neutral-300">
                <li>
                  <span className="font-medium text-slate-800 dark:text-neutral-100">Triage within 24 hours.</span> We route each request based on topic so the right person replies first.
                </li>
                <li>
                  <span className="font-medium text-slate-800 dark:text-neutral-100">Ticket created on your behalf.</span> We log every incoming form message and reply via email unless you prefer dashboard follow-up.
                </li>
                <li>
                  <span className="font-medium text-slate-800 dark:text-neutral-100">Emergency?</span> Mention &ldquo;urgent&rdquo; together with your workspace URL and we prioritise your message immediately.
                </li>
              </ul>
              <p className="mt-4 text-xs uppercase tracking-wide text-slate-400 dark:text-neutral-500">Last updated {lastUpdated}</p>
            </div>

            <div className="rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl shadow-violet-500/5 dark:border-neutral-800 dark:bg-neutral-900/70 dark:shadow-none">
              <SiteContentRenderer content={page.content} />
            </div>
          </div>

          <div className="md:sticky md:top-28">
            <ContactForm supportEmail={effectiveSupportEmail} />
          </div>
        </div>
      </section>
    </div>
  );
}
