export const dynamic = 'force-dynamic';

import { requireAdminAuth } from '@/lib/route-guards';
import { prisma } from '@/lib/prisma';
import { SystemLogViewer, type AdminLogEntry } from '@/components/admin/SystemLogViewer';
import { DashboardPageHeader } from '@/components/dashboard/DashboardPageHeader';
import { AdminStatCard } from '@/components/admin/AdminStatCard';
import type { AdminStatCardProps } from '@/components/admin/AdminStatCard';
import { formatDate } from '@/lib/formatDate';
import { getFormatSetting } from '@/lib/settings';
import {
  faBug,
  faTriangleExclamation,
  faClipboardList,
  faClockRotateLeft
} from '@fortawesome/free-solid-svg-icons';
import { faListAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { buildDashboardMetadata } from '@/lib/dashboardMetadata';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Logs',
    description: 'Track platform warnings and errors flowing in from background jobs, webhooks, and core processes.',
    audience: 'admin',
  });
}

const PAGE_SIZE = 50;

function getSystemLogDelegate() {
  return (prisma as unknown as {
    systemLog?: {
      findMany: (args: { orderBy: { createdAt: 'asc' | 'desc' }; skip?: number; take?: number }) => Promise<Array<{ id: string; level: string; message: string; meta: string | null; context: string | null; createdAt: Date }>>;
      count?: (args?: unknown) => Promise<number>;
    };
  }).systemLog;
}

const numberFormatter = new Intl.NumberFormat('en-US');

const formatNumber = (value: number) => numberFormatter.format(value);

const formatPercentage = (value: number) =>
  `${(Number.isFinite(value) ? value * 100 : 0).toFixed(value * 100 >= 1 ? 1 : 2)}%`;

function parsePayload(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export default async function AdminLogsPage() {
  await requireAdminAuth('/admin/logs');

  const delegate = getSystemLogDelegate();
  const now = new Date();
  let logs: AdminLogEntry[] = [];
  let total = 0;
  let errorCount = 0;
  let warnCount = 0;
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since1h = new Date(now.getTime() - 1 * 60 * 60 * 1000);
  let recentCount = 0;
  let recentErrorCount = 0;
  let recentWarnCount = 0;
  let recent1hCount = 0;
  let recent1hWarnCount = 0;

  if (delegate) {
    const [
      logResults,
      totalCount,
      errCount,
      wrnCount,
      recent24hErrCountRaw,
      recent24hWarnCountRaw,
      recent1hErrCountRaw,
      recent1hWarnCountRaw,
    ] = await Promise.all([
      delegate.findMany({ orderBy: { createdAt: 'desc' }, take: PAGE_SIZE }),
      delegate.count ? delegate.count({}) : Promise.resolve(0),
      delegate.count ? delegate.count({ where: { level: 'error' } }) : Promise.resolve(0),
      delegate.count ? delegate.count({ where: { level: 'warn' } }) : Promise.resolve(0),
      delegate.count ? delegate.count({ where: { level: 'error', createdAt: { gte: since24h } } }) : Promise.resolve(0),
      delegate.count ? delegate.count({ where: { level: 'warn', createdAt: { gte: since24h } } }) : Promise.resolve(0),
      delegate.count ? delegate.count({ where: { level: 'error', createdAt: { gte: since1h } } }) : Promise.resolve(0),
      delegate.count ? delegate.count({ where: { level: 'warn', createdAt: { gte: since1h } } }) : Promise.resolve(0),
    ]);

    const formatSettings = await getFormatSetting();
    const timezone = formatSettings.timezone;

    logs = logResults.map((log) => {
      const absolute = formatDate(log.createdAt, { mode: 'datetime-long', timezone });
      const relative = formatDate(log.createdAt, { mode: 'relative', timezone });
      const display = relative ? `${absolute} • ${relative}` : absolute;

      return {
        id: log.id,
        level: log.level,
        message: log.message,
        meta: parsePayload(log.meta),
        context: parsePayload(log.context),
        createdAt: log.createdAt.toISOString(),
        createdAtFormatted: absolute,
        createdAtRelative: relative,
        createdAtDisplay: display,
      } satisfies AdminLogEntry;
    });
    total = totalCount ?? 0;
    errorCount = errCount ?? 0;
    warnCount = wrnCount ?? 0;
  recentCount = (recent24hErrCountRaw ?? 0) + (recent24hWarnCountRaw ?? 0);
  recentErrorCount = recent24hErrCountRaw ?? 0;
  recentWarnCount = recent24hWarnCountRaw ?? 0;
  recent1hCount = (recent1hErrCountRaw ?? 0) + (recent1hWarnCountRaw ?? 0);
  recent1hWarnCount = recent1hWarnCountRaw ?? 0;
  }

  const errorRate = total > 0 ? errorCount / total : 0;
  const warnRate = total > 0 ? warnCount / total : 0;
  const recentPerHour = recentCount / 24;

  const heroStats = [
    {
      label: 'Errors (24h)',
      value: formatNumber(recentErrorCount),
      helper: `${formatNumber(errorCount)} total errors`,
      tone: 'purple' as const
    },
    {
      label: 'Warnings (24h)',
      value: formatNumber(recentWarnCount),
      helper: `${formatNumber(warnCount)} total warnings`,
      tone: 'amber' as const
    }
  ];

  const metricCards: AdminStatCardProps[] = [
    {
      label: 'All log entries',
      value: formatNumber(total),
      helper: `~${formatNumber(Math.max(0, Math.round(recentPerHour)))} / hr last 24h`,
      icon: faClipboardList,
      accent: 'theme'
    },
    {
      label: 'Error share',
      value: formatPercentage(errorRate),
      helper: `${formatNumber(errorCount)} entries`,
      icon: faBug,
      accent: 'theme'
    },
    {
      label: 'Warning share',
      value: formatPercentage(warnRate),
      helper: `${formatNumber(warnCount)} entries`,
      icon: faTriangleExclamation,
      accent: 'theme'
    },
    {
      label: 'Last 1 hour',
      value: formatNumber(typeof recent1hCount === 'number' ? recent1hCount : 0),
      helper: `${formatNumber(typeof recent1hWarnCount === 'number' ? recent1hWarnCount : 0)} warnings`,
      icon: faClockRotateLeft,
      accent: 'theme'
    }
  ];

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        accent="violet"
        eyebrow="Observability"
        eyebrowIcon={<FontAwesomeIcon icon={faListAlt} />}
        title="System log monitor"
        stats={heroStats}
      />

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metricCards.map((card) => (
          <AdminStatCard key={card.label} {...card} />
        ))}
      </section>

      <SystemLogViewer initialLogs={logs} initialTotal={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
