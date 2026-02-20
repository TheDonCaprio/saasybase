import { faCodeBranch, faGaugeHigh, faKey, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { requireAdminAuth } from '../../../lib/route-guards';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import { AdminStatCard, type AdminStatCardProps } from '../../../components/admin/AdminStatCard';
import {
  dashboardMutedPanelClass,
  dashboardPanelClass
} from '../../../components/dashboard/dashboardSurfaces';
import AdminApiDocsDashboard from '../../../components/admin/AdminApiDocsDashboard';
import { getAdminApiCatalog, formatAdminApiDate } from '../../../lib/admin-api';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';

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
  const { summary, authentication, rateLimiting, changelog } = catalog;

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

  const methodEntries = Object.entries(summary.methods).sort((a, b) => b[1] - a[1]);

  const metricCards: AdminStatCardProps[] = [
    {
      label: 'Auth model',
      value: 'Clerk + internal token',
      helper: 'Admin/user via Clerk session; internal via Bearer token',
      icon: faKey,
      accent: 'indigo'
    },
    {
      label: 'Security posture',
      value: 'Role-aware',
      helper: `${summary.adminEndpoints} admin-only endpoints`,
      icon: faShieldHalved,
      accent: 'violet'
    },
    {
      label: 'Rate tiers',
      value: rateLimiting.length.toString(),
      helper: rateLimiting.map((tier) => `${tier.tier}: ${tier.limit}`).join(' · '),
      icon: faGaugeHigh,
      accent: 'emerald'
    },
    {
      label: 'Version',
      value: changelog[0]?.version ?? 'Current',
      helper: changelog[0] ? `Updated ${formatAdminApiDate(changelog[0].releasedAt)}` : 'Latest updates applied',
      icon: faCodeBranch,
      accent: 'amber'
    }
  ];

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="violet"
        eyebrow="Platform API"
        eyebrowIcon="🔌"
        title="Admin API reference hub"
        stats={heroStats}
      >
      </DashboardPageHeader>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metricCards.map((card) => (
          <AdminStatCard key={card.label} {...card} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className={dashboardPanelClass('space-y-3 lg:col-span-2')}>
          <header className="space-y-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Authentication at a glance</p>
            <p className="text-sm text-slate-600 dark:text-neutral-300">{authentication.guard}</p>
          </header>
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600 dark:text-neutral-300">
            {authentication.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </article>
        <aside className={dashboardPanelClass('space-y-3')}>
          <header className="space-y-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">HTTP method coverage</p>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Counts across catalog</p>
          </header>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-neutral-300">
            {methodEntries.map(([method, count]) => (
              <li key={method} className="flex items-center justify-between">
                <span>{method}</span>
                <span className="font-semibold text-slate-900 dark:text-neutral-100">{count}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <section className={dashboardMutedPanelClass('space-y-3')}>
        <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Rate limiting</p>
        <p className="text-sm text-slate-600 dark:text-neutral-300">
          Defaults below apply to public/user/admin endpoints. Internal endpoints under <code className="font-mono">/api/internal</code>{' '}
          use endpoint-specific limits (and may intentionally return 404 when unauthorized); check each endpoint’s notes for the exact tier.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {rateLimiting.map((tier) => (
            <div key={tier.tier} className="rounded-lg border border-slate-200 bg-white/80 p-4 text-sm text-slate-600 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">{tier.tier} tier</p>
              <p className="text-base font-semibold text-slate-900 dark:text-neutral-100">{tier.limit}</p>
              {tier.burst ? <p className="text-xs text-slate-500 dark:text-neutral-400">Burst: {tier.burst}</p> : null}
              {tier.notes ? <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">{tier.notes}</p> : null}
            </div>
          ))}
        </div>
      </section>

      <AdminApiDocsDashboard catalog={catalog} />

      {changelog.length > 0 ? (
        <section className={dashboardPanelClass('space-y-4')}>
          <header className="space-y-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Changelog</p>
            <p className="text-sm text-slate-600 dark:text-neutral-300">Recent updates to the admin API surface.</p>
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
