'use client';

import { useMemo, useState } from 'react';
import ListFilters from '../ui/ListFilters';
import { useListFilterState } from '../hooks/useListFilters';
import usePaginatedList from '../hooks/usePaginatedList';
import { dashboardMutedPanelClass, dashboardPanelClass } from '../dashboard/dashboardSurfaces';
import { Pagination } from '../ui/Pagination';
import { OrganizationMembersModal } from './OrganizationMembersModal';
import EditOrganizationModal from './EditOrganizationModal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faPenToSquare, faTrash, faCircleNotch } from '@fortawesome/free-solid-svg-icons';
import { ConfirmModal } from '../ui/ConfirmModal';
import { showToast } from '../ui/Toast';

type OrganizationOwner = {
  id: string;
  name: string | null;
  email: string | null;
};

type OrganizationPlan = {
  id: string;
  name: string;
};

export type OrganizationRecord = {
  id: string;
  name: string;
  slug: string;
  owner: OrganizationOwner | null;
  billingEmail: string | null;
  plan: OrganizationPlan | null;
  tokenBalance: number;
  memberTokenCap: number | null;
  memberCapStrategy: string | null;
  memberCapResetIntervalHours: number | null;
  tokenPoolStrategy: string | null;
  seatLimit: number | null;
  activeMembers: number;
  pendingInvites: number;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

type PageInfo = {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type Props = {
  initialOrganizations: OrganizationRecord[];
  initialPageInfo: PageInfo;
};

export function OrganizationsClient({ initialOrganizations, initialPageInfo }: Props) {
  const itemsPerPage = initialPageInfo.limit ?? 25;
  const { search, setSearch, debouncedSearch, status, setStatus } = useListFilterState('', 'ALL');
  const [sortBy, setSortBy] = useState<'createdAt' | 'name' | 'members' | 'tokenBalance' | 'pendingInvites'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const filters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: status !== 'ALL' ? status : undefined,
      sortBy,
      sortOrder
    }),
    [debouncedSearch, sortBy, sortOrder, status]
  );

  const {
    items: organizations,
    setItems,
    totalCount,
    currentPage,
    isLoading,
    nextCursor,
    fetchPage,
    refresh
  } = usePaginatedList<OrganizationRecord>({
    basePath: '/api/admin/organizations',
    initialItems: initialOrganizations,
    initialTotalCount: initialPageInfo.totalCount,
    initialPage: initialPageInfo.page,
    itemsPerPage,
    itemsKey: 'data',
    filters
  });

  const [membersOrg, setMembersOrg] = useState<OrganizationRecord | null>(null);
  const [editOrg, setEditOrg] = useState<OrganizationRecord | null>(null);
  const [orgToDelete, setOrgToDelete] = useState<OrganizationRecord | null>(null);
  const [deletingOrgId, setDeletingOrgId] = useState<string | null>(null);

  const handleOrganizationUpdated = (updated: Partial<OrganizationRecord> & { id: string }) => {
    setItems((prev) => prev.map((org) => (org.id === updated.id ? { ...org, ...updated } : org)));
  };

  const handleDeleteOrganization = async () => {
    if (!orgToDelete) return;

    setDeletingOrgId(orgToDelete.id);
    try {
      const response = await fetch(`/api/admin/organizations/${orgToDelete.id}/delete`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete organization');
      }

      setItems((prev) => prev.filter((org) => org.id !== orgToDelete.id));
      showToast(`Deleted organization "${orgToDelete.name}"`, 'success');
      setOrgToDelete(null);
      refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete organization';
      showToast(message, 'error');
    } finally {
      setDeletingOrgId(null);
    }
  };

  const handleStatusChange = (nextStatus: string) => {
    setStatus(nextStatus);
  };

  const handleSortChange = (nextSort: string) => {
    setSortBy((nextSort as typeof sortBy) ?? 'createdAt');
  };

  const handleSortOrderChange = (nextOrder: 'asc' | 'desc') => {
    setSortOrder(nextOrder);
  };

  const noResults = !isLoading && organizations.length === 0;
  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / itemsPerPage));
  const showingStart = organizations.length ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const showingEnd = organizations.length ? showingStart + organizations.length - 1 : 0;
  const statusOptions = ['ALL', 'SEAT_LIMITED', 'UNLIMITED_SEATS', 'HARD_CAP', 'SOFT_CAP', 'NO_CAP'];

  return (
    <div className="space-y-6">
      <div className={dashboardPanelClass('p-4 sm:p-6')}>
        <ListFilters
          search={search}
          onSearchChange={setSearch}
          placeholder="Search by name, slug, or owner"
          onRefresh={refresh}
          statusOptions={statusOptions}
          currentStatus={status}
          onStatusChange={handleStatusChange}
          sortOptions={[
            { value: 'createdAt', label: 'Created date' },
            { value: 'name', label: 'Name' },
            { value: 'members', label: 'Members' },
            { value: 'tokenBalance', label: 'Token balance' },
            { value: 'pendingInvites', label: 'Pending invites' }
          ]}
          sortBy={sortBy}
          onSortByChange={handleSortChange}
          sortOrder={sortOrder}
          onSortOrderChange={handleSortOrderChange}
          extraOptgroups={[
            { label: 'Seat policies', items: ['SEAT_LIMITED', 'UNLIMITED_SEATS'] },
            { label: 'Token caps', items: ['HARD_CAP', 'SOFT_CAP', 'NO_CAP'] }
          ]}
        />
      </div>

      <div className={dashboardMutedPanelClass('flex flex-col gap-3 min-[1025px]:flex-row min-[1025px]:items-center min-[1025px]:justify-between text-sm text-slate-600 dark:text-neutral-200')}>
        <span>
          {isLoading
            ? 'Loading organizations…'
            : organizations.length
              ? `Showing ${formatNumber(showingStart)}-${formatNumber(showingEnd)} of ${formatNumber(totalCount)} workspaces`
              : 'No workspaces match the current filters'}
        </span>
        <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-neutral-400">
          Server-side filters & pagination
        </span>
      </div>

      <div className={dashboardPanelClass('p-0 overflow-hidden')}>
        {isLoading && organizations.length === 0 && (
          <div className="p-6 sm:p-10">
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="h-28 rounded-2xl bg-slate-100/80 dark:bg-neutral-800/60 animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {noResults && (
          <div className="p-8 text-center text-slate-500 dark:text-neutral-400">
            No organizations found. Try refining your filters.
          </div>
        )}

        {!noResults && (
          <>
            <div className="min-[1025px]:hidden space-y-4 p-4 sm:p-6">
              {organizations.map((org) => (
                <div
                  key={org.id}
                  className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-950/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-neutral-50">{org.name}</p>
                      <div className="mt-0.5 flex flex-col gap-0.5 text-xs text-slate-500 dark:text-neutral-400">
                        <span className="truncate">ID: {org.id}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">/{org.slug}</span>
                          <span>•</span>
                          <span className="truncate">Owner: {org.owner?.name ?? 'Unknown'}</span>
                        </div>
                        {org.plan && (
                          <div className="text-indigo-600 dark:text-indigo-400 font-medium text-[10px] mt-0.5">
                            Plan: {org.plan.name}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                        onClick={() => setMembersOrg(org)}
                        title="Manage Members"
                      >
                        <FontAwesomeIcon icon={faUsers} className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                        onClick={() => setEditOrg(org)}
                        title="Edit Organization"
                      >
                        <FontAwesomeIcon icon={faPenToSquare} className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-500 dark:hover:bg-red-600"
                        onClick={() => setOrgToDelete(org)}
                        disabled={deletingOrgId === org.id}
                        title="Delete Organization"
                      >
                        {deletingOrgId === org.id ? (
                          <FontAwesomeIcon icon={faCircleNotch} className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-4 text-xs text-slate-500 dark:text-neutral-400">
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-neutral-100">{formatNumber(org.activeMembers)}</span> members
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-neutral-100">{formatNumber(org.tokenBalance)}</span> tokens
                    </div>
                    {org.pendingInvites > 0 && (
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-neutral-100">{formatNumber(org.pendingInvites)}</span> invites
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden min-[1025px]:block overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-neutral-800 text-sm text-slate-600 dark:text-neutral-100">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-neutral-900/70 dark:text-neutral-300">
                  <tr>
                    <th className="px-6 py-3 text-left">Organization</th>
                    <th className="px-6 py-3 text-left">Owner</th>
                    <th className="px-6 py-3 text-left">Members</th>
                    <th className="px-6 py-3 text-left">Token pool</th>
                    <th className="px-6 py-3 text-left">Member cap</th>
                    <th className="px-6 py-3 text-left">Invites</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-neutral-800 dark:bg-neutral-950/60">
                  {organizations.map((org) => (
                    <tr key={org.id} className="hover:bg-slate-50/70 dark:hover:bg-neutral-900/50">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-neutral-50">{org.name}</div>
                        <div className="text-[10px] font-mono text-slate-500 dark:text-neutral-500 uppercase tracking-tight">ID: {org.id}</div>
                        <div className="text-xs text-slate-500 dark:text-neutral-400">/{org.slug}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900 dark:text-neutral-50">{org.owner?.name ?? '—'}</div>
                        <div className="text-xs text-slate-500 dark:text-neutral-400">{org.owner?.email ?? 'No email'}</div>
                        {org.plan && (
                          <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mt-0.5">Plan: {org.plan.name}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-neutral-50">{formatNumber(org.activeMembers)}</div>
                        <div className="text-xs text-slate-500 dark:text-neutral-400">{org.seatLimit ? `Seat limit ${formatNumber(org.seatLimit)}` : 'No seat limit'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-neutral-50">{formatNumber(org.tokenBalance)}</div>
                        <div className="text-xs text-slate-500 dark:text-neutral-400">{org.tokenPoolStrategy ?? 'SHARED_FOR_ORG'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-neutral-50">{org.memberTokenCap ?? 'Unlimited'}</div>
                        <div className="text-xs text-slate-500 dark:text-neutral-400">Strategy: {org.memberCapStrategy ?? 'DISABLED'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-neutral-50">{formatNumber(org.pendingInvites)}</div>
                        <div className="text-xs text-slate-500 dark:text-neutral-400">Pending invites</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                            onClick={() => setMembersOrg(org)}
                            title="Manage Members"
                          >
                            <FontAwesomeIcon icon={faUsers} className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                            onClick={() => setEditOrg(org)}
                            title="Edit Organization"
                          >
                            <FontAwesomeIcon icon={faPenToSquare} className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-500 dark:hover:bg-red-600"
                            onClick={() => setOrgToDelete(org)}
                            disabled={deletingOrgId === org.id}
                            title="Delete Organization"
                          >
                            {deletingOrgId === org.id ? (
                              <FontAwesomeIcon icon={faCircleNotch} className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-200 px-4 py-4 sm:px-6 dark:border-neutral-800">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => fetchPage(page)}
                totalItems={totalCount}
                itemsPerPage={itemsPerPage}
                nextCursor={nextCursor}
                onNextWithCursor={(cursor) => fetchPage(currentPage + 1, false, cursor)}
              />
            </div>
          </>
        )}
      </div>

      {membersOrg && (
        <OrganizationMembersModal
          orgId={membersOrg.id}
          orgName={membersOrg.name}
          onClose={() => setMembersOrg(null)}
        />
      )}

      {editOrg && (
        <EditOrganizationModal
          orgId={editOrg.id}
          initialName={editOrg.name}
          initialSlug={editOrg.slug}
          initialTokenBalance={editOrg.tokenBalance}
          onClose={() => setEditOrg(null)}
          onUpdated={(updated) => handleOrganizationUpdated(updated)}
        />
      )}

      <ConfirmModal
        isOpen={!!orgToDelete}
        onClose={() => setOrgToDelete(null)}
        onConfirm={handleDeleteOrganization}
        title="Delete Organization"
        description={`Are you sure you want to delete "${orgToDelete?.name}"? This will permanently delete the organization, all its members, and all associated data. This action cannot be undone.`}
        confirmLabel="Delete"
        loading={deletingOrgId === orgToDelete?.id}
      />
    </div>
  );
}


