export const dynamic = 'force-dynamic';

import { DashboardPageHeader } from '@/components/dashboard/DashboardPageHeader';
import SaaSyAppClient from '@/components/dashboard/SaaSyAppClient';
import { buildDashboardMetadata } from '@/lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '@/lib/route-guards';
import { enforceTeamWorkspaceProvisioningGuard } from '@/lib/dashboard-workspace-guard';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt } from '@fortawesome/free-solid-svg-icons';

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

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        accent="violet"
        eyebrow="Demo app"
        eyebrowIcon={<FontAwesomeIcon icon={faBolt} />}
        title="SaaSyBase Demo App"
      />

      <SaaSyAppClient />
    </div>
  );
}
