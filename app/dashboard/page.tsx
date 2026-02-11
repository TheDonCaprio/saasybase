export const dynamic = 'force-dynamic';

import { DashboardPageHeader } from '@/components/dashboard/DashboardPageHeader';
import SaaSyAppClient from '@/components/dashboard/SaaSyAppClient';
import { dashboardPanelClass } from '@/components/dashboard/dashboardSurfaces';
import { buildDashboardMetadata } from '@/lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '@/lib/route-guards';

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
  await requireAuth(returnPath);

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        accent="violet"
        eyebrow="Demo app"
        eyebrowIcon="⚡️"
        title="SaaSyBase Demo App"
        description="Run small operations that deduct real tokens from your account. Useful for validating billing/token flows before launch."
      />

      <section className={dashboardPanelClass('space-y-4')}>
        <SaaSyAppClient />
      </section>
    </div>
  );
}
