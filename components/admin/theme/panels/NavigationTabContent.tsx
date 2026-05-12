"use client";

import type { ThemeLink } from '../../../../lib/settings';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCompass, faLink, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';

const MAX_NAV_LABEL_LENGTH = 48;
const MAX_NAV_URL_LENGTH = 2048;
const MAX_FOOTER_TEXT_LENGTH = 240;

export function NavigationTabContent({
  headerLinks,
  footerLinks,
  footerText,
  footerTokenHints,
  canAddHeader,
  canAddFooter,
  addHeaderLink,
  addFooterLink,
  updateHeaderLink,
  updateFooterLink,
  removeHeaderLink,
  removeFooterLink,
  setFooterText,
}: {
  headerLinks: ThemeLink[];
  footerLinks: ThemeLink[];
  footerText: string;
  footerTokenHints: string[];
  canAddHeader: boolean;
  canAddFooter: boolean;
  addHeaderLink: () => void;
  addFooterLink: () => void;
  updateHeaderLink: (index: number, field: 'label' | 'href', value: string) => void;
  updateFooterLink: (index: number, field: 'label' | 'href', value: string) => void;
  removeHeaderLink: (index: number) => void;
  removeFooterLink: (index: number) => void;
  setFooterText: (value: string) => void;
}) {
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-6">
          <div>
            <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-neutral-50 mb-2">
              <FontAwesomeIcon icon={faCompass} className="h-5 w-5" />
              <div>Header Navigation</div>
            </div>
            <p className="text-sm text-slate-600 dark:text-neutral-400">Control the primary links shown in the top navigation bar.</p>
          </div>
        </div>
        <div className="space-y-4">
          {headerLinks.map((link, index) => (
            <div
              key={`header-link-${index}`}
              className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-900/60"
            >
              <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                <div className="flex-1 space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Label</label>
                  <input
                    type="text"
                    value={link.label}
                    onChange={(event) => updateHeaderLink(index, 'label', event.target.value.slice(0, MAX_NAV_LABEL_LENGTH))}
                    maxLength={MAX_NAV_LABEL_LENGTH}
                    placeholder="Dashboard"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">URL</label>
                  <input
                    type="text"
                    value={link.href}
                    onChange={(event) => updateHeaderLink(index, 'href', event.target.value.slice(0, MAX_NAV_URL_LENGTH))}
                    maxLength={MAX_NAV_URL_LENGTH}
                    placeholder="/dashboard"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  />
                </div>
                <div className="flex items-end justify-end md:self-end">
                  <button
                    type="button"
                    onClick={() => removeHeaderLink(index)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/40"
                  >
                    <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={addHeaderLink}
            disabled={!canAddHeader}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
          >
            <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
            Add link
          </button>
        </div>
      </section>

      <section>
        <div className="mb-6">
          <div>
            <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-neutral-50 mb-2">
              <FontAwesomeIcon icon={faLink} className="h-5 w-5" />
              <div>Footer Layout</div>
            </div>
            <p className="text-sm text-slate-600 dark:text-neutral-400">
              Configure footer links and display text. Use tokens like {'{{year}}'} and {'{{site}}'}.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          {footerLinks.map((link, index) => (
            <div
              key={`footer-link-${index}`}
              className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-900/60"
            >
              <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                <div className="flex-1 space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Label</label>
                  <input
                    type="text"
                    value={link.label}
                    onChange={(event) => updateFooterLink(index, 'label', event.target.value.slice(0, MAX_NAV_LABEL_LENGTH))}
                    maxLength={MAX_NAV_LABEL_LENGTH}
                    placeholder="Privacy"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">URL</label>
                  <input
                    type="text"
                    value={link.href}
                    onChange={(event) => updateFooterLink(index, 'href', event.target.value.slice(0, MAX_NAV_URL_LENGTH))}
                    maxLength={MAX_NAV_URL_LENGTH}
                    placeholder="/privacy"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  />
                </div>
                <div className="flex items-end justify-end md:self-end">
                  <button
                    type="button"
                    onClick={() => removeFooterLink(index)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/40"
                  >
                    <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={addFooterLink}
            disabled={!canAddFooter}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
          >
            <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
            Add footer link
          </button>
        </div>

        <div className="mt-6 space-y-2">
          <label className="block text-sm font-semibold text-slate-900 dark:text-neutral-100">Footer text</label>
          <textarea
            value={footerText}
            onChange={(event) => setFooterText(event.target.value.slice(0, MAX_FOOTER_TEXT_LENGTH))}
            maxLength={MAX_FOOTER_TEXT_LENGTH}
            rows={3}
            placeholder="© {{year}} {{siteName}}. All rights reserved."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
          <p className="text-xs text-slate-500 dark:text-neutral-500">Supports tokens {footerTokenHints.join(', ')}. {footerText.length}/{MAX_FOOTER_TEXT_LENGTH}</p>
        </div>
      </section>
    </div>
  );
}
