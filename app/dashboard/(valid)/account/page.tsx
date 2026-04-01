import { redirect } from 'next/navigation';
import { buildDashboardMetadata } from '../../../../lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '../../../../lib/route-guards';
import { enforceTeamWorkspaceProvisioningGuard } from '../../../../lib/dashboard-workspace-guard';
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Account',
    description: 'Manage your account preferences and profile details—redirecting you to the unified profile experience.',
    audience: 'user',
  });
}

export default async function AccountPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { userId } = await requireAuth(buildReturnPath('/dashboard/account', resolvedSearchParams));
  await enforceTeamWorkspaceProvisioningGuard(userId);
  // Redirect to profile page since account info is now merged there
  redirect('/dashboard/profile');
}
