import { redirect } from 'next/navigation';
import { buildDashboardMetadata } from '../../../../lib/dashboardMetadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Moderator Activity',
    description: 'Redirecting to the moderation activity log for consolidated oversight of admin actions.',
    audience: 'admin',
  });
}

export default function ModeratorActivityRedirect() {
  redirect('/admin/moderation');
}
