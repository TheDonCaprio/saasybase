"use client";

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faHourglassEnd, faPause, faPlay } from '@fortawesome/free-solid-svg-icons';
import { showToast } from '../ui/Toast';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string | null;
  name?: string | null;
  role: string;
  suspendedAt?: string | Date | null;
  suspensionReason?: string | null;
  suspensionIsPermanent?: boolean;
  createdAt: Date;
}

interface UserActionsProps {
  user: User;
  // optional: parent can provide an edit handler (open modal). Accept a minimal shape so callers
  // with richer User objects can pass them directly without requiring full structural equality.
  onEdit?: (u: { id: string }) => void;
  onUpdated?: (u: Partial<User> & { id: string }) => void;
  currentAdminId?: string;
}

export function UserActions({ user, onEdit, onUpdated, currentAdminId }: UserActionsProps) {
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [suspensionModalOpen, setSuspensionModalOpen] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [suspensionPermanent, setSuspensionPermanent] = useState(false);
  const router = useRouter();
  const isSuspended = Boolean(user.suspendedAt);
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

  const updateSuspension = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isSuspended
            ? { action: 'clearSuspension' }
            : {
                action: 'setSuspension',
                data: {
                  reason: suspensionReason.trim(),
                  permanent: suspensionPermanent,
                },
              }
        )
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to update suspension');
      }

      onUpdated?.({
        id: user.id,
        suspendedAt: payload?.user?.suspendedAt ?? null,
        suspensionReason: payload?.user?.suspensionReason ?? null,
        suspensionIsPermanent: payload?.user?.suspensionIsPermanent ?? false,
      });
      showToast(isSuspended ? 'User access restored' : 'User suspended', 'success');
      try { router.refresh(); } catch { /* ignore refresh errors */ }
      setSuspensionModalOpen(false);
      setSuspensionReason('');
      setSuspensionPermanent(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update suspension';
      showToast(message, 'error');
    } finally {
      setLoading(false);
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
          onClick={() => setSuspensionModalOpen(true)}
          disabled={loading || isSelf}
          title={isSelf ? 'You cannot suspend your own account' : isSuspended ? 'Restore access' : 'Suspend user'}
          className={`p-1 rounded hover:bg-neutral-800/50 ${isSuspended ? 'text-emerald-400' : 'text-amber-400'} disabled:cursor-not-allowed disabled:opacity-50`}
          aria-label={isSuspended ? `Restore access for ${user.id}` : `Suspend ${user.id}`}
        >
          <FontAwesomeIcon icon={isSuspended ? faPlay : faPause} className="w-4 h-4" />
        </button>

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={loading}
          title="Expire subscriptions"
          className="p-1 rounded hover:bg-neutral-800/50 text-red-400"
          aria-label={`Expire subscriptions for ${user.id}`}
        >
          <FontAwesomeIcon icon={faHourglassEnd} className="w-4 h-4" />
        </button>
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

      <ConfirmModal
        isOpen={suspensionModalOpen}
        title={isSuspended ? 'Restore user access' : 'Suspend user'}
        description={isSuspended ? 'This will restore access for this user.' : 'Suspended users are blocked from signing in until access is restored.'}
        confirmLabel={isSuspended ? 'Restore Access' : 'Suspend User'}
        cancelLabel="Cancel"
        loading={loading}
        confirmDisabled={!isSuspended && suspensionReason.trim().length === 0}
        onClose={() => {
          setSuspensionModalOpen(false);
          setSuspensionReason('');
          setSuspensionPermanent(false);
        }}
        onConfirm={updateSuspension}
      >
        {!isSuspended && (
          <div className="space-y-4">
            <div>
              <label htmlFor={`user-suspension-reason-${user.id}`} className="mb-1 block text-sm font-medium text-neutral-500">
                Reason
              </label>
              <textarea
                id={`user-suspension-reason-${user.id}`}
                value={suspensionReason}
                onChange={(event) => setSuspensionReason(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none transition focus:border-neutral-500"
                placeholder="Explain why this account is being suspended"
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-neutral-500">Suspension type</legend>
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="radio"
                  name={`user-suspension-type-${user.id}`}
                  checked={!suspensionPermanent}
                  onChange={() => setSuspensionPermanent(false)}
                />
                Temporary suspension
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="radio"
                  name={`user-suspension-type-${user.id}`}
                  checked={suspensionPermanent}
                  onChange={() => setSuspensionPermanent(true)}
                />
                Permanent suspension
              </label>
            </fieldset>
          </div>
        )}
      </ConfirmModal>
    </>
  );
}
