'use client';

import { useEffect, useMemo, useState } from 'react';
import { dashboardPanelClass } from '../../dashboard/dashboardSurfaces';
import { Pagination } from '../../ui/Pagination';
import { showToast } from '../../ui/Toast';
import { ConfirmModal } from '../../ui/ConfirmModal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faPen, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';

export interface BlogCategoryDTO {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  postCount: number;
}

interface BlogCategoriesPanelProps {
  initialCategories: BlogCategoryDTO[];
  onCategoriesChange?: (categories: BlogCategoryDTO[]) => void;
  variant?: 'page' | 'modal';
}

const CATEGORY_PAGE_SIZE = 8;

const sortCategories = (categories: BlogCategoryDTO[]) =>
  [...categories].sort((a, b) => a.title.localeCompare(b.title));

const inputClass =
  'w-full rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] bg-[color:rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.82))] px-2.5 py-1.5 text-xs text-slate-900 shadow-sm focus:border-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.45))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.18))] dark:text-neutral-100';

const primaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-[var(--theme-surface-radius)] bg-[color:rgb(var(--accent-primary-rgb))] px-3.5 py-1.5 text-xs font-semibold text-white text-actual-white shadow-sm transition hover:bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.9))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.55))] disabled:cursor-not-allowed disabled:opacity-60';

const iconButtonEditClass =
  'inline-flex h-7 w-7 items-center justify-center rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] text-slate-500 transition hover:border-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.35))] hover:text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.92))] dark:text-neutral-400';

const iconButtonDeleteClass =
  'inline-flex h-7 w-7 items-center justify-center rounded-[var(--theme-surface-radius)] border border-red-200/80 text-red-400 transition hover:bg-red-50 hover:border-red-300 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10';

const iconButtonSaveClass =
  'inline-flex h-7 w-7 items-center justify-center rounded-[var(--theme-surface-radius)] bg-[color:rgb(var(--accent-primary-rgb))] text-white text-actual-white shadow-sm transition hover:bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.88))] disabled:cursor-not-allowed disabled:opacity-60';

const iconButtonCancelClass =
  'inline-flex h-7 w-7 items-center justify-center rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] text-neutral-500 transition hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200';

function getPageForCategory(categories: BlogCategoryDTO[], categoryId: string): number {
  const index = categories.findIndex((category) => category.id === categoryId);
  if (index === -1) return 1;
  return Math.floor(index / CATEGORY_PAGE_SIZE) + 1;
}

export default function BlogCategoriesPanel({
  initialCategories,
  onCategoriesChange,
  variant = 'page'
}: BlogCategoriesPanelProps) {
  const isCompact = variant === 'modal';
  const [categories, setCategories] = useState<BlogCategoryDTO[]>(() => sortCategories(initialCategories));
  const [currentPage, setCurrentPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [newCategory, setNewCategory] = useState({ title: '', slug: '', description: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', slug: '', description: '' });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<BlogCategoryDTO | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(categories.length / CATEGORY_PAGE_SIZE)),
    [categories.length]
  );

  const paginatedCategories = useMemo(() => {
    const startIndex = (currentPage - 1) * CATEGORY_PAGE_SIZE;
    return categories.slice(startIndex, startIndex + CATEGORY_PAGE_SIZE);
  }, [categories, currentPage]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const updateCategories = (
    updater: (current: BlogCategoryDTO[]) => BlogCategoryDTO[],
    focusCategoryId?: string
  ) => {
    const next = sortCategories(updater(categories));
    setCategories(next);
    if (focusCategoryId) {
      setCurrentPage(getPageForCategory(next, focusCategoryId));
    }
    onCategoriesChange?.(next);
  };

  const resetNewCategory = () => setNewCategory({ title: '', slug: '', description: '' });

  const handleCreate = async () => {
    if (!newCategory.title.trim()) {
      showToast('Title is required', 'error');
      return;
    }
    setCreating(true);
    try {
      const response = await fetch('/api/admin/blog/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newCategory.title.trim(),
          slug: newCategory.slug.trim() || undefined,
          description: newCategory.description.trim() || undefined
        })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to create category' }));
        throw new Error(error.error || 'Failed to create category');
      }
      const { category } = (await response.json()) as { category: BlogCategoryDTO };
      updateCategories(
        (prev) => [category, ...prev.filter((existing) => existing.id !== category.id)],
        category.id
      );
      showToast('Category created', 'success');
      resetNewCategory();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create category';
      showToast(message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const startEditing = (category: BlogCategoryDTO) => {
    setEditingId(category.id);
    setEditForm({
      title: category.title,
      slug: category.slug,
      description: category.description ?? ''
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({ title: '', slug: '', description: '' });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    if (!editForm.title.trim()) {
      showToast('Title is required', 'error');
      return;
    }
    try {
      const response = await fetch(`/api/admin/blog/categories/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title.trim(),
          slug: editForm.slug.trim() || undefined,
          description: editForm.description.trim() || undefined
        })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to update category' }));
        throw new Error(error.error || 'Failed to update category');
      }
      const { category } = (await response.json()) as { category: BlogCategoryDTO };
      updateCategories(
        (prev) => prev.map((existing) => (existing.id === category.id ? category : existing)),
        category.id
      );
      showToast('Category updated', 'success');
      cancelEditing();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update category';
      showToast(message, 'error');
    }
  };

  const confirmDelete = (category: BlogCategoryDTO) => {
    setCategoryToDelete(category);
    setConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;
    setConfirmLoading(true);
    try {
      const response = await fetch(`/api/admin/blog/categories/${categoryToDelete.id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to delete category' }));
        throw new Error(error.error || 'Failed to delete category');
      }
      updateCategories((prev) => prev.filter((category) => category.id !== categoryToDelete.id));
      showToast('Category deleted', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete category';
      showToast(message, 'error');
    } finally {
      setConfirmLoading(false);
      setConfirmOpen(false);
      setCategoryToDelete(null);
    }
  };

  return (
    <div className={isCompact ? 'space-y-5' : 'space-y-8'}>
      <section className={dashboardPanelClass(isCompact ? 'space-y-3 p-4 sm:p-5' : 'space-y-4 p-6')}>
        {!isCompact ? (
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Create category</p>
            <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Group related posts</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Titles appear in the category directory and under each post. Slugs control the public URL at /blog/category/&lt;slug&gt;.
            </p>
          </div>
        ) : (
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">New category</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Title</span>
            <input
              type="text"
              value={newCategory.title}
              onChange={(event) => setNewCategory((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Changelog"
              className={inputClass}
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Slug</span>
            <input
              type="text"
              value={newCategory.slug}
              onChange={(event) => setNewCategory((prev) => ({ ...prev, slug: event.target.value }))}
              placeholder="changelog"
              className={inputClass}
            />
          </label>
          <label className="space-y-0.5 sm:col-span-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Description</span>
            <textarea
              value={newCategory.description}
              onChange={(event) => setNewCategory((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Optional — shown on the category landing page"
              rows={2}
              className={inputClass}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className={primaryButtonClass}
          >
            {creating ? 'Creating…' : 'Create category'}
          </button>
          <button
            type="button"
            onClick={resetNewCategory}
            className="text-sm font-medium text-neutral-500 transition hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            Reset
          </button>
        </div>
      </section>

      <section className={dashboardPanelClass(isCompact ? 'space-y-4 p-4 sm:p-5' : 'space-y-4 p-6')}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Existing categories</p>
            {!isCompact && <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">{categories.length || 'No'} categories</h3>}
            {isCompact && <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{categories.length || 'No'} categories</p>}
          </div>
          {categories.length > CATEGORY_PAGE_SIZE ? (
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">
              Page {currentPage} of {totalPages}
            </p>
          ) : null}
        </div>

        {categories.length === 0 ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-300">No categories yet. Create one to start organizing posts.</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
            {paginatedCategories.map((category) => (
              <article
                key={category.id}
                className="flex h-full flex-col rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] bg-[color:rgb(var(--surface-card-rgb)_/_calc(var(--surface-card-a)*0.82))] p-3 shadow-sm"
              >
                {editingId === category.id ? (
                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="space-y-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Title</span>
                        <input
                          type="text"
                          value={editForm.title}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                          className={inputClass}
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Slug</span>
                        <input
                          type="text"
                          value={editForm.slug}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, slug: event.target.value }))}
                          className={inputClass}
                        />
                      </label>
                      <label className="space-y-0.5 sm:col-span-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Description</span>
                        <textarea
                          value={editForm.description}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))}
                          rows={2}
                          className={inputClass}
                        />
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        className={iconButtonSaveClass}
                        title="Save changes"
                      >
                        <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className={iconButtonCancelClass}
                        title="Cancel"
                      >
                        <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                      </button>
                      <span className="text-[10px] text-neutral-400">Save / Cancel</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 leading-snug">{category.title}</p>
                      <span className="shrink-0 rounded-full border border-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.18))] bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.08))] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.9))] dark:text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.95))]">
                        {category.postCount}p
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <p className="min-w-0 flex-1 text-xs text-neutral-500 truncate" title={`/blog/category/${category.slug}`}>/blog/category/{category.slug}</p>
                      <button
                        type="button"
                        onClick={() => startEditing(category)}
                        className={iconButtonEditClass}
                        title="Edit"
                      >
                        <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmDelete(category)}
                        className={iconButtonDeleteClass}
                        title="Delete"
                      >
                        <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                      </button>
                    </div>
                    {category.description ? (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">{category.description}</p>
                    ) : null}
                  </div>
                )}
              </article>
            ))}
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={categories.length}
              itemsPerPage={CATEGORY_PAGE_SIZE}
            />
          </>
        )}
      </section>

      <ConfirmModal
        isOpen={confirmOpen}
        title="Delete category"
        description={
          categoryToDelete
            ? `Delete the “${categoryToDelete.title}” category? Posts will remain published but lose this relationship.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={confirmLoading}
        onConfirm={() => {
          void handleDelete();
        }}
        onClose={() => {
          if (confirmLoading) return;
          setConfirmOpen(false);
          setCategoryToDelete(null);
        }}
      />
    </div>
  );
}
