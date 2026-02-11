'use client';

import { useState } from 'react';
import { dashboardPanelClass } from '../../dashboard/dashboardSurfaces';
import { showToast } from '../../ui/Toast';
import { ConfirmModal } from '../../ui/ConfirmModal';

export interface BlogCategoryDTO {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  postCount: number;
}

interface BlogCategoriesPanelProps {
  initialCategories: BlogCategoryDTO[];
}

const sortCategories = (categories: BlogCategoryDTO[]) =>
  [...categories].sort((a, b) => a.title.localeCompare(b.title));

export default function BlogCategoriesPanel({ initialCategories }: BlogCategoriesPanelProps) {
  const [categories, setCategories] = useState<BlogCategoryDTO[]>(() => sortCategories(initialCategories));
  const [creating, setCreating] = useState(false);
  const [newCategory, setNewCategory] = useState({ title: '', slug: '', description: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', slug: '', description: '' });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<BlogCategoryDTO | null>(null);

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
      setCategories((prev) => sortCategories([category, ...prev.filter((existing) => existing.id !== category.id)]));
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
      setCategories((prev) => sortCategories(prev.map((existing) => (existing.id === category.id ? category : existing))));
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
      setCategories((prev) => prev.filter((category) => category.id !== categoryToDelete.id));
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
    <div className="space-y-8">
      <section className={dashboardPanelClass('space-y-4 p-6')}>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Create category</p>
          <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Group related posts</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Titles appear in the category directory and under each post. Slugs control the public URL at /blog/category/&lt;slug&gt;.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Title</span>
            <input
              type="text"
              value={newCategory.title}
              onChange={(event) => setNewCategory((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Changelog"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Slug</span>
            <input
              type="text"
              value={newCategory.slug}
              onChange={(event) => setNewCategory((prev) => ({ ...prev, slug: event.target.value }))}
              placeholder="changelog"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </label>
          <label className="lg:col-span-2 space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Description</span>
            <textarea
              value={newCategory.description}
              onChange={(event) => setNewCategory((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Optional summary for internal context"
              rows={2}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create category'}
          </button>
          <button
            type="button"
            onClick={resetNewCategory}
            className="text-sm font-medium text-neutral-500 hover:text-neutral-700"
          >
            Reset
          </button>
        </div>
      </section>

      <section className={dashboardPanelClass('p-6 space-y-4')}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Existing categories</p>
            <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">{categories.length || 'No'} categories</h3>
          </div>
        </div>

        {categories.length === 0 ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-300">No categories yet. Create one to start organizing posts.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {categories.map((category) => (
              <li key={category.id} className="py-4">
                {editingId === category.id ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Title</span>
                        <input
                          type="text"
                          value={editForm.title}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Slug</span>
                        <input
                          type="text"
                          value={editForm.slug}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, slug: event.target.value }))}
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                        />
                      </label>
                      <label className="lg:col-span-2 space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Description</span>
                        <textarea
                          value={editForm.description}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))}
                          rows={2}
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500"
                      >
                        Save changes
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="text-sm font-medium text-neutral-500 hover:text-neutral-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-neutral-900 dark:text-neutral-50">{category.title}</p>
                      <p className="text-sm text-neutral-500">Slug: /blog/category/{category.slug}</p>
                      {category.description ? (
                        <p className="text-sm text-neutral-600 dark:text-neutral-300">{category.description}</p>
                      ) : null}
                      <p className="text-xs uppercase tracking-wide text-neutral-400">
                        {category.postCount} {category.postCount === 1 ? 'post' : 'posts'}
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => startEditing(category)}
                        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-200"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmDelete(category)}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-200"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
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
