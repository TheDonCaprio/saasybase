export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
import { requireAdminAreaActor } from '../../../lib/route-guards';
import { fetchAdminActions, fetchAdminActionGroups, fetchModerationSummary } from '../../../lib/admin-actions';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowTrendUp,
  faChartLine,
  faScaleBalanced,
  faShieldCat,
  faUserShield
} from '@fortawesome/free-solid-svg-icons';
import ModeratorActionTimeline, { ModeratorActionEntry } from '../../../components/admin/ModeratorActionTimeline';
import { AdminStatCard } from '../../../components/admin/AdminStatCard';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Moderation',
    description: 'Review a chronological log of moderator and admin actions across users, subscriptions, and purchases.',
    audience: 'admin',
  });
}

export default async function ModerationPage() {
  const actor = await requireAdminAreaActor();
  if (actor.role !== 'ADMIN') {
    redirect('/dashboard?error=insufficient_permissions');
  }

  const [moderationSummary, { entries, pageInfo }] = await Promise.all([
    fetchModerationSummary(),
    fetchAdminActions({ limit: 50 })
  ]);
  const availableActionGroups = await fetchAdminActionGroups();

  const serializedEntries: ModeratorActionEntry[] = entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    actorRole: entry.actorRole,
    actor: {
      id: entry.actor?.id ?? entry.actorId,
      name: entry.actor?.name ?? null,
      email: entry.actor?.email ?? null,
      role: entry.actor?.role ?? entry.actorRole ?? null
    },
    target: entry.target
      ? {
          id: entry.target.id,
          name: entry.target.name,
          email: entry.target.email,
          role: entry.target.role
        }
      : entry.targetUserId
        ? {
            id: entry.targetUserId,
            name: null,
            email: null,
            role: null
          }
        : null,
    targetType: entry.targetType,
    details: entry.parsedDetails,
    createdAt: entry.createdAt.toISOString()
  }));

  const totalLast7Days = moderationSummary.actionsLast7Days;
  const moderatorShare = totalLast7Days > 0 ? Math.round((moderationSummary.moderatorActionsLast7Days / totalLast7Days) * 100) : 0;

  const headerStats = [
    {
      label: 'Last 24 hours',
      value: formatNumber(moderationSummary.actionsLast24Hours),
      helper: 'Moderation events logged',
      tone: 'rose' as const
    },
    {
      label: 'Top action',
      value: moderationSummary.topActionGroup?.action ?? 'Not enough data',
      helper: moderationSummary.topActionGroup
        ? `${formatNumber(moderationSummary.topActionGroup.count)} entries this week`
        : 'Awaiting more activity',
      tone: 'purple' as const
    }
  ];

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        accent="rose"
        eyebrow="Oversight"
        eyebrowIcon={<FontAwesomeIcon icon={faUserShield} />}
        title="Moderation activity log"
        description="Review a chronological log of moderator and admin actions across users, subscriptions, and purchases. Use this to trace adjustments and stay ahead of issues."
        stats={headerStats}
      >
      </DashboardPageHeader>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <AdminStatCard
          label="Actions logged"
          value={formatNumber(moderationSummary.totalActions)}
          helper="All-time moderation events"
          icon={faChartLine}
          accent="rose"
        />
        <AdminStatCard
          label="Last 7 days"
          value={formatNumber(moderationSummary.actionsLast7Days)}
          helper={`${formatNumber(moderationSummary.moderatorActionsLast7Days)} moderator / ${formatNumber(moderationSummary.adminActionsLast7Days)} admin`}
          icon={faArrowTrendUp}
          accent="amber"
        />
        <AdminStatCard
          label="Active moderators"
          value={formatNumber(moderationSummary.activeModeratorsLast7Days)}
          helper="Contributors in the past week"
          icon={faShieldCat}
          accent="emerald"
        />
        <AdminStatCard
          label="Moderator share"
          value={totalLast7Days > 0 ? `${moderatorShare}%` : '—'}
          helper={totalLast7Days > 0
            ? `${formatNumber(moderationSummary.moderatorActionsLast7Days)} of ${formatNumber(totalLast7Days)} actions`
            : 'No actions this week'}
          icon={faScaleBalanced}
          accent="indigo"
        />
      </section>

      <ModeratorActionTimeline
        initialEntries={serializedEntries}
        initialPageInfo={pageInfo}
        availableActionGroups={availableActionGroups}
      />

      
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}
