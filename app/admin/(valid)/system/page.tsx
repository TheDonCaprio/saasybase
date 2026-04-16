export const dynamic = 'force-dynamic';

import { DashboardPageHeader } from '@/components/dashboard/DashboardPageHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer } from '@fortawesome/free-solid-svg-icons';
import { requireAdminPageAccess } from '@/lib/route-guards';
import { buildDashboardMetadata } from '@/lib/dashboardMetadata';
import { AdminSystemPanel } from '@/components/admin/AdminSystemPanel';
import { getAdminEnvironmentSettings, getAdminRuntimeSnapshot } from '@/lib/admin-system-snapshot';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'System',
    description: 'Admin-only runtime diagnostics, infrastructure posture, and active deployment configuration.',
    audience: 'admin',
  });
}

export default async function AdminSystemPage() {
  await requireAdminPageAccess('/admin/system');

  const [environmentSettings, runtimeSnapshot] = await Promise.all([
    getAdminEnvironmentSettings(),
    getAdminRuntimeSnapshot(),
  ]);

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        accent="indigo"
        eyebrow="Developer"
        eyebrowIcon={<FontAwesomeIcon icon={faServer} />}
        title="System"
      />

      <AdminSystemPanel
        environmentSettings={environmentSettings}
        runtimeSnapshot={runtimeSnapshot}
      />
    </div>
  );
}