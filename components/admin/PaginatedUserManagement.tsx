'use client';

import { useState, useEffect, useRef } from 'react';
import { formatDate } from '../../lib/formatDate';
import { getCanonicalActiveSubscription, SubRecord } from '../../lib/subscriptions';
import { useFormatSettings } from '../FormatSettingsProvider';
import { UserActions } from './UserActions';
import { UserEditModal } from './UserEditModal';
import { UserPaymentsModal } from './UserPaymentsModal';
import { Pagination } from '../ui/Pagination';
import { dashboardPanelClass, dashboardMutedPanelClass } from '../dashboard/dashboardSurfaces';
// showToast intentionally unused in this component for now
// import { showToast } from '../ui/Toast';
// keep reference to potential global helper to silence lint in alternate builds
// void showToast;
import ListFilters from '../ui/ListFilters';
import { useListFilterState } from '../hooks/useListFilters';
import usePaginatedList from '../hooks/usePaginatedList';
import { useSearchParams, useRouter } from 'next/navigation';

interface ClerkData {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string;
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
    verification: { status: string };
  }>;
  phoneNumbers: Array<{
    id: string;
    phoneNumber: string;
    verification: { status: string };
  }>;
  lastSignInAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface User {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  createdAt: Date;
  subscriptions: SubRecord[];
  _count: { payments: number };
  clerkData: ClerkData | null;
  tokenBalance: number;
}



interface PaginatedUserManagementProps {
  initialUsers: User[];
  initialTotalCount: number;
  initialPage: number;
  currentAdminId: string;
  canManageRoles: boolean;
}

const numberFormatter = new Intl.NumberFormat('en-US');

export function PaginatedUserManagement({ 
  initialUsers, 
  initialTotalCount, 
  initialPage,
  currentAdminId,
  canManageRoles,
}: PaginatedUserManagementProps) {
  const itemsPerPage = 50;
  const { search, setSearch, debouncedSearch, status, setStatus } = useListFilterState('', 'ALL');
  const [sortBy, setSortBy] = useState<'createdAt' | 'name' | 'payments'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [paymentsModalOpen, setPaymentsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const {
    items: users,
    setItems,
    totalCount,
    currentPage,
    isLoading,
    nextCursor,
    fetchPage,
    fetchNext,
    refresh
  } = usePaginatedList<User>({
    basePath: '/api/admin/users',
    initialItems: initialUsers,
    initialTotalCount: initialTotalCount,
    initialPage,
    itemsPerPage,
    itemsKey: 'users',
    filters: (() => {
      // status select on this page contains both role values and billing values (PAID/FREE)
      const roleFilter = status && status !== 'ALL' && status !== 'PAID' && status !== 'FREE' ? status : undefined;
      const billingFilter = status === 'PAID' || status === 'FREE' ? status : undefined;
      return {
        search: debouncedSearch || undefined,
        role: roleFilter,
        billing: billingFilter,
        sortBy,
        sortOrder
      };
    })()
  });

  const totalPages = totalCount ? Math.ceil(totalCount / itemsPerPage) : Math.max(1, currentPage + (nextCursor ? 1 : 0));

  // Some flows only use the hook for rendering; reference helpers to silence lint
  void fetchNext;
  void nextCursor;
  void totalCount;

  // usePaginatedList handles fetching; fetchPage(page) will replace items, fetchNext/append when using cursor

  const searchParams = useSearchParams();
  const router = useRouter();
  const prefocusHandledRef = useRef(false);
  const [prefocusUserId, setPrefocusUserId] = useState<string | null>(null);

  useEffect(() => {
    const queryUserId = searchParams?.get('userId') ?? searchParams?.get('user');
    if (!queryUserId || prefocusHandledRef.current) {
      return;
    }

    setPrefocusUserId((prev) => prev ?? queryUserId);
    setSearch((prev) => (prev === queryUserId ? prev : queryUserId));
  }, [searchParams, setSearch]);

  useEffect(() => {
    if (!prefocusUserId || prefocusHandledRef.current) {
      return;
    }

    const found = users.find((candidate) => candidate.id === prefocusUserId || candidate.email === prefocusUserId);
    if (!found) {
      return;
    }

  prefocusHandledRef.current = true;
  setSelectedUser(found);
  setEditModalOpen(true);

    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        params.delete('userId');
        params.delete('user');
        const nextSearch = params.toString();
        router.replace(`${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { scroll: false });
      } catch (error) {
        void error;
      }
    }
  }, [users, prefocusUserId, router]);

  const handlePageChange = (page: number) => fetchPage(page);

  const handleFilterChange = (newFilter: string) => setSearch(newFilter);

  const handleRoleFilterChange = (role: string) => {
    setStatus(role);
    // ensure first page fetched with new role
    fetchPage(1);
  };

  const handleUserUpdate = (updatedUser: Partial<User>) => {
    if (!updatedUser.id) return; // require id to merge
    setItems(prev => prev.map(u => u.id === updatedUser.id ? { ...u, ...(updatedUser as Partial<User>) } : u));
    setSelectedUser(prev => {
      if (!prev || prev.id !== updatedUser.id) return prev;
      return { ...prev, ...(updatedUser as Partial<User>) } as User;
    });
  };

  const handleUserDeleted = (userId: string) => {
    setItems(prev => prev.filter(u => u.id !== userId));
    if (selectedUser?.id === userId) {
      setEditModalOpen(false);
      setPaymentsModalOpen(false);
      setSelectedUser(null);
    }
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setEditModalOpen(true);
  };

  const handleViewPayments = (user: User) => {
    setSelectedUser(user);
    setPaymentsModalOpen(true);
  };

  const refreshUsers = () => refresh();

  // (Cursor support remains server-side; UI uses numbered pagination only)

  // Debounced search / role change: trigger fetch for page 1 after user stops typing or role changes
  useEffect(() => {
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, status]);

  const settings = useFormatSettings();

  // initialUsers provided by the server; UI will use page-based pagination
  // initialUsers provided by the server are wired into the hook via initialItems

  // Handler for progressive fetch using server-provided cursor (append)
  const handleNextWithCursor = async (cursor: string) => {
    if (!cursor) return;
  // navigate-with-cursor (replace current items) instead of append/load-more
  await fetchPage(currentPage + 1, false, cursor);
  };

  return (
    <div className="space-y-6">
      <div className={dashboardPanelClass('p-4 sm:p-6')}>
        <ListFilters
          search={search}
          onSearchChange={(v) => handleFilterChange(v)}
          statusOptions={['ALL', 'USER', 'MODERATOR', 'ADMIN', 'PAID', 'FREE']}
          currentStatus={status}
          onStatusChange={(s) => handleRoleFilterChange(s)}
          onRefresh={refreshUsers}
          placeholder="Search by email, name, or user ID..."
          sortOptions={[{ value: 'createdAt', label: 'Date registered' }, { value: 'name', label: 'Name' }, { value: 'payments', label: 'Purchases' }]}
          sortBy={sortBy}
          onSortByChange={(v) => { setSortBy(v as 'createdAt' | 'name' | 'payments'); void fetchPage(1); }}
          sortOrder={sortOrder}
          onSortOrderChange={(o) => { setSortOrder(o); void fetchPage(1); }}
        />
      </div>

      <div className={dashboardMutedPanelClass('flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs sm:text-sm text-slate-600 dark:text-neutral-300')}>
        <span>
          Showing {numberFormatter.format(users.length)} of {numberFormatter.format(totalCount)} accounts
        </span>
        <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-neutral-400">
          Auto-refreshing filters
        </span>
      </div>

      <div className={dashboardPanelClass('p-0 overflow-hidden')}>
        {isLoading && users.length === 0 ? (
          <div className="p-8 sm:p-12 text-center">
            <div className="animate-pulse space-y-4">
              <div className="h-12 rounded-2xl bg-slate-100 dark:bg-neutral-800" />
              <div className="h-12 rounded-2xl bg-slate-100 dark:bg-neutral-800" />
              <div className="h-12 rounded-2xl bg-slate-100 dark:bg-neutral-800" />
            </div>
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-slate-500 dark:text-neutral-400">
            No users found matching your criteria.
          </div>
        ) : (
          <>
            <div className="lg:hidden space-y-4 p-4 sm:p-5">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg dark:border-neutral-800/70 dark:bg-neutral-900/70 dark:hover:border-indigo-500/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        {user.clerkData?.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={user.clerkData.imageUrl}
                            alt=""
                            className="h-8 w-8 flex-shrink-0 rounded-full"
                          />
                        ) : (
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600 dark:bg-neutral-800 dark:text-neutral-200">
                            {(user.clerkData?.firstName?.[0] || user.name?.[0] || user.email?.[0] || '?').toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-neutral-100">
                            {user.clerkData?.fullName || user.name || 'No name'}
                          </div>
                          <div className="truncate text-xs text-slate-500 dark:text-neutral-400">
                            {user.email || 'No email'}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-neutral-400">
                        Joined {formatDate(user.createdAt, { mode: settings.mode, timezone: settings.timezone })}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold ${
                        user.role === 'ADMIN'
                          ? 'border border-purple-200 bg-purple-50 text-purple-600 dark:border-purple-500/40 dark:bg-purple-500/10 dark:text-purple-200'
                          : user.role === 'MODERATOR'
                          ? 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200'
                          : 'border border-slate-200 bg-slate-100 text-slate-600 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-100'
                      }`}
                    >
                      {user.role}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="space-y-1 text-left">
                      {(() => {
                        const canonical = getCanonicalActiveSubscription(user.subscriptions as unknown);
                        if (!canonical) return <span className="text-slate-500 dark:text-neutral-400">No subscriptions</span>;
                        return (
                          <div className="space-y-1">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-300">{canonical.plan?.name ?? 'Unknown plan'}</span>
                            {user.subscriptions.length > 1 ? (
                              <span className="block text-slate-500 dark:text-neutral-400">+{user.subscriptions.length - 1} more</span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="text-right text-slate-500 dark:text-neutral-400">
                      {user._count.payments} payment{user._count.payments === 1 ? '' : 's'}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      onClick={() => handleViewPayments(user)}
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-100 dark:hover:border-blue-500/40 dark:hover:text-blue-200"
                    >
                      View payments
                    </button>
                    <UserActions
                      user={{
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        role: user.role,
                        createdAt: user.createdAt
                      }}
                      onEdit={() => handleEditUser(user)}
                      currentAdminId={currentAdminId}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden lg:block">
              <div className="bg-slate-50/80 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-neutral-900/60 dark:text-neutral-400">
                <div className="grid grid-cols-7 gap-4">
                  <div>Name</div>
                  <div>Email</div>
                  <div>Role</div>
                  <div>Joined</div>
                  <div>Subscriptions</div>
                  <div>Payments</div>
                  <div>Actions</div>
                </div>
              </div>

              <div className="divide-y divide-slate-200/70 dark:divide-neutral-800/70">
                {users.map((user) => (
                  <div key={user.id} className="px-6 py-4 transition hover:bg-slate-50/70 dark:hover:bg-neutral-900/50">
                    <div className="grid grid-cols-7 items-center gap-4">
                      <div className="text-sm">
                        <div className="flex items-center gap-3">
                          {user.clerkData?.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={user.clerkData.imageUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded-full" />
                          ) : (
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600 dark:bg-neutral-800 dark:text-neutral-200">
                              {(user.clerkData?.firstName?.[0] || user.name?.[0] || user.email?.[0] || '?').toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900 dark:text-neutral-100">
                              {user.clerkData?.fullName || user.name || 'No name'}
                            </div>
                            <div className="truncate text-xs text-slate-500 dark:text-neutral-400">
                              {user.email || 'No email'}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="truncate text-sm text-slate-600 dark:text-neutral-200">
                        {user.email || 'No email'}
                      </div>
                      <div>
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${
                            user.role === 'ADMIN'
                              ? 'border border-purple-200 bg-purple-50 text-purple-600 dark:border-purple-500/40 dark:bg-purple-500/10 dark:text-purple-200'
                              : user.role === 'MODERATOR'
                              ? 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200'
                              : 'border border-slate-200 bg-slate-100 text-slate-600 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-100'
                          }`}
                        >
                          {user.role}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-neutral-400">
                        {formatDate(user.createdAt, { mode: settings.mode, timezone: settings.timezone })}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-neutral-200">
                        {(() => {
                          const canonical = getCanonicalActiveSubscription(user.subscriptions as unknown);
                          if (!canonical) return <span className="text-slate-500 dark:text-neutral-400">None</span>;
                          return (
                            <div className="space-y-1">
                              <span className="font-semibold text-emerald-600 dark:text-emerald-300">{canonical.plan?.name ?? 'Unknown plan'}</span>
                              {user.subscriptions.length > 1 ? (
                                <span className="block text-slate-500 dark:text-neutral-400">+{user.subscriptions.length - 1} more</span>
                              ) : null}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-neutral-300">
                        <button
                          onClick={() => handleViewPayments(user)}
                          className="font-semibold text-blue-600 transition hover:text-blue-500 dark:text-blue-300 dark:hover:text-blue-200"
                        >
                          {user._count.payments} payment{user._count.payments === 1 ? '' : 's'}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <UserActions
                          user={{
                            id: user.id,
                            email: user.email,
                            name: user.name,
                            role: user.role,
                            createdAt: user.createdAt
                          }}
                          onEdit={() => handleEditUser(user)}
                          currentAdminId={currentAdminId}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {totalPages > 1 ? (
        <div className={dashboardPanelClass('p-4 sm:p-6')}>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            totalItems={totalCount}
            itemsPerPage={itemsPerPage}
            nextCursor={nextCursor}
            onNextWithCursor={handleNextWithCursor}
          />
        </div>
      ) : null}

      {/* (No cursor load-more UI; numbered pagination above is used) */}

      {/* Modals */}
      {selectedUser && (
        <>
          <UserEditModal
            user={selectedUser}
            isOpen={editModalOpen}
            onClose={() => {
              setEditModalOpen(false);
              setSelectedUser(null);
            }}
            onUserUpdate={handleUserUpdate}
            onUserDelete={handleUserDeleted}
            canManageRoles={canManageRoles}
            currentAdminId={currentAdminId}
          />

          <UserPaymentsModal
            userId={selectedUser.id}
            userEmail={selectedUser.email}
            isOpen={paymentsModalOpen}
            onClose={() => {
              setPaymentsModalOpen(false);
              setSelectedUser(null);
            }}
          />
        </>
      )}
    </div>
  );
}
