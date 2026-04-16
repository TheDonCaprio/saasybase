"use client";

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCode, faLink, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

const ALLOWED_SCRIPT_DOMAINS = [
  'www.googletagmanager.com',
  'pagead2.googlesyndication.com',
  'googleads.g.doubleclick.net',
  'securepubads.g.doubleclick.net',
  'tpc.googlesyndication.com',
  'js.stripe.com',
  'platform.twitter.com',
  'js.paystack.co',
  'checkout.razorpay.com',
  'cdn.paddle.com',
];

const ALLOWED_FRAME_OR_CONNECT_DOMAINS = [
  'pagead2.googlesyndication.com',
  'googleads.g.doubleclick.net',
  'securepubads.g.doubleclick.net',
  'tpc.googlesyndication.com',
  'api.stripe.com',
  'hooks.stripe.com',
  'm.stripe.network',
  'q.stripe.com',
  'r.stripe.com',
  'platform.twitter.com',
  'syndication.twitter.com',
  '*.paystack.co',
  '*.razorpay.com',
  '*.paddle.com',
];

export function CodeTabContent({
  customCss,
  setCustomCss,
  customHead,
  setCustomHead,
  customBody,
  setCustomBody,
}: {
  customCss: string;
  setCustomCss: (value: string) => void;
  customHead: string;
  setCustomHead: (value: string) => void;
  customBody: string;
  setCustomBody: (value: string) => void;
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-start gap-3">
            <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 flex-none" />
            <div className="space-y-2">
              <p className="font-semibold">Trusted admin code</p>
              <p>These fields run across the live site for every non-admin page. Invalid code can break layouts, scripts, SEO tags, analytics, and third-party widgets.</p>
              <p>Use the smallest possible snippet, test in a safe environment first, and only paste code you fully trust.</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4 text-sm text-blue-950 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-100">
          <div className="space-y-3">
            <p className="font-semibold">CSP allowlist for injected scripts</p>
            <p>
              Header and body snippets still obey the site Content Security Policy. External script, frame, and network URLs that are not on the allowlist in
              {' '}
              <span className="font-mono">next.config.mjs</span>
              {' '}
              can be blocked even if the markup saves successfully.
            </p>
            <div className="space-y-1">
              <p className="font-medium">Allowed script domains</p>
              <p className="font-mono text-xs leading-6 break-words">{ALLOWED_SCRIPT_DOMAINS.join(', ')}</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium">Allowed frame or connect domains</p>
              <p className="font-mono text-xs leading-6 break-words">{ALLOWED_FRAME_OR_CONNECT_DOMAINS.join(', ')}</p>
            </div>
            <p>
              To allow more domains, update the
              {' '}
              <span className="font-mono">buildContentSecurityPolicy()</span>
              {' '}
              directives in
              {' '}
              <span className="font-mono">next.config.mjs</span>
              {' '}
              and add the domain to the relevant list such as
              {' '}
              <span className="font-mono">script-src</span>
              ,
              {' '}
              <span className="font-mono">connect-src</span>
              , or
              {' '}
              <span className="font-mono">frame-src</span>
              .
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-neutral-50">
            <FontAwesomeIcon icon={faLink} className="h-4 w-4" />
            Custom CSS
          </div>
          <textarea
            value={customCss}
            onChange={(event) => setCustomCss(event.target.value)}
            rows={8}
            placeholder="/* Paste custom CSS */"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
          <p className="text-xs text-slate-500 dark:text-neutral-500">Injected directly into the &lt;head&gt;. This field accepts raw CSS only — no &lt;style&gt; tags, no HTML wrappers.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-neutral-50">
              <FontAwesomeIcon icon={faCode} className="h-4 w-4" />
              Custom head markup
            </div>
            <textarea
              value={customHead}
              onChange={(event) => setCustomHead(event.target.value)}
              rows={6}
              placeholder={'<meta name="robots" content="noindex" />\n<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>'}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <p className="text-xs text-slate-500 dark:text-neutral-500">Rendered before &lt;/head&gt; closes. Use HTML fragments only — not full document tags like &lt;html&gt;, &lt;head&gt;, &lt;body&gt;, or &lt;!doctype&gt;. External URLs still have to be allowed by the CSP in next.config.mjs.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-neutral-50">
              <FontAwesomeIcon icon={faCode} className="h-4 w-4" />
              Custom body markup
            </div>
            <textarea
              value={customBody}
              onChange={(event) => setCustomBody(event.target.value)}
              rows={6}
              placeholder={'<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js" async></script>'}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <p className="text-xs text-slate-500 dark:text-neutral-500">Appended just before &lt;/body&gt;. Use HTML fragments only — malformed wrappers and document-level tags are rejected on save. Third-party scripts, frames, and fetches must also be present in the CSP allowlist.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
