import { redirect } from 'next/navigation';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '../../../lib/route-guards';
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
  await requireAuth(buildReturnPath('/dashboard/account', resolvedSearchParams));
  // Redirect to profile page since account info is now merged there
  redirect('/dashboard/profile');
}
