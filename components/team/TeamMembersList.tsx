import type { TeamDashboardMember } from '../../lib/team-dashboard';

interface TeamMembersListProps {
  members: TeamDashboardMember[];
  currentUserId: string;
  busyAction: string | null;
  canManageMembers: boolean;
  onRemove: (userId: string) => Promise<void> | void;
  tokenLabel?: string;
}

export function TeamMembersList({ members, currentUserId, busyAction, canManageMembers, onRemove, tokenLabel }: TeamMembersListProps) {
  if (members.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-neutral-400">No members added yet.</p>;
  }

  const label = (tokenLabel || 'tokens').toLowerCase();

  return (
    <ul className="space-y-3">
      {members.map((member) => {
        const isViewer = member.userId === currentUserId;
        const disableRemoval = isViewer;
        const isRemoving = busyAction === `remove:${member.userId}`;
        const capLabel = member.effectiveMemberCap != null ? `${member.effectiveMemberCap.toLocaleString()} ${label}` : 'Unlimited';
        const overrideActive = member.memberTokenCapOverride != null;
        const usageLabel = `${member.memberTokenUsage.toLocaleString()} ${label}`;
        const sharedLabel = `${member.sharedTokenBalance.toLocaleString()} ${label}`;

        return (
          <li key={member.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-neutral-700">
            <div className="space-y-1">
              <p className="font-semibold text-slate-900 dark:text-neutral-100">
                {member.name || member.email || 'Unnamed member'}
                {isViewer ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-neutral-800 dark:text-neutral-300">You</span> : null}
              </p>
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                {member.role} • {member.email ?? 'email pending'}
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-neutral-400">
                <span>
                  Shared balance: <strong className="text-slate-900 dark:text-neutral-100">{sharedLabel}</strong>
                </span>
                <span>
                  Cap: <strong className="text-slate-900 dark:text-neutral-100">{capLabel}</strong>
                  {overrideActive ? ' (override)' : ''}
                </span>
                <span>
                  Usage: <strong className="text-slate-900 dark:text-neutral-100">{usageLabel}</strong>
                </span>
              </div>
            </div>
            {canManageMembers ? (
              <button
                onClick={() => onRemove(member.userId)}
                disabled={disableRemoval || isRemoving}
                className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {disableRemoval ? 'Owner' : isRemoving ? 'Removing…' : 'Remove'}
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
