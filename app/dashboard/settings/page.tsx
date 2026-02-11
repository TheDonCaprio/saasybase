import { redirect } from 'next/navigation';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '../../../lib/route-guards';
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Settings',
    description: 'Adjust dashboard preferences and personalized settings within your SaaSyBase account.',
    audience: 'user',
  });
}

export default async function UserSettingsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  await requireAuth(buildReturnPath('/dashboard/settings', resolvedSearchParams));
  // Redirect to profile page since settings are now merged there
  redirect('/dashboard/profile');
}
