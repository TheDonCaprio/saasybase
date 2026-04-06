import { faCodeBranch, faGaugeHigh, faKey, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlug } from '@fortawesome/free-solid-svg-icons';
import { requireAdminAuth } from '../../../../lib/route-guards';
import { DashboardPageHeader } from '../../../../components/dashboard/DashboardPageHeader';
import { AdminStatCard, type AdminStatCardProps } from '../../../../components/admin/AdminStatCard';
import {
  dashboardMutedPanelClass,
} from '../../../../components/dashboard/dashboardSurfaces';
import AdminApiDocsDashboard from '../../../../components/admin/AdminApiDocsDashboard';
import { getAdminApiCatalog, formatAdminApiDate } from '../../../../lib/admin-api';
import { buildDashboardMetadata } from '../../../../lib/dashboardMetadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'API',
    description: 'Everything you need to automate admin workflows, backfill analytics, or integrate support tooling—powered by the same endpoints our dashboard uses.',
    audience: 'admin',
  });
}

export default async function AdminApiPage() {
  await requireAdminAuth('/admin/api');

  const catalog = await getAdminApiCatalog();
  const { summary, rateLimiting, changelog } = catalog;
  const latestChangelogEntry = changelog[0] ?? null;

  const heroStats = [
    {
      label: 'Documented endpoints',
      value: summary.totalEndpoints.toString(),
      helper: `${summary.publicEndpoints} public · ${summary.internalEndpoints} internal`,
      tone: 'indigo' as const
    },
    {
      label: 'Admin-protected',
      value: summary.adminEndpoints.toString(),
      helper: `${summary.userEndpoints} user endpoints`,
      tone: 'rose' as const
    }
  ];

  const metricCards: AdminStatCardProps[] = [
    {
      label: 'Auth model',
      value: 'Provider-aware + internal token',
      helper: 'Admin/user via active auth provider session; internal via Bearer token',
      icon: faKey,
      accent: 'theme'
    },
    {
      label: 'Security posture',
      value: 'Role-aware',
      helper: `${summary.adminEndpoints} admin-only endpoints`,
      icon: faShieldHalved,
      accent: 'theme'
    },
    {
      label: 'Rate tiers',
      value: rateLimiting.length.toString(),
      helper: rateLimiting.map((tier) => `${tier.tier}: ${tier.limit}`).join(' · '),
      icon: faGaugeHigh,
      accent: 'theme'
    },
    {
      label: 'Version',
      value: latestChangelogEntry?.version ?? 'Current',
      helper: latestChangelogEntry ? `Updated ${formatAdminApiDate(latestChangelogEntry.releasedAt)}` : 'Latest updates applied',
      icon: faCodeBranch,
      accent: 'theme'
    }
  ];

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        accent="violet"
        eyebrow="Platform API"
        eyebrowIcon={<FontAwesomeIcon icon={faPlug} />}
        title="API reference"
        description="Browse, search, and explore every endpoint available in your platform."
        stats={heroStats}
      >
        {latestChangelogEntry ? (
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-neutral-400">
            Last updated: Version {latestChangelogEntry.version} on {formatAdminApiDate(latestChangelogEntry.releasedAt)}
          </p>
        ) : null}
      </DashboardPageHeader>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => (
          <AdminStatCard key={card.label} {...card} />
        ))}
      </section>

      <AdminApiDocsDashboard catalog={catalog} />

      {changelog.length > 0 ? (
        <section className={dashboardMutedPanelClass('space-y-4')}>
          <header className="space-y-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Changelog</p>
            <p className="text-sm text-slate-600 dark:text-neutral-300">Recent platform and documentation updates reflected in this reference.</p>
          </header>
          <ul className="space-y-3">
            {changelog.map((entry) => (
              <li key={entry.version} className="rounded-lg border border-slate-200 bg-white/70 p-4 text-sm text-slate-600 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                  <span className="font-semibold text-indigo-500 dark:text-indigo-300">Version {entry.version}</span>
                  <span>{formatAdminApiDate(entry.releasedAt)}</span>
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {entry.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
