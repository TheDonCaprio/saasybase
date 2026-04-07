'use client';

import { useState } from 'react';
import type { TeamDashboardMember } from '../../lib/team-dashboard';
import { ConfirmModal } from '../ui/ConfirmModal';

interface TeamMembersListProps {
  members: TeamDashboardMember[];
  tokenPoolStrategy: string;
  currentUserId: string;
  busyAction: string | null;
  canManageMembers: boolean;
  onRemove: (userId: string) => Promise<void> | void;
  onSetCapOverride: (userId: string, cap: number | null) => Promise<void> | void;
  tokenLabel?: string;
}

export function TeamMembersList({ members, tokenPoolStrategy, currentUserId, busyAction, canManageMembers, onRemove, onSetCapOverride, tokenLabel }: TeamMembersListProps) {
  const [editingCapFor, setEditingCapFor] = useState<string | null>(null);
  const [capInputValue, setCapInputValue] = useState<string>('');
  const [memberToRemove, setMemberToRemove] = useState<TeamDashboardMember | null>(null);

  if (members.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-neutral-400">No members added yet.</p>;
  }

  const label = (tokenLabel || 'tokens').toLowerCase();
  const isSharedPoolStrategy = tokenPoolStrategy === 'SHARED_FOR_ORG';

  const handleCapEdit = (member: TeamDashboardMember) => {
    setEditingCapFor(member.userId);
    setCapInputValue(member.memberTokenCapOverride != null ? String(member.memberTokenCapOverride) : '');
  };

  const handleCapSave = async (member: TeamDashboardMember) => {
    const trimmed = capInputValue.trim();
    let cap: number | null = null;
    if (trimmed !== '') {
      const parsed = parseInt(trimmed, 10);
      if (isNaN(parsed) || parsed < 0) return; // invalid — don't save
      cap = parsed === 0 ? null : parsed;
    }
    setEditingCapFor(null);
    await onSetCapOverride(member.userId, cap);
  };

  const handleRequestRemove = (member: TeamDashboardMember) => {
    if (member.userId === currentUserId) {
      return;
    }

    setMemberToRemove(member);
  };

  const handleConfirmRemove = async () => {
    if (!memberToRemove) {
      return;
    }

    await onRemove(memberToRemove.userId);
    setMemberToRemove(null);
  };

  return (
    <ul className="space-y-3">
      {members.map((member) => {
        const isViewer = member.userId === currentUserId;
        const disableRemoval = isViewer;
        const isRemoving = busyAction === `remove:${member.userId}`;
        const isSavingCap = busyAction === `cap:${member.userId}`;
        const capLabel = member.effectiveMemberCap != null ? `${member.effectiveMemberCap.toLocaleString()} ${label}` : 'Unlimited';
        const overrideActive = member.memberTokenCapOverride != null && !member.ownerExemptFromCaps;
        const usageLabel = `${member.memberTokenUsage.toLocaleString()} ${label}`;
        const balanceLabel = `${member.sharedTokenBalance.toLocaleString()} ${label}`;
        const isEditingCap = editingCapFor === member.userId;

        return (
          <li key={member.id} className="rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-neutral-700">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="font-semibold text-slate-900 dark:text-neutral-100">
                  {member.name || member.email || 'Unnamed member'}
                  {isViewer ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-neutral-800 dark:text-neutral-300">You</span> : null}
                </p>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                  {member.role} • {member.email ?? 'email pending'}
                </p>
                <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-neutral-400">
                  <span>
                    {isSharedPoolStrategy ? 'Shared balance' : 'Allocated balance'}: <strong className="text-slate-900 dark:text-neutral-100">{balanceLabel}</strong>
                  </span>
                  {isSharedPoolStrategy ? (
                    <span>
                      Cap: <strong className="text-slate-900 dark:text-neutral-100">{capLabel}</strong>
                      {member.ownerExemptFromCaps ? <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">owner exempt</span> : null}
                      {overrideActive ? <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">override</span> : null}
                    </span>
                  ) : null}
                  <span>
                    Usage: <strong className="text-slate-900 dark:text-neutral-100">{usageLabel}</strong>
                  </span>
                </div>
              </div>

              {canManageMembers ? (
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button
                    onClick={() => handleRequestRemove(member)}
                    disabled={disableRemoval || isRemoving}
                    className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {disableRemoval ? 'Owner' : isRemoving ? 'Removing…' : 'Remove'}
                  </button>
                  {!isViewer && isSharedPoolStrategy && (
                    <button
                      onClick={() => isEditingCap ? setEditingCapFor(null) : handleCapEdit(member)}
                      disabled={isSavingCap}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      {isSavingCap ? 'Saving…' : isEditingCap ? 'Cancel' : overrideActive ? 'Edit cap' : 'Set cap'}
                    </button>
                  )}
                </div>
              ) : null}
            </div>

            {/* Inline cap-override editor */}
            {isSharedPoolStrategy && isEditingCap && (
              <div className="mt-3 flex items-end gap-2 border-t border-slate-100 pt-3 dark:border-neutral-700/60">
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-neutral-300">
                    Custom token cap for this member
                  </label>
                  <p className="mb-1.5 text-xs text-slate-400 dark:text-neutral-500">
                    Leave blank or enter 0 to clear the override and use the org default.
                  </p>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={capInputValue}
                    onChange={(e) => setCapInputValue(e.target.value)}
                    placeholder={`e.g. 5000`}
                    className="block w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </div>
                <button
                  onClick={() => handleCapSave(member)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            )}
          </li>
        );
      })}

      <ConfirmModal
        isOpen={memberToRemove != null}
        onClose={() => setMemberToRemove(null)}
        onConfirm={handleConfirmRemove}
        title="Remove member"
        description={`Are you sure you want to remove ${memberToRemove?.name || memberToRemove?.email || 'this member'} from the workspace? This will revoke their access immediately.`}
        confirmLabel="Remove"
        loading={memberToRemove != null && busyAction === `remove:${memberToRemove.userId}`}
      />
    </ul>
  );
}
