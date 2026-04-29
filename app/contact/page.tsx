import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContactForm } from '@/components/contact/ContactForm';
import { SiteContentRenderer } from '@/components/site-pages/SiteContentRenderer';
import { buildSitePageMetadata, getPublishedPageBySlug } from '../../lib/sitePages';
import { getSupportEmail } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildSitePageMetadata('contact');
}

export default async function ContactPage() {
  const [page, supportEmail] = await Promise.all([
    getPublishedPageBySlug('contact'),
    getSupportEmail().catch(() => 'support@example.com'),
  ]);
  if (!page) {
    notFound();
  }

  const effectiveSupportEmail = supportEmail && supportEmail.trim().length > 0 ? supportEmail.trim() : 'support@example.com';
  const partnersEmail = process.env.PARTNERS_EMAIL || 'partners@' + (effectiveSupportEmail.split('@')[1] || 'example.com');

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10 sm:py-20">

      {/* Page header */}
      <div className="mb-12 max-w-2xl">
        <div className="mb-4 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
          Contact
        </div>
        <SiteContentRenderer className="contact-hero-content" content={page.content} />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">

        {/* Left: info column */}
        <div className="space-y-4">

          {/* Reach us cards */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-neutral-500">Reach us</p>
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Existing customers</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">Sign in and create a support ticket so we can route your request with full account context.</p>
                <Link
                  href="/dashboard/support"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 transition hover:text-slate-950 dark:text-neutral-300 dark:hover:text-neutral-50"
                >
                  Open support center
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 5h8m0 0v8m0-8L5 15" />
                  </svg>
                </Link>
              </div>

              <div className="border-t border-slate-200 pt-5 dark:border-neutral-800">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Email our team</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">Prefer your inbox? We reply within one business day.</p>
                <a
                  href={`mailto:${effectiveSupportEmail}`}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 transition hover:text-slate-950 dark:text-neutral-300 dark:hover:text-neutral-50"
                >
                  {effectiveSupportEmail}
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 5h8m0 0v8m0-8L5 15" />
                  </svg>
                </a>
              </div>

              <div className="border-t border-slate-200 pt-5 dark:border-neutral-800">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Partnerships</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">Interested in collaborating? We&rsquo;re open to integrations, distribution, and co-marketing.</p>
                <a
                  href={`mailto:${partnersEmail}`}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 transition hover:text-slate-950 dark:text-neutral-300 dark:hover:text-neutral-50"
                >
                  {partnersEmail}
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 5h8m0 0v8m0-8L5 15" />
                  </svg>
                </a>
              </div>

              <div className="border-t border-slate-200 pt-5 dark:border-neutral-800">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Service updates</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">Real-time notices post to the dashboard banner and affected workspaces are emailed automatically.</p>
              </div>
            </div>
          </div>



        </div>

        {/* Right: form only */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <ContactForm />
        </div>

      </div>
    </div>
  );
}
