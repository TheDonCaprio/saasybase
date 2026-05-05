'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TeamDashboardOrganization, TeamDashboardState } from '../../lib/team-dashboard';
import { getVisiblePendingViewerInvites, type ViewerPendingTeamInvite } from '../../lib/team-invite-utils';
import type { TeamSubscriptionStatus } from '../../lib/organization-access';
import { activateWorkspaceAndNavigate } from '../../lib/active-workspace.client';
import { useAuthSession } from '@/lib/auth-provider/client';
import { refreshVisibleRoute } from '@/lib/client-route-revalidation';
import { dashboardPanelClass, dashboardMutedPanelClass } from '../dashboard/dashboardSurfaces';
import { ProvisionRefreshButton } from './ProvisionRefreshButton';
import { ConfirmModal } from '../ui/ConfirmModal';

import { TeamMembersList } from './TeamMembersList';
import { InviteAcceptanceClient } from './InviteAcceptanceClient';
import { SharedTokenCapsModal } from './SharedTokenCapsModal';
import { InviteTeammatesModal } from './InviteTeammatesModal';

interface Viewer {
  id: string;
  name: string | null;
  email: string | null;
}

interface StatusBanner {
  tone: 'success' | 'error';
  message: string;
}

type DeleteEligibilityState = {
  loading: boolean;
  hasActivePlans: boolean;
  planNames: string[];
  error: string | null;
};

type ApiResponse = {
  ok: boolean;
  access?: TeamSubscriptionStatus;
  organization?: TeamDashboardOrganization | null;
  error?: string;
};

type TeamManagementClientProps = {
  initialState: TeamDashboardState;
  viewer: Viewer;
  pendingInvitesForViewer?: ViewerPendingTeamInvite[];
};

type CapStrategy = 'SOFT' | 'HARD' | 'DISABLED';



const defaultError = 'Something went wrong. Please try again.';
const ORG_SWITCH_REFRESH_DELAY_MS = 600;

export function TeamManagementClient({ initialState, viewer, pendingInvitesForViewer }: TeamManagementClientProps) {
  const router = useRouter();
  const { orgId } = useAuthSession();
  const currentOrgId = orgId ?? null;
  const [state, setState] = useState<TeamDashboardState>(initialState);
  const [status, setStatus] = useState<StatusBanner | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [autoSynced, setAutoSynced] = useState(false);
  const [showCapsModal, setShowCapsModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [orgNameInput, setOrgNameInput] = useState('');
  const [deleteEligibility, setDeleteEligibility] = useState<DeleteEligibilityState>({
	loading: false,
	hasActivePlans: false,
	planNames: [],
	error: null,
  });
  const previousOrgIdRef = useRef(currentOrgId);
  const ORG_NAME_MAX = 30;
  const ORG_NAME_RE = /^[A-Za-z0-9\-\.\s,']+$/;

  const allowed = state.access.allowed;
  const organization = state.organization;
  const ownerAccess = state.access.allowed && state.access.kind === 'OWNER'
    ? state.access
    : null;
  const isOwner = ownerAccess !== null;
  const ownerSubscription = ownerAccess?.subscription ?? null;
  const canProvisionOrganization = Boolean(
    ownerSubscription
      && ['ACTIVE', 'PENDING', 'PAST_DUE'].includes(ownerSubscription.status)
      && new Date(ownerSubscription.expiresAt).getTime() > Date.now()
  );
  const canManageMembers = Boolean(isOwner);

  useEffect(() => {
    // Reset modal states or other side effects if needed when organization changes
  }, [organization]);

  const applyState = useCallback((payload: ApiResponse, successMessage?: string) => {
    if (payload.ok && payload.access) {
      setState({ access: payload.access, organization: payload.organization ?? null });
      if (successMessage) {
        setStatus({ tone: 'success', message: successMessage });
      } else {
        setStatus(null);
      }
    } else {
      setStatus({ tone: 'error', message: payload.error || defaultError });
    }
  }, []);

  const callEndpoint = useCallback(async (url: string, init?: RequestInit, successMessage?: string) => {
    try {
      const response = await fetch(url, init);
      const payload = (await response.json()) as ApiResponse;
      applyState(payload, successMessage);
      return payload;
    } catch (err) {
      console.error(err);
      setStatus({ tone: 'error', message: defaultError });
      return null;
    }
  }, [applyState]);

  const refresh = useCallback(
    async (forceSync: boolean) => {
      setBusyAction('refresh');
      await callEndpoint(`/api/team/summary${forceSync ? '?sync=1' : ''}`);
      setBusyAction(null);
    },
    [callEndpoint]
  );

  const handleProvision = useCallback(async () => {
    setBusyAction('provision');
    try {
      const body: Record<string, unknown> = {};
      const name = orgNameInput?.trim();
      if (name && name.length > 0) body.name = name;
      const response = await fetch('/api/team/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as ApiResponse;
      applyState(payload, 'Workspace provisioned.');
      if (payload.ok && payload.access) {
        const nextOrganizationId = payload.organization?.id ?? null;
        if (nextOrganizationId) {
          const switched = await activateWorkspaceAndNavigate(nextOrganizationId, '/dashboard/team');
          if (switched) {
            return;
          }
        }

        router.refresh();
      }
    } catch (err) {
      console.error(err);
      setStatus({ tone: 'error', message: defaultError });
    } finally {
      setBusyAction(null);
    }
  }, [applyState, orgNameInput, router]);

  const handleInvite = useCallback(
    async (email: string, role: string) => {
      setBusyAction('invite');
      const payload = await callEndpoint(
        '/api/team/invite',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role }),
        },
        'Invitation sent.'
      );
      setBusyAction(null);
      return payload?.ok === true;
    },
    [callEndpoint]
  );

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      setBusyAction(`remove:${userId}`);
      await callEndpoint(
        '/api/team/members/remove',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        },
        'Member removed.'
      );
      setBusyAction(null);
    },
    [callEndpoint]
  );

  const handleSetCapOverride = useCallback(
    async (userId: string, cap: number | null) => {
      setBusyAction(`cap:${userId}`);
      await callEndpoint(
        '/api/team/members/cap-override',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, capOverride: cap }),
        },
        cap == null ? 'Member cap override cleared.' : `Member cap set to ${cap.toLocaleString()}.`
      );
      setBusyAction(null);
    },
    [callEndpoint]
  );

  const handleRevokeInvite = useCallback(
    async (token: string) => {
      setBusyAction(`revoke:${token}`);
      await callEndpoint(
        '/api/team/invite/revoke',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        },
        'Invitation revoked.'
      );
      setBusyAction(null);
    },
    [callEndpoint]
  );

  const handleResendInvite = useCallback(
    async (token: string) => {
      setBusyAction(`resend:${token}`);
      await callEndpoint(
        '/api/team/invite/resend',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        },
        'Invitation resent.'
      );
      setBusyAction(null);
    },
    [callEndpoint]
  );

  const handleUpdateCaps = useCallback(async (caps: {
    memberTokenCap: number | null;
    memberCapStrategy: CapStrategy;
    memberCapResetIntervalHours: number | null;
    ownerExemptFromCaps: boolean;
  }) => {
    if (!isOwner) return;

    setBusyAction('updateCaps');
    await callEndpoint(
      '/api/team/settings',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(caps),
      },
      'Workspace caps updated.'
    );
    setBusyAction(null);
  }, [isOwner, callEndpoint]);

  const handleDeleteOrganization = useCallback(async () => {
  if (!organization || !isOwner) return;

  setBusyAction('delete-org');
  try {
    const response = await fetch('/api/organization/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizationId: organization.id }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete organization');
    }

    await fetch('/api/user/active-org', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgId: null }),
    }).catch(() => null);

    router.replace('/dashboard/team?orgDeleted=1');
    router.refresh();
  } catch (error) {
    console.error(error);
    setStatus({
    tone: 'error',
    message: error instanceof Error ? error.message : 'Failed to delete organization.',
    });
    setBusyAction(null);
  }
  }, [organization, isOwner, router]);

  const pendingInvites = useMemo(() => {
    if (!organization) return [] as TeamDashboardOrganization['invites'];
    // Only show actively pending invites in the management UI; expired or
    // revoked invites should be hidden from the active list.
    return organization.invites.filter((invite) => invite.status === 'PENDING');
  }, [organization]);

  const viewerPendingInvites = useMemo(
    () => getVisiblePendingViewerInvites(pendingInvitesForViewer, organization?.id),
    [organization?.id, pendingInvitesForViewer],
  );



  const tokenLabel = (organization?.planTokenName?.trim() || 'tokens').toLowerCase();
  const tokenLabelTitle = tokenLabel.charAt(0).toUpperCase() + tokenLabel.slice(1);
  const isSharedPoolStrategy = organization?.tokenPoolStrategy === 'SHARED_FOR_ORG';
  const tokenPoolLabel = isSharedPoolStrategy ? 'Shared pool' : 'Per-member allocation';

  useEffect(() => {
    setState(initialState);
    setStatus(null);
    setBusyAction(null);
    setShowCapsModal(false);
    setShowInviteModal(false);
    setShowDeleteModal(false);
    setAutoSynced(false);
    setDeleteEligibility({ loading: false, hasActivePlans: false, planNames: [], error: null });
  }, [initialState]);

  useEffect(() => {
    if (previousOrgIdRef.current === currentOrgId) {
      return;
    }

    previousOrgIdRef.current = currentOrgId;

    const timer = window.setTimeout(() => {
      refreshVisibleRoute(router, 'org-validity', '/dashboard/team');
    }, ORG_SWITCH_REFRESH_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [currentOrgId, router]);


  useEffect(() => {
    if (autoSynced) return;
    let cancelled = false;
    const runSync = async () => {
      try {
        await refresh(true);
      } finally {
        if (!cancelled) {
          setAutoSynced(true);
        }
      }
    };
    runSync().catch((err) => {
      console.error(err);
    });
    return () => {
      cancelled = true;
    };
  }, [autoSynced, refresh]);

  useEffect(() => {
  if (!showDeleteModal || !organization || !isOwner) {
    return;
  }

  let cancelled = false;

  const loadDeleteEligibility = async () => {
    setDeleteEligibility({ loading: true, hasActivePlans: false, planNames: [], error: null });
    try {
    const response = await fetch(`/api/organization/check-deletion-eligibility?organizationId=${encodeURIComponent(organization.id)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to check deletion eligibility');
    }
    if (!cancelled) {
      setDeleteEligibility({
      loading: false,
      hasActivePlans: payload.hasActivePlans === true,
      planNames: Array.isArray(payload.planNames) ? payload.planNames.filter((value: unknown): value is string => typeof value === 'string') : [],
      error: null,
      });
    }
    } catch (error) {
    if (!cancelled) {
      setDeleteEligibility({
      loading: false,
      hasActivePlans: false,
      planNames: [],
      error: error instanceof Error ? error.message : defaultError,
      });
    }
    }
  };

  loadDeleteEligibility().catch((error) => {
    console.error(error);
  });

  return () => {
    cancelled = true;
  };
  }, [showDeleteModal, organization, isOwner]);

  const seatSummary = useMemo(() => {
    if (!organization) return null;
    const { seatLimit } = organization;
    const memberCount = organization.stats.memberCount;
    const seatsRemaining = organization.stats.seatsRemaining;
    if (seatLimit == null) {
      return `${memberCount} active member${memberCount === 1 ? '' : 's'} (no seat limit)`;
    }
    return `${memberCount} / ${seatLimit} seats used${seatsRemaining != null ? ` (${seatsRemaining} remaining)` : ''}`;
  }, [organization]);

  const renderStatus = () => {
    if (!status) return null;
    const toneClass = status.tone === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200';
    return (
      <div className={`rounded-xl border px-4 py-2 text-sm ${toneClass}`}>
        {status.message}
      </div>
    );
  };

  if (!allowed) {
    // If the user has any pending invites sent to their email, show them an
    // in-dashboard acceptance UI so they don't need to check their email.
    const viewerInvites = viewerPendingInvites;
    if (viewerInvites && viewerInvites.length > 0) {
      return (
        <div className={dashboardPanelClass('space-y-4')}>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-neutral-100">Pending invitations</h2>
          <p className="text-sm text-slate-600 dark:text-neutral-400">You have pending workspace invitations. Accept or decline them below.</p>
          <div className="space-y-4">
            {viewerInvites.map((invite) => (
              <div key={invite.id} className={dashboardPanelClass('p-4')}>
                <h3 className="font-semibold">{invite.organization.name}</h3>
                <p className="text-sm text-slate-600 dark:text-neutral-400">Invite for {invite.email} • {invite.role}</p>
                <div className="mt-3">
                  <InviteAcceptanceClient token={invite.token} organizationName={invite.organization.name} inviteEmail={invite.email} viewerEmail={viewer.email} alreadyMember={false} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className={dashboardPanelClass('space-y-4')}>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-neutral-100">Team access unavailable</h2>
        <p className="text-sm text-slate-600 dark:text-neutral-400">
          Upgrade to a team plan to unlock seat management, shared billing, and organization-level controls.
        </p>
        <Link
          href="/pricing"
          prefetch={false}
          className="inline-flex w-fit items-center justify-center rounded-full bg-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700"
        >
          Explore team plans
        </Link>
      </div>
    );
  }

  if (!organization) {
    if (!isOwner) {
      return (
        <div className={dashboardPanelClass('space-y-5')}>
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-neutral-100">Workspace not available</h2>
            <p className="text-sm text-slate-600 dark:text-neutral-400">
              You’re a member of a workspace, but it hasn’t been provisioned yet. Ask the owner to finish setup.
            </p>
          </div>
        </div>
      );
    }

    if (!canProvisionOrganization) {
      return (
        <div className={dashboardPanelClass('space-y-5')}>
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-neutral-100">Workspace provisioning unavailable</h2>
            <p className="text-sm text-slate-600 dark:text-neutral-400">
              An active team plan is required before you can create a new workspace.
            </p>
          </div>
          <Link
            href="/pricing"
            prefetch={false}
            className="inline-flex w-fit items-center justify-center rounded-full bg-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700"
          >
            Explore team plans
          </Link>
        </div>
      );
    }

    return (
      <div className={dashboardPanelClass('space-y-5')}>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-neutral-100">Create your shared workspace</h2>
          <p className="text-sm text-slate-600 dark:text-neutral-400">
            Provision a team workspace to start inviting collaborators. We set up the Clerk organization, sync it with your subscription, and handle seat enforcement automatically.
          </p>
        </div>
        {renderStatus()}
        <div className="flex flex-col gap-3">
          <label className="text-sm">
            <span className="block text-sm font-medium text-slate-700 dark:text-neutral-200">Organization name</span>
            <input
              type="text"
              value={orgNameInput}
              onChange={(e) => setOrgNameInput(e.target.value)}
              placeholder="e.g. Acme Widgets"
              disabled={busyAction === 'provision'}
              maxLength={ORG_NAME_MAX}
              className="mt-2 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:opacity-50 dark:bg-neutral-900 dark:border-neutral-700"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">Optional — a friendly name for your team workspace.</p>
            {orgNameInput.trim().length > 0 && (orgNameInput.trim().length > ORG_NAME_MAX || !ORG_NAME_RE.test(orgNameInput.trim())) ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{`Name must be 1-${ORG_NAME_MAX} characters and may contain letters, numbers, dash (-), dot (.), space, comma, and apostrophe (').`}</p>
            ) : null}
          </label>

          <div>
            <button
              onClick={handleProvision}
              disabled={busyAction === 'provision'}
              className="inline-flex w-fit items-center justify-center rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'provision' ? 'Provisioning…' : 'Provision workspace'}
            </button>
          </div>
        </div>
        <p className={dashboardMutedPanelClass('text-xs text-slate-500 dark:text-neutral-400')}>
          Need help?{' '}
          <Link href="/dashboard/support" prefetch={false} className="font-medium text-indigo-600 dark:text-indigo-300">
            Open a support request
          </Link>{' '}
          and we’ll walk you through advanced seat setups.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {viewerPendingInvites.length > 0 ? (
        <section className={dashboardPanelClass('space-y-4')}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Additional workspace invites</p>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Pending invitations for other workspaces</h3>
              <p className="text-sm text-slate-600 dark:text-neutral-400">
                You already have access to a workspace. These invitations let you join additional workspaces without going back to the email link.
              </p>
            </div>
            <div className={dashboardMutedPanelClass('px-3 py-2 text-sm text-slate-600 dark:text-neutral-300')}>
              {viewerPendingInvites.length} pending
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {viewerPendingInvites.map((invite) => (
              <div key={invite.id} className={dashboardMutedPanelClass('space-y-3 p-4')}>
                <div>
                  <h4 className="text-base font-semibold text-slate-900 dark:text-neutral-100">{invite.organization.name}</h4>
                  <p className="text-sm text-slate-600 dark:text-neutral-400">Invite for {invite.email} as {invite.role.toLowerCase()}</p>
                </div>
                <InviteAcceptanceClient
                  token={invite.token}
                  organizationName={invite.organization.name}
                  inviteEmail={invite.email}
                  viewerEmail={viewer.email}
                  alreadyMember={false}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className={dashboardPanelClass('space-y-4')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Workspace</p>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-neutral-100">{organization.name}</h2>
            <p className="text-sm text-slate-600 dark:text-neutral-400">Slug: {organization.slug}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <ProvisionRefreshButton onRefresh={() => refresh(true)} disabled={busyAction === 'refresh'} />
            {isOwner ? (
              <button
                type="button"
                onClick={() => {
                  setStatus(null);
                  setShowDeleteModal(true);
                }}
                aria-label="Delete organization"
                title="Delete organization"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-300 bg-white text-red-700 shadow-sm transition hover:border-red-400 hover:bg-red-50 dark:border-red-500/50 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-500/10"
              >
                <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>
        {renderStatus()}
        <div className="grid gap-4 md:grid-cols-3">
          <div className={dashboardMutedPanelClass('p-4 text-sm text-slate-600 dark:text-neutral-300')}>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Seat usage</p>
            <p className="text-base font-semibold text-slate-900 dark:text-neutral-100">{seatSummary}</p>
          </div>
          <div className={dashboardMutedPanelClass('p-4 text-sm text-slate-600 dark:text-neutral-300')}>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Pending invites</p>
            <p className="text-base font-semibold text-slate-900 dark:text-neutral-100">{pendingInvites.length}</p>
          </div>
          <div className={dashboardMutedPanelClass('p-4 text-sm text-slate-600 dark:text-neutral-300')}>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Token pool</p>
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-slate-900 dark:text-neutral-100">{tokenPoolLabel}</p>
              {isOwner && isSharedPoolStrategy && (
                <button
                  onClick={() => setShowCapsModal(true)}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  Manage caps
                </button>
              )}
            </div>
          </div>
        </div>
      </div>



      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={dashboardPanelClass('space-y-4')}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Team members</h3>
              <p className="text-sm text-slate-600 dark:text-neutral-400">Manage seats and remove access instantly.</p>
            </div>
            {canManageMembers && (
              <button
                onClick={() => {
                  setStatus(null);
                  setShowInviteModal(true);
                }}
                className="inline-flex items-center justify-center rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700"
              >
                Invite member
              </button>
            )}
          </div>
          <TeamMembersList
            members={organization.members}
            tokenPoolStrategy={organization.tokenPoolStrategy}
            currentUserId={viewer.id}
            busyAction={busyAction}
            canManageMembers={canManageMembers}
            onRemove={handleRemoveMember}
            onSetCapOverride={handleSetCapOverride}
            tokenLabel={tokenLabelTitle}
          />
        </section>

        <section className={dashboardPanelClass('space-y-4')}>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
              <span>Pending invites</span>
              <span>{pendingInvites.length}</span>
            </div>
            {pendingInvites.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-neutral-400">No pending invites.</p>
            ) : (
              <ul className="space-y-3">
                {pendingInvites.map((invite) => (
                  <li key={invite.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-neutral-700">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-neutral-100">{invite.email}</p>
                      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">{invite.role}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleResendInvite(invite.token)}
                        disabled={busyAction === `resend:${invite.token}`}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyAction === `resend:${invite.token}` ? 'Resending…' : 'Resend'}
                      </button>
                      <button
                        onClick={() => handleRevokeInvite(invite.token)}
                        disabled={busyAction === `revoke:${invite.token}`}
                        className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyAction === `revoke:${invite.token}` ? 'Revoking…' : 'Revoke'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {organization && isSharedPoolStrategy && (
        <SharedTokenCapsModal
          isOpen={showCapsModal}
          onClose={() => setShowCapsModal(false)}
          organization={organization}
          onUpdateCaps={handleUpdateCaps}
          busyAction={busyAction}
          tokenLabel={tokenLabel}
          tokenLabelTitle={tokenLabelTitle}
        />
      )}
      {organization && (
        <>
          <InviteTeammatesModal
            isOpen={showInviteModal}
            onClose={() => {
              setShowInviteModal(false);
              setStatus(null);
            }}
            onInvite={handleInvite}
            isSubmitting={busyAction === 'invite'}
            seatsRemaining={organization.stats.seatsRemaining}
            notice={showInviteModal ? status : null}
          />
        </>
      )}

    <ConfirmModal
    isOpen={showDeleteModal}
    onClose={() => {
      if (busyAction === 'delete-org') return;
      setShowDeleteModal(false);
    }}
    onConfirm={handleDeleteOrganization}
    title="Delete organization"
    description="Delete this workspace and remove its memberships and invites. Historical billing records remain detached for continuity. This action cannot be undone."
    confirmLabel="Delete organization"
    loading={busyAction === 'delete-org'}
    confirmDisabled={!organization || deleteEligibility.loading || deleteEligibility.hasActivePlans || Boolean(deleteEligibility.error)}
    >
    <div className="space-y-3 text-sm">
      {deleteEligibility.loading ? (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
        Checking whether this workspace can be deleted...
      </div>
      ) : null}
      {deleteEligibility.error ? (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
        {deleteEligibility.error}
      </div>
      ) : null}
      {deleteEligibility.hasActivePlans ? (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
        <p className="font-semibold">This workspace has an active team plan.</p>
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
        Cancel the team plan before deleting this organization. {deleteEligibility.planNames.length > 0 ? `Active plan${deleteEligibility.planNames.length === 1 ? '' : 's'}: ${deleteEligibility.planNames.join(', ')}.` : ''}
        </p>
        <Link href="/dashboard/billing" className="mt-2 inline-flex text-xs font-semibold underline hover:opacity-80">
        Go to billing
        </Link>
      </div>
      ) : null}
      {!deleteEligibility.loading && !deleteEligibility.error && !deleteEligibility.hasActivePlans ? (
      <p className="text-slate-600 dark:text-neutral-300">
        The confirm button is enabled because this workspace no longer has an active team plan attached.
      </p>
      ) : null}
    </div>
    </ConfirmModal>
    </div>
  );
}
