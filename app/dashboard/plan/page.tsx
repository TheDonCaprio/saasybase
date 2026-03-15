import Link from 'next/link';
import { prisma } from '../../../lib/prisma';
import { formatDateServer } from '../../../lib/formatDate.server';
import { pluralize } from '../../../lib/pluralize';
import ActivatePendingButton from '../../../components/dashboard/ActivatePendingButton';
import DashboardPricingListServerWrapper from '../../../components/pricing/DashboardPricingListServerWrapper';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import { dashboardPanelClass, dashboardMutedPanelClass } from '../../../components/dashboard/dashboardSurfaces';
import { CurrentPlanStatus } from '../../../components/dashboard/CurrentPlanStatus';
import { getDefaultTokenLabel, getFreePlanSettings } from '../../../lib/settings';
import PlanBillingActions from '../../../components/dashboard/PlanBillingActions';
export const dynamic = 'force-dynamic';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCreditCard } from '@fortawesome/free-solid-svg-icons';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '../../../lib/route-guards';
import { getOrganizationPlanContext, buildPlanDisplay } from '../../../lib/user-plan-context';
import { enforceTeamWorkspaceProvisioningGuard } from '../../../lib/dashboard-workspace-guard';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Plan',
    description: 'Review your current subscription, activate pending time, and compare plans tailored to your workflow.',
    audience: 'user',
  });
}



export default async function PlanPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const returnPath = buildReturnPath('/dashboard/plan', resolvedSearchParams);
  const { userId, orgId } = await requireAuth(returnPath);
  await enforceTeamWorkspaceProvisioningGuard(userId);
  const now = new Date();

  // Get all subscriptions (active and pending) to show complete picture
  const [activeSub, allSubscriptions, userRecord, defaultTokenLabel, allPlansRaw, organizationPlan] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE', expiresAt: { gt: now } },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            shortDescription: true,
            description: true,
            priceCents: true,
            durationHours: true,
            autoRenew: true,
            recurringInterval: true,
            tokenLimit: true,
            tokenName: true,
            supportsOrganizations: true,
            organizationTokenPoolStrategy: true,
          }
        },
        scheduledPlan: { select: { id: true, name: true, priceCents: true } }
      }
    }),
    prisma.subscription.findMany({
      where: { userId, status: { in: ['ACTIVE', 'PENDING'] } },
      include: { plan: true },
      orderBy: [{ status: 'asc' }, { startedAt: 'asc' }]
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { tokenBalance: true, freeTokenBalance: true } }),
    getDefaultTokenLabel(),
    prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    getOrganizationPlanContext(userId, orgId),
  ]);

  const plansForPricing = allPlansRaw.map((plan) => {
    const planTokenName = typeof plan.tokenName === 'string' ? plan.tokenName.trim() : '';
    return { ...plan, tokenName: planTokenName || defaultTokenLabel };
  });
  // Local lightweight plan shape for UI access (keeps us independent of generated Prisma types)
  type PlanForUI = {
    id?: string;
    name?: string | null;
    shortDescription?: string | null;
    description?: string | null;
    priceCents?: number | null;
    durationHours?: number | null;
    autoRenew?: boolean | null;
    recurringInterval?: string | null;
  };

  const mapPlanForUI = (plan: unknown): PlanForUI | null => {
    if (!plan || typeof plan !== 'object') return null;
    const rec = plan as Record<string, unknown>;

    const coerceNumber = (value: unknown): number | null => {
      if (typeof value === 'number') return value;
      if (typeof value === 'bigint') return Number(value);
      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    return {
      id: typeof rec.id === 'string' ? rec.id : (rec.id != null ? String(rec.id) : undefined),
      name: typeof rec.name === 'string' ? rec.name : null,
      shortDescription: typeof rec.shortDescription === 'string' ? rec.shortDescription : null,
      description: typeof rec.description === 'string' ? rec.description : null,
      priceCents: coerceNumber(rec.priceCents),
      durationHours: coerceNumber(rec.durationHours),
      autoRenew: typeof rec.autoRenew === 'boolean' ? rec.autoRenew : (rec.autoRenew != null ? Boolean(rec.autoRenew) : null),
      recurringInterval: typeof rec.recurringInterval === 'string' ? rec.recurringInterval : null,
    };
  };

  const currentPlan = mapPlanForUI(activeSub?.plan);

  // Calculate next billing date (expires date for one-time, renewal date for auto-renew)
  const nextBillingDate = activeSub?.expiresAt;
  const nowTimeMs = now.getTime();
  const formattedNextBilling = nextBillingDate ? await formatDateServer(nextBillingDate) : null;
  const formattedCanceledAt = activeSub?.canceledAt ? await formatDateServer(activeSub.canceledAt) : null;
  const isCancellationScheduled = !!activeSub?.canceledAt;
  const scheduledPlan = activeSub?.scheduledPlan ?? null;
  const formattedScheduledDate = activeSub?.scheduledPlanDate
    ? await formatDateServer(activeSub.scheduledPlanDate) : null;
  const pendingSubsWithFormats = await Promise.all(
    allSubscriptions
      .filter(s => s.status === 'PENDING')
      .map(async (s) => ({
        ...s,
        planForUI: mapPlanForUI(s.plan),
        formattedStartedAt: s.startedAt ? await formatDateServer(s.startedAt) : null,
        formattedExpiresAt: s.expiresAt ? await formatDateServer(s.expiresAt) : null,
      }))
  );

  const daysUntilRenewal = nextBillingDate
    ? Math.max(0, Math.ceil((nextBillingDate.getTime() - nowTimeMs) / (1000 * 60 * 60 * 24)))
    : null;
  const pendingCount = pendingSubsWithFormats.length;
  const subscriptionStart = activeSub?.startedAt ?? null;
  const accessProgressPercent =
    subscriptionStart && nextBillingDate && nextBillingDate.getTime() !== subscriptionStart.getTime()
      ? Math.min(
        100,
        Math.max(
          0,
          Math.round(
            ((nowTimeMs - subscriptionStart.getTime()) /
              (nextBillingDate.getTime() - subscriptionStart.getTime())) *
            100
          )
        )
      )
      : 0;
  const cycleProgressHelper =
    activeSub && daysUntilRenewal != null
      ? `${pluralize(daysUntilRenewal, 'day')} remaining`
      : activeSub
        ? 'Renewal date to be announced'
        : 'Upgrade to start tracking usage';
  const billingTypeLabel = !activeSub
    ? 'No active plan'
    : isCancellationScheduled
      ? 'Cancellation scheduled'
      : currentPlan?.autoRenew
        ? 'Auto-renewing'
        : 'Non-recurring';
  const planPriceFormatted =
    currentPlan?.priceCents != null ? `$${(currentPlan.priceCents / 100).toFixed(2)}` : '—';
  const durationLabel = (() => {
    if (!currentPlan) return '—';
    if (currentPlan.autoRenew) {
      switch (currentPlan.recurringInterval) {
        case 'year':
          return 'Renews yearly';
        case 'month':
          return 'Renews monthly';
        case 'week':
          return 'Renews weekly';
        default:
          return 'Recurring billing';
      }
    }
    const hours = currentPlan.durationHours ?? 0;
    if (hours >= 8760) return 'Annual access';
    if (hours >= 720) return 'Monthly access';
    if (hours >= 168) return 'Weekly access';
    return 'One-time access';
  })();

  const paidTokenBalance = typeof userRecord?.tokenBalance === 'number' ? userRecord.tokenBalance : 0;
  const freeTokenBalanceVal = typeof userRecord?.freeTokenBalance === 'number' ? userRecord.freeTokenBalance : 0;

  const freePlanSettings = await getFreePlanSettings();
  const planDisplay = buildPlanDisplay({
    subscription: activeSub,
    organizationContext: organizationPlan,
    userTokenBalance: paidTokenBalance,
    userFreeTokenBalance: freeTokenBalanceVal,
    freePlanSettings,
    defaultTokenLabel,
  });
  const workspaceOnly = !activeSub && !!organizationPlan;
  const planInfoTiles = activeSub
    ? [
      {
        label: 'Price',
        value: planPriceFormatted,
        helper: currentPlan?.autoRenew ? 'Renews automatically' : 'One-time access period',
        tone: 'emerald' as const,
      },
      {
        label: 'Access',
        value: durationLabel,
        helper: currentPlan?.autoRenew ? 'Continues while payments renew' : 'Ends after this cycle',
        tone: 'rose' as const,
      },
      {
        label: planDisplay.tokenLabel,
        value: planDisplay.tokenStatValue,
        helper: planDisplay.tokenStatHelper,
        tone: 'violet' as const,
      },
    ]
    : workspaceOnly
      ? [
        {
          label: 'Workspace',
          value: planDisplay.workspace?.name ?? 'Workspace plan',
          helper: planDisplay.statusHelper,
          tone: 'indigo' as const,
        },
        {
          label: planDisplay.tokenLabel,
          value: planDisplay.tokenStatValue,
          helper: planDisplay.tokenStatHelper,
          tone: 'violet' as const,
        },
      ]
      : [];
  const planProgress = activeSub
    ? {
      label: currentPlan?.autoRenew ? 'Cycle ends' : 'Access ends',
      dateDisplay: formattedNextBilling ?? '—',
      percent: accessProgressPercent,
      helper: cycleProgressHelper,
      secondary: formattedCanceledAt ? `Cancelled on ${formattedCanceledAt}` : null,
      badges: [
        { label: 'Billing:', value: billingTypeLabel, tone: 'emerald' as const },
        {
          label: 'Status:',
          value: isCancellationScheduled ? 'Ending after this cycle' : activeSub.status,
          tone: 'amber' as const,
        },
      ],
    }
    : undefined;

  const activeRecurringPlan = activeSub?.plan?.autoRenew
    ? {
      planId: activeSub.plan.id,
      priceCents: typeof activeSub.plan.priceCents === 'number' ? activeSub.plan.priceCents : null,
      recurringInterval: typeof activeSub.plan.recurringInterval === 'string' ? activeSub.plan.recurringInterval : null,
    }
    : null;
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        accent="violet"
        eyebrow="Subscription overview"
        eyebrowIcon={<FontAwesomeIcon icon={faCreditCard} className="w-5 h-5" />}
        title="Manage your Pro access"
        stats={[
          {
            label: 'Membership status',
            value: planDisplay.statusValue,
            helper: planDisplay.statusHelper,
            tone: planDisplay.planSource === 'FREE' ? 'slate' : 'indigo'
          },
          {
            label: currentPlan?.autoRenew ? 'Cycle ends' : 'Access ends',
            value: activeSub
              ? formattedNextBilling ?? 'Not scheduled'
              : planDisplay.planSource === 'ORGANIZATION' && planDisplay.workspace
                ? `Managed Access`
                : 'Not scheduled',
            helper: activeSub ? cycleProgressHelper : planDisplay.planSource === 'ORGANIZATION' ? planDisplay.statusHelper : 'Start a plan to track your cycle',
            tone: activeSub ? 'blue' : planDisplay.planSource === 'ORGANIZATION' ? 'indigo' : 'slate'
          },
          // Token stat moved into the Plan overview panel below per design request
        ]}
        actions={!activeSub ? (
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-5 py-2 text-sm font-semibold !text-white shadow-sm transition hover:bg-purple-700"
          >
            Browse plans
          </Link>
        ) : null}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <CurrentPlanStatus
            isActive={!!activeSub || workspaceOnly}
            planSummary={{
              name: activeSub ? currentPlan?.name ?? '—' : planDisplay.planName,
            }}
            infoTiles={planInfoTiles}
            progress={planProgress}
            cancellationNotice={
              isCancellationScheduled
                ? {
                  heading: 'Cancellation scheduled',
                  body: (
                    <>
                      Your subscription will stop renewing after {formattedNextBilling ?? 'this period'}. You retain access until the end of the
                      cycle.
                    </>
                  ),
                }
                : undefined
            }
            pendingSwitchNotice={
              scheduledPlan
                ? {
                    heading: 'Plan switch scheduled',
                    body: (
                      <>
                        Your subscription will switch to <span className="font-medium">{scheduledPlan.name}</span>
                        {formattedScheduledDate ? <> on <span className="font-medium">{formattedScheduledDate}</span></> : <> at the end of your current billing period</>}.
                        You&apos;ll keep your current plan until then.
                      </>
                    ),
                  }
                : undefined
            }
            emptyState={workspaceOnly
              ? {
                heading: 'Workspace plan active',
                description: `${planDisplay.workspace?.name ?? 'Your workspace'} manages billing. Purchase personal time if you need your own plan.`,
                action: (
                  <Link
                    href="/pricing"
                    className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-5 py-2 text-sm font-semibold !text-white shadow-sm transition hover:bg-purple-700"
                  >
                    Browse personal plans
                  </Link>
                ),
              }
              : {
                heading: 'Free tier active',
                description: 'Unlock more features and get priority access to new updates by upgrading to a paid plan.',
                action: (
                  <Link
                    href="/pricing"
                    className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-5 py-2 text-sm font-semibold !text-white shadow-sm transition hover:bg-purple-700"
                  >
                    Upgrade to Pro
                  </Link>
                ),
              }}
            extra={<PlanBillingActions />}
          />

          {pendingCount > 0 ? (
            <section className={dashboardPanelClass('space-y-5')}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Upcoming subscriptions</h2>
                  <p className="text-sm text-slate-500 dark:text-neutral-400">Pending time will automatically activate when your current plan ends.</p>
                </div>
                <span className="text-2xl" aria-hidden="true">📅</span>
              </div>
              <div className="space-y-4">
                {pendingSubsWithFormats.map((subscription) => {
                  const plan = subscription.planForUI ?? mapPlanForUI(subscription.plan);
                  const price = plan?.priceCents != null ? plan.priceCents : 0;
                  const durationHours = plan?.durationHours ?? 0;
                  const startsInFuture = subscription.startedAt.getTime() > nowTimeMs + 1000;

                  return (
                    <div
                      key={subscription.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-purple-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-600"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{plan?.name ?? 'Unknown plan'}</p>
                          <p className="text-xs text-slate-500 dark:text-neutral-400">
                            {plan?.shortDescription || plan?.description || 'Details not available'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-slate-900 dark:text-neutral-100">${(price / 100).toFixed(2)}</p>
                          <p className="text-xs text-slate-500 dark:text-neutral-400">
                            {plan?.autoRenew
                              ? plan.recurringInterval === 'year'
                                ? 'per year'
                                : plan?.recurringInterval === 'month'
                                  ? 'per month'
                                  : plan?.recurringInterval === 'week'
                                    ? 'per week'
                                    : 'per period'
                              : durationHours >= 8760
                                ? 'annual access'
                                : durationHours >= 720
                                  ? 'monthly access'
                                  : durationHours >= 168
                                    ? 'weekly access'
                                    : 'daily access'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className={dashboardMutedPanelClass('p-3 text-xs text-slate-600 dark:text-neutral-400')}>
                          <span className="font-semibold text-slate-700 dark:text-neutral-200">Starts:</span>{' '}
                          {subscription.formattedStartedAt ?? '—'}
                        </div>
                        <div className={dashboardMutedPanelClass('p-3 text-xs text-slate-600 dark:text-neutral-400')}>
                          <span className="font-semibold text-slate-700 dark:text-neutral-200">Expires:</span>{' '}
                          {subscription.formattedExpiresAt ?? '—'}
                        </div>
                      </div>

                      <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50/80 p-3 text-xs text-purple-600 dark:border-purple-500/40 dark:bg-purple-500/10 dark:text-purple-200">
                        ✨ This subscription is pending. It will begin automatically when your current plan ends.
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-neutral-400">
                        {startsInFuture ? (
                          <span>Scheduled to start on {subscription.formattedStartedAt ?? '—'}.</span>
                        ) : (
                          <span>Activate now to switch immediately.</span>
                        )}
                        {!startsInFuture ? (
                          <ActivatePendingButton subscriptionId={subscription.id} label="Activate now" />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className={dashboardMutedPanelClass('text-sm text-slate-600 dark:text-neutral-400')}>
                <div className="font-semibold text-slate-800 dark:text-neutral-100">How stacking works</div>
                <p className="mt-1 text-xs text-slate-600 dark:text-neutral-400">
                  Purchasing while already subscribed queues the new time so you never lose access. Activate early to swap plans immediately or let it auto-start on your renewal date.
                </p>
              </div>
            </section>
          ) : null}

          <section className="space-y-6 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-6 lg:shadow-sm lg:transition-shadow dark:lg:border-neutral-800 dark:lg:bg-neutral-900/60 dark:lg:shadow-[0_0_25px_rgba(15,23,42,0.45)]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Available plans</h2>
                <p className="text-sm text-slate-500 dark:text-neutral-400">Compare options tailored to teams, solo creators, and automations.</p>
              </div>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-purple-300 hover:bg-purple-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
              >
                Full pricing page
              </Link>
            </div>
            <DashboardPricingListServerWrapper plans={plansForPricing} activeRecurringPlan={activeRecurringPlan} scheduledPlanId={scheduledPlan?.id ?? null} />
          </section>
        </div>

        <div className="space-y-6">
          <div className={dashboardPanelClass('space-y-4')}>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Why upgrade?</h2>
              <p className="text-sm text-slate-500 dark:text-neutral-400">Upgrading to a premium plan unlocks more features and grants priority access to new updates</p>
            </div>
            <ul className="space-y-3 text-sm text-slate-600 dark:text-neutral-300">
              <li>• Pro features unlock for better workflow.</li>
              <li>• Priority support with guaranteed response times.</li>
            </ul>
            <Link
              href="/dashboard/support"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-purple-300 hover:bg-purple-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
            >
              Talk to sales
            </Link>
          </div>

          <div className={dashboardMutedPanelClass('space-y-3')}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">🛡️</span>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Secure billing</p>
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  Payments are processed through Stripe and protected with industry-standard security. You can manage invoices and update payment methods anytime.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
