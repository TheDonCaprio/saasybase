'use client';

import { useMemo, useRef, useState } from 'react';
import { ConfirmModal } from '../../ui/ConfirmModal';
import { showToast } from '../../ui/Toast';
import clsx from 'clsx';

export interface SitePageDTO {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  content: string;
  published: boolean;
  system: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SitePagesManagerProps {
  initialPages: SitePageDTO[];
}

type FormMode = 'edit' | 'create';

interface FormState {
  id?: string;
  title: string;
  slug: string;
  description: string;
  content: string;
  published: boolean;
  system?: boolean;
}

const DEFAULT_FORM: FormState = {
  title: '',
  slug: '',
  description: '',
  content: '',
  published: true
};

function sortPages(pages: SitePageDTO[]): SitePageDTO[] {
  return [...pages].sort((a, b) => {
    if (a.system && !b.system) return -1;
    if (!a.system && b.system) return 1;
    return a.title.localeCompare(b.title);
  });
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export default function SitePagesManager({ initialPages }: SitePagesManagerProps) {
  const [pages, setPages] = useState<SitePageDTO[]>(initialPages);
  const [mode, setMode] = useState<FormMode>(initialPages.length ? 'edit' : 'create');
  const [selection, setSelection] = useState<string | null>(initialPages[0]?.id ?? null);
  const [form, setForm] = useState<FormState>(() => {
    if (initialPages[0]) {
      const first = initialPages[0];
      return {
        id: first.id,
        title: first.title,
        slug: first.slug,
        description: first.description ?? '',
        content: first.content,
        published: first.published,
        system: first.system
      };
    }
    return { ...DEFAULT_FORM };
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState<string | null>(null);
  const confirmResolver = useRef<((value: boolean) => void) | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const activePage = useMemo(() => pages.find((page) => page.id === selection) ?? null, [pages, selection]);

  const isSystemPage = mode === 'edit' && (form.system ?? activePage?.system ?? false);

  function resetToCreate() {
    setMode('create');
    setSelection(null);
    setForm({ ...DEFAULT_FORM });
  }

  function hydrateFromPage(page: SitePageDTO) {
    setMode('edit');
    setSelection(page.id);
    setForm({
      id: page.id,
      title: page.title,
      slug: page.slug,
      description: page.description ?? '',
      content: page.content,
      published: page.published,
      system: page.system
    });
  }

  const sortedPages = useMemo(() => sortPages(pages), [pages]);

  function updateFormField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (isSaving) return;
    setIsSaving(true);

    try {
      if (mode === 'create') {
        const response = await fetch('/api/admin/pages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title.trim(),
            slug: form.slug.trim() || slugify(form.title),
            description: form.description.trim(),
            content: form.content,
            published: form.published
          })
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Failed to create page' }));
          throw new Error(error.error || 'Failed to create page');
        }

        const { page } = (await response.json()) as { page: SitePageDTO };
        setPages((prev) => [page, ...prev.filter((p) => p.id !== page.id)]);
        hydrateFromPage(page);
        showToast('Page created', 'success');
      } else if (form.id) {
        const response = await fetch(`/api/admin/pages/${form.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title.trim(),
            slug: isSystemPage ? undefined : form.slug.trim(),
            description: form.description.trim(),
            content: form.content,
            published: form.published
          })
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Failed to update page' }));
          throw new Error(error.error || 'Failed to update page');
        }

        const { page } = (await response.json()) as { page: SitePageDTO };
        setPages((prev) => prev.map((existing) => (existing.id === page.id ? page : existing)));
        hydrateFromPage(page);
        showToast('Page updated', 'success');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save page';
      showToast(message, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (isDeleting || !form.id) return;
    if (isSystemPage) {
      showToast('System pages cannot be deleted', 'error');
      return;
    }

    const confirm = () => {
      setConfirmText('Delete this page? This cannot be undone.');
      setConfirmOpen(true);
      return new Promise<boolean>((resolve) => {
        confirmResolver.current = resolve;
      });
    };

    const confirmed = await confirm();
    if (!confirmed) {
      setConfirmOpen(false);
      confirmResolver.current = null;
      return;
    }

    // keep modal open while deleting
    setConfirmLoading(true);
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/pages/${form.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to delete page' }));
        throw new Error(error.error || 'Failed to delete page');
      }

      const remaining = pages.filter((page) => page.id !== form.id);
      setPages(remaining);
      showToast('Page deleted', 'success');
      if (remaining.length) {
        const next = sortPages(remaining)[0];
        if (next) {
          hydrateFromPage(next);
        } else {
          resetToCreate();
        }
      } else {
        resetToCreate();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete page';
      showToast(message, 'error');
    } finally {
      setIsDeleting(false);
      setConfirmLoading(false);
      setConfirmOpen(false);
      confirmResolver.current = null;
    }
  }

  function handleTitleChange(value: string) {
    updateFormField('title', value);
    if (mode === 'create') {
      updateFormField('slug', slugify(value));
    }
  }

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <aside className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-neutral-200">Pages</h2>
          <button
            type="button"
            onClick={resetToCreate}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
          >
            New page
          </button>
        </div>
        <div className="space-y-2">
          {sortedPages.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => hydrateFromPage(page)}
              className={clsx(
                'w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                selection === page.id
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-500 dark:bg-indigo-500/20 dark:text-indigo-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-200'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{page.title}</span>
                {page.system ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                    Core
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-neutral-400">/{page.slug}</div>
              <div className={clsx('mt-1 text-xs', page.published ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-400 dark:text-neutral-500')}>
                {page.published ? 'Published' : 'Draft'}
              </div>
            </button>
          ))}
          {!sortedPages.length ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-300">
              No pages yet. Create your first page to get started.
            </div>
          ) : null}
        </div>
      </aside>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-950/60">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-500">{mode === 'create' ? 'Create page' : 'Edit page'}</p>
            <h3 className="text-2xl font-semibold text-slate-900 dark:text-neutral-50">{form.title || 'Untitled page'}</h3>
          </div>
          {mode === 'edit' ? (
            <div className="text-right text-xs text-slate-500 dark:text-neutral-500">
              <div>Updated {formatTimestamp(activePage?.updatedAt ?? null)}</div>
              <div>Published {formatTimestamp(activePage?.publishedAt ?? null)}</div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(event) => handleTitleChange(event.target.value)}
              placeholder="e.g. Privacy Policy"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Slug</span>
            <input
              type="text"
              value={form.slug}
              onChange={(event) => updateFormField('slug', slugify(event.target.value))}
              disabled={mode === 'edit' && isSystemPage}
              placeholder="privacy-policy"
              className={clsx(
                'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100',
                mode === 'edit' && isSystemPage ? 'cursor-not-allowed opacity-70' : ''
              )}
            />
          </label>
          <label className="lg:col-span-2 space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Description</span>
            <textarea
              value={form.description}
              onChange={(event) => updateFormField('description', event.target.value)}
              placeholder="Short summary for previews and search engines"
              rows={2}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </label>
          <label className="lg:col-span-2 space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Content (HTML)</span>
            <textarea
              value={form.content}
              onChange={(event) => updateFormField('content', event.target.value)}
              placeholder="<h1>...</h1>"
              rows={14}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </label>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-neutral-200">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(event) => updateFormField('published', event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Published
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : mode === 'create' ? 'Create page' : 'Save changes'}
          </button>
          {mode === 'edit' ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || isSystemPage}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
            >
              {isDeleting ? 'Deleting…' : 'Delete page'}
            </button>
          ) : null}
          <div className="text-xs text-slate-400 dark:text-neutral-500">
            {mode === 'edit'
              ? 'System pages always remain published; slug changes are locked to keep canonical URLs.'
              : 'Slugs become part of the public URL under /<slug>.'}
          </div>
        </div>
      </section>
    </div>
      <ConfirmModal
        isOpen={confirmOpen}
        title="Confirm delete"
        description={confirmText ?? ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={confirmLoading}
        onClose={() => {
          if (confirmResolver.current) confirmResolver.current(false);
          setConfirmOpen(false);
          confirmResolver.current = null;
          setConfirmLoading(false);
        }}
        onConfirm={() => {
          if (confirmResolver.current) confirmResolver.current(true);
          // keep modal open while deleting; handleDelete sets loading
        }}
      />
    </>
  );
}
