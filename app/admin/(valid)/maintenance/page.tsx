export const dynamic = 'force-dynamic';

import { DashboardPageHeader } from '@/components/dashboard/DashboardPageHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWrench } from '@fortawesome/free-solid-svg-icons';
import { requireAdminPageAccess } from '@/lib/route-guards';
import { buildDashboardMetadata } from '@/lib/dashboardMetadata';
import { MaintenanceTools } from '@/components/admin/MaintenanceTools';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Maintenance',
    description: 'Admin-only maintenance and cleanup utilities.',
    audience: 'admin',
  });
}

export default async function AdminMaintenancePage() {
  await requireAdminPageAccess('/admin/maintenance');

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        accent="indigo"
        eyebrow="Developer"
        eyebrowIcon={<FontAwesomeIcon icon={faWrench} />}
        title="Maintenance"
      />

      <MaintenanceTools />
    </div>
  );
}
