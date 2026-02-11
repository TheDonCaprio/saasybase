'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { showToast } from '../ui/Toast';
import { ConfirmModal } from '../ui/ConfirmModal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faCircleNotch } from '@fortawesome/free-solid-svg-icons';

type MemberRecord = {
  id: string;
  userId: string;
  role: string;
  status: string;
  sharedTokenBalance: number;
  memberTokenCapOverride: number | null;
  memberTokenUsage: number;
  memberTokenUsageWindowStart: string | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
  } | null;
};

type InviteRecord = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
};

type Props = {
  orgId: string;
  orgName: string;
  onClose: () => void;
};

export function OrganizationMembersModal({ orgId, orgName, onClose }: Props) {
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<MemberRecord | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/organizations/${orgId}/members`, { cache: 'no-store' });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load members');
        }
        const json = await response.json();
        if (cancelled) return;
        setMembers(Array.isArray(json?.members) ? json.members : []);
        setInvites(Array.isArray(json?.invites) ? json.invites : []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load members';
        setError(message);
        showToast(message, 'error');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;

    setRemovingMemberId(memberToRemove.id);
    try {
      const response = await fetch(`/api/admin/organizations/${orgId}/members/${memberToRemove.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to remove member');
      }

      setMembers((prev) => prev.filter((m) => m.id !== memberToRemove.id));
      showToast(`Removed ${memberToRemove.user?.name || memberToRemove.user?.email || 'member'}`, 'success');
      setMemberToRemove(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove member';
      showToast(message, 'error');
    } finally {
      setRemovingMemberId(null);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60000] flex items-start justify-center overflow-y-auto px-4 py-6 sm:py-10">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm dark:bg-neutral-950/80"
        onClick={onClose}
        aria-label="Close members modal"
      />
      <div className="relative z-[60001] flex w-full max-w-4xl mx-4 sm:mx-auto flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-neutral-800/80 dark:bg-neutral-950/95">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-neutral-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Members · {orgName}</h2>
            <p className="text-sm text-slate-500 dark:text-neutral-400">Full roster including pending invites</p>
          </div>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white" aria-label="Close members modal">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {loading && <div className="text-sm text-slate-500 dark:text-neutral-400">Loading members…</div>}
          {error && !loading && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-100">{error}</div>}

          {!loading && !error && (
            <>
              <section>
                <header className="mb-3 flex items-center justify-between text-sm text-slate-500 dark:text-neutral-400">
                  <span>{members.length} active members</span>
                </header>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                  {members.map((member) => (
                    <div key={member.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/30">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">{member.user?.name ?? 'Unknown user'}</div>
                          <div className="text-xs text-slate-500 dark:text-neutral-400">{member.user?.email ?? member.userId}</div>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-neutral-800 dark:text-neutral-200">{member.status}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-neutral-400 mt-3 pt-3 border-t border-slate-200 dark:border-neutral-800">
                        <div>
                          <span className="block font-semibold text-slate-700 dark:text-neutral-300">Role</span>
                          {member.role}
                        </div>
                        <div>
                          <span className="block font-semibold text-slate-700 dark:text-neutral-300">Shared Tokens</span>
                          {formatNumber(member.sharedTokenBalance)}
                        </div>
                        <div>
                          <span className="block font-semibold text-slate-700 dark:text-neutral-300">Usage</span>
                          {formatNumber(member.memberTokenUsage)}
                        </div>
                        <div>
                          <span className="block font-semibold text-slate-700 dark:text-neutral-300">Cap Override</span>
                          {member.memberTokenCapOverride ?? 'None'}
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-neutral-800">
                        <button
                          type="button"
                          onClick={() => setMemberToRemove(member)}
                          disabled={removingMemberId === member.id}
                          className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-500 dark:hover:bg-red-600"
                        >
                          {removingMemberId === member.id ? (
                            <FontAwesomeIcon icon={faCircleNotch} className="h-3 w-3 animate-spin" />
                          ) : (
                            <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                          )}
                          {removingMemberId === member.id ? 'Removing...' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-hidden rounded-lg border border-slate-200 dark:border-neutral-800">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-neutral-800 text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-neutral-900/60 dark:text-neutral-400">
                      <tr>
                        <th className="px-4 py-3">Member</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Shared tokens</th>
                        <th className="px-4 py-3">Cap override</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-neutral-800">
                      {members.map((member) => (
                        <tr key={member.id} className="bg-white dark:bg-neutral-900/20">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 dark:text-white">{member.user?.name ?? 'Unknown user'}</div>
                            <div className="text-xs text-slate-500 dark:text-neutral-400">{member.user?.email ?? member.userId}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-neutral-300">{member.role}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900 dark:text-white">{formatNumber(member.sharedTokenBalance)}</div>
                            <div className="text-xs text-slate-500 dark:text-neutral-500">Usage: {formatNumber(member.memberTokenUsage)}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-neutral-300">{member.memberTokenCapOverride ?? 'None'}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-neutral-800 dark:text-neutral-200">{member.status}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setMemberToRemove(member)}
                              disabled={removingMemberId === member.id}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-500 dark:hover:bg-red-600"
                              title="Remove member"
                            >
                              {removingMemberId === member.id ? (
                                <FontAwesomeIcon icon={faCircleNotch} className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <header className="mb-3 flex items-center justify-between text-sm text-slate-500 dark:text-neutral-400">
                  <span>{invites.length} pending invites</span>
                </header>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                  {invites.map((invite) => (
                    <div key={invite.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/30">
                      <div className="flex items-start justify-between mb-2">
                        <div className="font-medium text-slate-900 dark:text-white">{invite.email}</div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-neutral-800 dark:text-neutral-200">{invite.status}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-neutral-400 mt-3 pt-3 border-t border-slate-200 dark:border-neutral-800">
                        <div>
                          <span className="block font-semibold text-slate-700 dark:text-neutral-300">Role</span>
                          {invite.role}
                        </div>
                        <div>
                          <span className="block font-semibold text-slate-700 dark:text-neutral-300">Expires</span>
                          {invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : '—'}
                        </div>
                      </div>
                    </div>
                  ))}
                  {invites.length === 0 && (
                    <div className="text-center text-sm text-slate-500 dark:text-neutral-500 py-4">No pending invites</div>
                  )}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-hidden rounded-lg border border-slate-200 dark:border-neutral-800">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-neutral-800 text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-neutral-900/60 dark:text-neutral-400">
                      <tr>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Expires</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-neutral-800">
                      {invites.map((invite) => (
                        <tr key={invite.id} className="bg-white dark:bg-neutral-900/20">
                          <td className="px-4 py-3 text-slate-900 dark:text-white">{invite.email}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-neutral-300">{invite.role}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-neutral-300">{invite.status}</td>
                          <td className="px-4 py-3 text-slate-500 dark:text-neutral-400">{invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))}
                      {invites.length === 0 && (
                        <tr>
                          <td className="px-4 py-4 text-center text-slate-500 dark:text-neutral-500" colSpan={4}>No pending invites</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-neutral-800">
          <button onClick={onClose} className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800">Close</button>
        </div>

        <ConfirmModal
          isOpen={!!memberToRemove}
          onClose={() => setMemberToRemove(null)}
          onConfirm={handleRemoveMember}
          title="Remove Member"
          description={`Are you sure you want to remove ${memberToRemove?.user?.name || memberToRemove?.user?.email || 'this member'} from ${orgName}? This action cannot be undone.`}
          confirmLabel="Remove"
          loading={removingMemberId === memberToRemove?.id}
        />
      </div>
    </div>,
    document.body
  );
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US').format(Number(value ?? 0));
}
