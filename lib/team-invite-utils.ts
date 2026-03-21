export type ViewerPendingTeamInvite = {
  id: string;
  token: string;
  email: string;
  role: string;
  organization: {
    id: string;
    name: string;
  };
};

export function getVisiblePendingViewerInvites(
  pendingInvitesForViewer: ViewerPendingTeamInvite[] | undefined,
  activeOrganizationId?: string | null,
): ViewerPendingTeamInvite[] {
  if (!pendingInvitesForViewer || pendingInvitesForViewer.length === 0) {
    return [];
  }

  const seenOrganizationIds = new Set<string>();
  const visibleInvites: ViewerPendingTeamInvite[] = [];

  for (const invite of pendingInvitesForViewer) {
    const organizationId = invite.organization.id;
    if (!organizationId || organizationId === activeOrganizationId || seenOrganizationIds.has(organizationId)) {
      continue;
    }

    seenOrganizationIds.add(organizationId);
    visibleInvites.push(invite);
  }

  return visibleInvites;
}