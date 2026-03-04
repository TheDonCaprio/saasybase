"use client";

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCode, faLink } from '@fortawesome/free-solid-svg-icons';

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
          <p className="text-xs text-slate-500 dark:text-neutral-500">Injected directly into the &lt;head&gt;. Keep it lightweight.</p>
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
            <p className="text-xs text-slate-500 dark:text-neutral-500">Rendered before &lt;/head&gt; closes. Ideal for meta tags, analytics, or preload hints.</p>
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
            <p className="text-xs text-slate-500 dark:text-neutral-500">Appended just before &lt;/body&gt;. Great for chat widgets, monitoring, or conversion tracking.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
