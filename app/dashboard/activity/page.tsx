import Link from 'next/link';
import { prisma } from '../../../lib/prisma';
import { authService } from '@/lib/auth-provider';
import { formatDateServer } from '../../../lib/formatDate.server';
import { pluralize } from '../../../lib/pluralize';
import { formatCurrency } from '../../../lib/utils/currency';
import { getActiveCurrencyAsync } from '../../../lib/payment/registry';
import { getDefaultTokenLabel, getFreePlanSettings } from '../../../lib/settings';
import ActiveSessionsList from '../../../components/dashboard/ActiveSessionsList';
import { ActiveSessionsSummary } from '../../../components/dashboard/ActiveSessionsSummary';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import {
  dashboardPanelClass,
  dashboardMutedPanelClass,
  dashboardPillClass,
} from '../../../components/dashboard/dashboardSurfaces';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '../../../lib/route-guards';
import { getOrganizationPlanContext, buildPlanDisplay, getPaymentScopeFilter, getPlanScope, getSubscriptionScopeFilter } from '../../../lib/user-plan-context';
import { enforceTeamWorkspaceProvisioningGuard } from '../../../lib/dashboard-workspace-guard';
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Activity',
    description: 'Monitor billing history, sign-ins, and recent visits to keep your SaaSyBase account secure.',
    audience: 'user',
  });
}

export default async function UserActivityPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const returnPath = buildReturnPath('/dashboard/activity', resolvedSearchParams);
  const { userId, orgId } = await requireAuth(returnPath);
  await enforceTeamWorkspaceProvisioningGuard(userId);
  const planScope = getPlanScope(orgId);

  const activeCurrency = await getActiveCurrencyAsync();
  const now = new Date();

  const [
    clerkUser,
    recentActivity,
    paymentStats,
    activeSubscription,
    recentVisits,
    userRecord,
    defaultTokenLabel,
    organizationContext,
    freePlanSettings,
  ] = await Promise.all([
    authService.getUser(userId).catch(() => null),
    prisma.payment.findMany({
      where: { userId, ...getPaymentScopeFilter(planScope) },
      orderBy: { createdAt: 'desc' },
      include: { subscription: { include: { plan: true } } },
      take: 5
    }),
    prisma.payment.aggregate({
      where: { userId, status: { not: 'REFUNDED' }, ...getPaymentScopeFilter(planScope) },
      _sum: { amountCents: true },
      _count: { id: true }
    }),
    prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE', expiresAt: { gt: now }, ...getSubscriptionScopeFilter(planScope) },
      include: { plan: true }
    }),
    prisma.visitLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        path: true,
        country: true,
        city: true,
        userAgent: true,
        createdAt: true
      }
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { tokenBalance: true, freeTokenBalance: true } }),
    getDefaultTokenLabel(),
    getOrganizationPlanContext(userId, orgId),
    getFreePlanSettings(),
  ]);


  // Get current session info with IP address and user agent data from Clerk (handled client-side)
  const currentSession: unknown = null;

  // Access latestActivity safely (may be present on the session object from Clerk)
  const sessionActivity = ((): unknown | undefined => {
    if (!currentSession || typeof currentSession !== 'object') return undefined;
    const rec = currentSession as Record<string, unknown>;
    return rec['latestActivity'];
  })();
  // `sessionActivity` is intentionally unused on server; reference to silence lint
  void sessionActivity;

  // Coerce recent activity (Prisma) into a safe shape for rendering
  const recentActivityWithFormats = await Promise.all(
    (Array.isArray(recentActivity) ? recentActivity : []).map(async (p) => {
      const rec = (p as Record<string, unknown>) ?? {};
      const createdAtRaw = rec['createdAt'];
      const createdAt = createdAtRaw ? new Date(String(createdAtRaw)) : undefined;
      return {
        id: String(rec['id'] ?? ''),
        amountCents: Number(rec['amountCents'] ?? 0),
        status: String(rec['status'] ?? ''),
        subscription: rec['subscription'] ?? null,
        createdAt,
        formattedCreatedAt: createdAt ? await formatDateServer(createdAt, userId) : null,
      };
    })
  );

  // Coerce recent visits into a safe shape
  const recentVisitsWithFormats = await Promise.all(
    (Array.isArray(recentVisits) ? recentVisits : []).map(async (v) => {
      const rec = (v as Record<string, unknown>) ?? {};
      const createdAtRaw = rec['createdAt'];
      const createdAt = createdAtRaw ? new Date(String(createdAtRaw)) : undefined;
      const userAgent = String(rec['userAgent'] ?? '');
      return {
        id: String(rec['id'] ?? ''),
        path: String(rec['path'] ?? ''),
        country: rec['country'] ? String(rec['country']) : null,
        city: rec['city'] ? String(rec['city']) : null,
        userAgent,
        createdAt,
        formattedCreatedAt: createdAt ? await formatDateServer(createdAt, userId) : null,
        deviceInfo: getDeviceInfoFromUserAgent(userAgent),
      };
    })
  );

  // Helper function to extract device name from user agent for visit logs
  function getDeviceInfoFromUserAgent(userAgent: string) {
    if (!userAgent) return 'Unknown Device';

    // Simple device detection
    if (userAgent.includes('iPhone')) return 'iPhone';
    if (userAgent.includes('iPad')) return 'iPad';
    if (userAgent.includes('Android')) return 'Android Device';
    if (userAgent.includes('Mac')) return 'Mac';
    if (userAgent.includes('Windows')) return 'Windows PC';
    if (userAgent.includes('Linux')) return 'Linux';
    return 'Unknown Device';
  }

  // Prepare server-formatted last sign-in string (uses DB-backed user/admin settings)
  const formattedLastSignIn = null; // lastSignInAt not available on AuthUser; placeholder for activity page

  const totalSpendCents = Number(paymentStats._sum.amountCents ?? 0);
  const totalSpendFormatted = formatCurrency(totalSpendCents, activeCurrency);
  const purchaseCount = Number(paymentStats._count.id ?? 0);

  const paidTokenBalance = typeof userRecord?.tokenBalance === 'number' ? userRecord.tokenBalance : 0;
  const freeTokenBalanceVal = typeof userRecord?.freeTokenBalance === 'number' ? userRecord.freeTokenBalance : 0;

  const planDisplay = buildPlanDisplay({
    subscription: activeSubscription,
    organizationContext,
    userTokenBalance: paidTokenBalance,
    userFreeTokenBalance: freeTokenBalanceVal,
    freePlanSettings,
    defaultTokenLabel,
  });
  const nowTimeMs = now.getTime();

  const daysRemaining = activeSubscription
    ? Math.max(0, Math.ceil((new Date(activeSubscription.expiresAt).getTime() - nowTimeMs) / (1000 * 60 * 60 * 24)))
    : 0;

  const planTimelineLabel =
    planDisplay.planSource === 'PERSONAL' && activeSubscription
      ? `${pluralize(daysRemaining, 'day')} ${activeSubscription.plan?.autoRenew ? 'until renewal' : 'remaining'}`
      : planDisplay.statusHelper;

  const tokenLabel = planDisplay.tokenLabel;
  const tokenStatValue = planDisplay.tokenStatValue;
  const tokenStatHelper = planDisplay.tokenStatHelper;
  // token tone is no longer used after moving the token stat into the hero panels

  const lastSignInLabel = formattedLastSignIn ?? 'Never';

  const uniqueLocations = new Set<string>();
  for (const visit of recentVisitsWithFormats) {
    const location = [visit.city, visit.country].filter(Boolean).join(', ');
    if (location) uniqueLocations.add(location);
  }

  const visitsCount = recentVisitsWithFormats.length;
  const visitSummary = visitsCount > 0 ? pluralize(visitsCount, 'recent visit') : 'No visits tracked yet';
  const uniqueLocationCount = uniqueLocations.size;
  const locationCardDescription = uniqueLocationCount > 0
    ? `${pluralize(uniqueLocationCount, 'location')} across your latest sessions.`
    : 'No location data captured yet.';

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        accent="violet"
        eyebrow="Usage insights"
        eyebrowIcon="📈"
        title="Activity & usage"
        stats={[
          {
            label: 'Lifetime spend',
            value: totalSpendFormatted,
            helper: purchaseCount > 0 ? `${pluralize(purchaseCount, 'purchase')}` : 'No payments yet',
            tone: purchaseCount > 0 ? 'emerald' : 'slate',
          },
          {
            label: 'Last sign-in',
            value: lastSignInLabel,
            helper: formattedLastSignIn ? 'Most recent' : 'Sign in to keep your account protected',
            tone: formattedLastSignIn ? 'blue' : 'indigo',
          },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className={dashboardPanelClass('space-y-2')}>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Active plan</span>
              <div className="text-xl font-semibold text-slate-900 dark:text-neutral-100">{planDisplay.planName}</div>
              {planDisplay.workspace ? (
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  {planDisplay.workspace.name} • {planDisplay.workspace.role === 'OWNER' ? 'Owner' : 'Member'}
                </p>
              ) : null}
              <p className="text-xs text-slate-500 dark:text-neutral-400">{planTimelineLabel}</p>
            </div>

            <div className={dashboardPanelClass('space-y-2')}>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">{`Remaining ${tokenLabel}`}</span>
              <div className="text-xl font-semibold text-slate-900 dark:text-neutral-100">{tokenStatValue}</div>
              <p className="text-xs text-slate-500 dark:text-neutral-400">{tokenStatHelper}</p>
            </div>

            <div className={dashboardPanelClass('space-y-2')}>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Active devices</span>
              <div className="text-2xl font-semibold text-slate-900 dark:text-neutral-100">
                <ActiveSessionsSummary />
              </div>
              <p className="text-xs text-slate-500 dark:text-neutral-400">Detected sessions</p>
            </div>
          </div>

          {clerkUser ? (
            <div className={dashboardPanelClass('space-y-4')}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Current session</h3>
                  <p className="text-sm text-slate-500 dark:text-neutral-400">
                    You’re signed in with Clerk. Manage trusted devices and revoke access if something looks unfamiliar.
                  </p>
                </div>
                <span className={dashboardPillClass('border-emerald-200/70 bg-emerald-100/70 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200')}>
                  🟢 Active
                </span>
              </div>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">User</dt>
                  <dd className="mt-1 text-slate-900 dark:text-neutral-100">
                    {[clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || clerkUser.fullName || 'Unknown user'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Email</dt>
                  <dd className="mt-1 text-slate-900 dark:text-neutral-100">
                    {clerkUser.email ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Last sign-in</dt>
                  <dd className="mt-1 text-slate-900 dark:text-neutral-100">{formattedLastSignIn ?? 'Never'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Two-factor auth</dt>
                  <dd className="mt-1 text-slate-900 dark:text-neutral-100">{'Not available'}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          {/* Active sessions moved from sidebar into the main column */}
          <div className="space-y-4 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-6 lg:shadow-sm lg:transition-shadow dark:lg:border-neutral-800 dark:lg:bg-neutral-900/60 dark:lg:shadow-[0_0_25px_rgba(15,23,42,0.45)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Active sessions</h3>
              <span className={dashboardPillClass('text-blue-600 dark:text-blue-200')}>Secured by Clerk</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-neutral-400 mb-2">
              Manage your signed-in devices. Revoke access instantly if something looks unfamiliar.
            </p>
            <div className="-m-3 sm:-m-4 lg:-m-6">
              <ActiveSessionsList />
            </div>
          </div>


        </div>

        <div className="space-y-6">
          {/* Recent purchases moved from main column into sidebar */}
          {recentActivityWithFormats.length > 0 ? (
            <div className={dashboardPanelClass('space-y-4')}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Recent purchases</h3>
                <span className={dashboardPillClass('text-slate-600 dark:text-neutral-300')}>
                  {pluralize(recentActivityWithFormats.length, 'payment')}
                </span>
              </div>
              <div className="divide-y divide-slate-200/70 dark:divide-neutral-800/70">
                {recentActivityWithFormats.map((payment: unknown) => {
                  const p = payment as Record<string, unknown>;
                  const planName = String(((p.subscription as Record<string, unknown> | null)?.plan as Record<string, unknown> | undefined)?.name ?? '');
                  const amount = formatCurrency(Number(p.amountCents ?? 0), activeCurrency);
                  const status = String(p.status ?? '');
                  const tone =
                    status === 'COMPLETED' || status === 'SUCCEEDED'
                      ? 'text-emerald-500 dark:text-emerald-300'
                      : status === 'REFUNDED'
                        ? 'text-red-500 dark:text-red-300'
                        : 'text-amber-500 dark:text-amber-300';

                  return (
                    <div key={String(p.id)} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-neutral-100">{planName || 'Purchase'}</div>
                        <div className="text-xs text-slate-500 dark:text-neutral-400">{String(p.formattedCreatedAt ?? '')}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm text-slate-900 dark:text-neutral-100">{amount}</div>
                        <div className={`text-xs font-semibold ${tone}`}>{status || 'PENDING'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={dashboardMutedPanelClass('text-sm text-slate-600 dark:text-neutral-300')}>
              No purchases yet. They’ll appear here after you subscribe or renew.
            </div>
          )}

          {/* Add quick link to view full transactions history */}
          <div className={dashboardMutedPanelClass('text-sm text-slate-600 dark:text-neutral-300') + ' mt-2'}>
            <Link href="/dashboard/transactions" className="text-sm font-medium text-slate-900 dark:text-neutral-100 hover:underline">
              View all transactions →
            </Link>
          </div>

          {recentVisitsWithFormats.length > 0 ? (
            <div className={dashboardPanelClass('space-y-4')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Recent visits</h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-neutral-400">
                {`${visitSummary} captured. ${locationCardDescription}`}
              </p>
              <div className="space-y-3">
                {recentVisitsWithFormats.map((visit: unknown) => {
                  const v = visit as Record<string, unknown>;
                  const createdAt = String(v['formattedCreatedAt'] ?? '');
                  const path = String(v['path'] ?? '');
                  const country = v['country'] ? String(v['country']) : null;
                  const city = v['city'] ? String(v['city']) : null;
                  const deviceInfo = v['deviceInfo'] ? String(v['deviceInfo']) : null;

                  return (
                    <div key={String(v['id'] ?? '')} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-sm dark:border-neutral-800/70 dark:bg-neutral-900/40">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="font-medium text-slate-900 dark:text-neutral-100">{path}</span>
                        {deviceInfo ? <span className="text-xs text-slate-500 dark:text-neutral-400">{deviceInfo}</span> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-neutral-400">
                        {createdAt ? <span>{createdAt}</span> : null}
                        {city ? <span>• {city}</span> : null}
                        {country ? <span>• {country}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={dashboardMutedPanelClass('text-sm text-slate-600 dark:text-neutral-300')}>
              If you notice any suspicious activity or anomalies in your account activity, please contact our support team so we can investigate.
              <div className="mt-3">
                <Link href="/help" className="text-sm font-medium text-slate-900 dark:text-neutral-100 hover:underline">Contact support →</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
