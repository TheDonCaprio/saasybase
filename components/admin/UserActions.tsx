"use client";

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faHourglassEnd, faTrash } from '@fortawesome/free-solid-svg-icons';
import { showToast } from '../ui/Toast';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string | null;
  name?: string | null;
  role: string;
  createdAt: Date;
}

interface UserActionsProps {
  user: User;
  // optional: parent can provide an edit handler (open modal). Accept a minimal shape so callers
  // with richer User objects can pass them directly without requiring full structural equality.
  onEdit?: (u: { id: string }) => void;
  currentAdminId?: string;
  onDelete?: (userId: string) => void;
}

export function UserActions({ user, onEdit, currentAdminId, onDelete }: UserActionsProps) {
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const router = useRouter();

  const isSelf = currentAdminId === user.id;

  const expireSubscription = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'expireSubscription' })
      });

      if (response.ok) {
        showToast('User subscriptions expired', 'success');
  try { router.refresh(); } catch { /* ignore refresh errors */ }
      } else {
        console.error('Failed to expire subscriptions');
        showToast('Failed to expire subscriptions', 'error');
      }
    } catch (error) {
      console.error('Error expiring subscriptions:', error);
      showToast('Failed to expire subscriptions', 'error');
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  const deleteUser = async () => {
    setDeleteLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        showToast('User deleted', 'success');
        onDelete?.(user.id);
        try { router.refresh(); } catch { /* ignore refresh errors */ }
      } else {
        const json = await response.json().catch(() => ({}));
        const message = typeof json?.error === 'string' ? json.error : 'Failed to delete user';
        showToast(message, 'error');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      showToast('Failed to delete user', 'error');
    } finally {
      setDeleteLoading(false);
      setDeleteConfirmOpen(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {onEdit && (
          <button
            onClick={() => onEdit(user)}
            title="Edit user"
            className="p-1 rounded hover:bg-neutral-800/50 text-neutral-300"
            aria-label={`Edit user ${user.id}`}
          >
            <FontAwesomeIcon icon={faPen} className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={loading}
          title="Expire subscriptions"
          className="p-1 rounded hover:bg-neutral-800/50 text-red-400"
          aria-label={`Expire subscriptions for ${user.id}`}
        >
          <FontAwesomeIcon icon={faHourglassEnd} className="w-4 h-4" />
        </button>

        {!isSelf && (
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={deleteLoading}
            title="Delete user"
            className="p-1 rounded hover:bg-neutral-800/50 text-red-500"
            aria-label={`Delete user ${user.id}`}
          >
            <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
          </button>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        title="Expire subscriptions"
        description="This will mark all active subscriptions for this user as expired. This action cannot be undone."
        confirmLabel="Expire Subscriptions"
        cancelLabel="Cancel"
        loading={loading}
        onClose={() => setConfirmOpen(false)}
        onConfirm={expireSubscription}
      />

      {!isSelf && (
        <ConfirmModal
          isOpen={deleteConfirmOpen}
          title="Delete user"
          description="This will permanently delete the user, their subscriptions, payments, and related data. This action cannot be undone."
          confirmLabel="Delete user"
          cancelLabel="Cancel"
          loading={deleteLoading}
          onClose={() => setDeleteConfirmOpen(false)}
          onConfirm={deleteUser}
        />
      )}
    </>
  );
}
