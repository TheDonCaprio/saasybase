import type { TeamDashboardState } from '../../lib/team-dashboard';
import { TeamManagementClient } from './TeamManagementClient';

type Viewer = {
  id: string;
  name: string | null;
  email: string | null;
};

type TeamProvisionerProps = {
  initialState: TeamDashboardState;
  viewer: Viewer;
  pendingInvitesForViewer?: Array<{ id: string; token: string; email: string; role: string; organization: { id: string; name: string } }>;
};

/**
 * Server-wrapper that hands initial dashboard data to the client manager.
 */
export function TeamProvisioner({ initialState, viewer, pendingInvitesForViewer }: TeamProvisionerProps) {
  return <TeamManagementClient initialState={initialState} viewer={viewer} pendingInvitesForViewer={pendingInvitesForViewer} />;
}
