export const dynamic = 'force-dynamic';

import { DashboardPageHeader } from '@/components/dashboard/DashboardPageHeader';
import SaaSyAppClient from '@/components/dashboard/SaaSyAppClient';
import { buildDashboardMetadata } from '@/lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '@/lib/route-guards';
import { enforceTeamWorkspaceProvisioningGuard } from '@/lib/dashboard-workspace-guard';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt } from '@fortawesome/free-solid-svg-icons';
import { prisma } from '@/lib/prisma';
import { getAuthSafe } from '@/lib/auth';
import { getDefaultTokenLabel } from '@/lib/settings';
import {
  getPlanScope,
  getOrganizationPlanContext,
  getMemberSharedTokenBalance,
} from '@/lib/user-plan-context';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'SaaSyApp',
    description: 'A tiny demo app that spends real tokens for common operations.',
    audience: 'user',
  });
}
export default async function DashboardPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const returnPath = buildReturnPath('/dashboard', resolvedSearchParams);
  const { userId } = await requireAuth(returnPath);
  await enforceTeamWorkspaceProvisioningGuard(userId);

  // Fetch workspace context and token balances for hero stat cards
  const { orgId } = await getAuthSafe();
  const planScope = getPlanScope(orgId);
  const isTeamWorkspace = planScope === 'WORKSPACE';

  const [user, defaultTokenLabel, orgContext] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { tokenBalance: true, freeTokenBalance: true },
    }),
    getDefaultTokenLabel(),
    getOrganizationPlanContext(userId, orgId),
  ]);

  const paidBalance = user?.tokenBalance ?? 0;
  const freeBalance = user?.freeTokenBalance ?? 0;
  const sharedBalance = getMemberSharedTokenBalance(orgContext);
  const orgName = orgContext?.organization?.name ?? 'Organization';
  const orgTokenName = orgContext?.effectivePlan?.tokenName?.trim()
    || orgContext?.organization?.plan?.tokenName?.trim()
    || defaultTokenLabel;

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        accent="theme"
        eyebrow="Demo app"
        eyebrowIcon={<FontAwesomeIcon icon={faBolt} />}
        title="SaaSyBase Demo App"
        stats={[
          {
            label: 'Personal',
            value: isTeamWorkspace
              ? 'Unavailable'
              : `${paidBalance.toLocaleString()} paid · ${freeBalance.toLocaleString()} free`,
            helper: isTeamWorkspace
              ? 'Switch to personal workspace'
              : 'Available in personal workspace',
          },
          {
            label: orgName,
            value: isTeamWorkspace
              ? `${(sharedBalance ?? 0).toLocaleString()} ${orgTokenName}`
              : 'Unavailable',
            helper: isTeamWorkspace
              ? `Available in ${orgName} workspace`
              : 'Switch to a team workspace',
          },
        ]}
      />

      <SaaSyAppClient isTeamWorkspace={isTeamWorkspace} />
    </div>
  );
}
