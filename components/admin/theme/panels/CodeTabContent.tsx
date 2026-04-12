"use client";

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCode, faLink, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

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
              placeholder={'<meta name="robots" content="noindex" />\n<script>/* analytics */</script>'}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <p className="text-xs text-slate-500 dark:text-neutral-500">Rendered before &lt;/head&gt; closes. Use HTML fragments only — not full document tags like &lt;html&gt;, &lt;head&gt;, &lt;body&gt;, or &lt;!doctype&gt;.</p>
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
              placeholder={'<script src="https://example.com/widget.js" defer></script>'}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <p className="text-xs text-slate-500 dark:text-neutral-500">Appended just before &lt;/body&gt;. Use HTML fragments only — malformed wrappers and document-level tags are rejected on save.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
