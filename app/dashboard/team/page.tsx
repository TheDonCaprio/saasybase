import { prisma } from '../../../lib/prisma';
import { fetchTeamDashboardState } from '../../../lib/team-dashboard';
import { TeamProvisioner } from '../../../components/team/TeamProvisioner';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '../../../lib/route-guards';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Team',
    description: 'Invite teammates, track seat usage, and manage your shared workspace.',
    audience: 'user',
  });
}

export default async function TeamDashboardPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const returnPath = buildReturnPath('/dashboard/team', resolvedSearchParams);
  const { userId } = await requireAuth(returnPath);

  const viewerRecord = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  const [state, pendingInvites] = await Promise.all([
    fetchTeamDashboardState(userId),
    // Fetch any pending invites sent to this user's email so they can accept on-site
    prisma.organizationInvite.findMany({
      where: { email: viewerRecord?.email ?? undefined, status: 'PENDING' },
      include: { organization: { select: { id: true, name: true, slug: true } } },
    }),
  ]);

  const viewer = {
    id: userId,
    name: viewerRecord?.name ?? null,
    email: viewerRecord?.email ?? null,
  };

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        accent="violet"
        eyebrow="Team workspace"
        title="Manage your organization"
      />
      <TeamProvisioner initialState={state} viewer={viewer} pendingInvitesForViewer={pendingInvites} />
    </div>
  );
}
