import Link from 'next/link';
import { prisma } from '../../../lib/prisma';
import PaymentManagement from '../../../components/billing/PaymentManagement';
export const dynamic = 'force-dynamic';
import { getSupportEmail, getDefaultTokenLabel, getFreePlanSettings } from '../../../lib/settings';
import { formatDateServer } from '../../../lib/formatDate.server';
import { pluralize } from '../../../lib/pluralize';
import ActivatePendingButton from '../../../components/dashboard/ActivatePendingButton';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import { dashboardPanelClass, dashboardMutedPanelClass } from '../../../components/dashboard/dashboardSurfaces';
import { CurrentPlanStatus } from '../../../components/dashboard/CurrentPlanStatus';
import type { PlanInfoTile } from '../../../components/dashboard/CurrentPlanStatus';
import PlanBillingActions from '../../../components/dashboard/PlanBillingActions';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '../../../lib/route-guards';
import { getOrganizationPlanContext, buildPlanDisplay } from '../../../lib/user-plan-context';
import { getActiveCurrencyAsync } from '../../../lib/payment/registry';
import { enforceTeamWorkspaceProvisioningGuard } from '../../../lib/dashboard-workspace-guard';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Billing',
    description: 'Manage payment methods, download invoices, and stay ahead of renewals without leaving the dashboard.',
    audience: 'user',
  });
}

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BillingPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const returnPath = buildReturnPath('/dashboard/billing', resolvedSearchParams);
  const { userId, orgId } = await requireAuth(returnPath);
  await enforceTeamWorkspaceProvisioningGuard(userId);
  const now = new Date();

  const [subscription, upcomingSubscriptions, recentPayments, supportEmail, userRecord, defaultTokenLabel, organizationPlan, activeCurrency] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE', expiresAt: { gt: now } },
      include: {
        plan: true,
        scheduledPlan: { select: { id: true, name: true, priceCents: true } }
      }
    }),
    prisma.subscription.findMany({
      where: {
        userId,
        status: { in: ['PENDING'] },
        // Only show upcoming items that are either scheduled for the future
        // or have payment evidence. This prevents abandoned checkout placeholders
        // from appearing as activatable subscriptions.
        OR: [
          { startedAt: { gt: now } },
          { payments: { some: { status: 'SUCCEEDED' } } },
        ],
      },
      include: { plan: true },
      orderBy: { startedAt: 'asc' }
    }),
    prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { subscription: { include: { plan: true } } },
      take: 3
    }),
    getSupportEmail(),
    prisma.user.findUnique({ where: { id: userId }, select: { tokenBalance: true, freeTokenBalance: true } }),
    getDefaultTokenLabel(),
    getOrganizationPlanContext(userId, orgId),
    getActiveCurrencyAsync(),
  ]);

  // Format upcoming subscription dates
  const upcomingWithFormattedDates = await Promise.all(
    upcomingSubscriptions.map(async (sub) => ({
      ...sub,
      formattedStartedAt: await formatDateServer(sub.startedAt),
      formattedExpiresAt: await formatDateServer(sub.expiresAt)
    }))
  );

  const freePlanSettings = await getFreePlanSettings();
  const paidTokenBalance = typeof userRecord?.tokenBalance === 'number' ? userRecord.tokenBalance : 0;
  const freeTokenBalanceVal = typeof userRecord?.freeTokenBalance === 'number' ? userRecord.freeTokenBalance : 0;
  const planDisplay = buildPlanDisplay({
    subscription,
    organizationContext: organizationPlan,
    userTokenBalance: paidTokenBalance,
    userFreeTokenBalance: freeTokenBalanceVal,
    freePlanSettings,
    defaultTokenLabel,
  });

  const nextBillingDate = subscription?.expiresAt;
  const personalActive = !!subscription;
  const workspaceOnly = !personalActive && !!organizationPlan;
  const planActive = personalActive || workspaceOnly;
  const isCancellationScheduled = !!subscription?.canceledAt;
  const canceledAt = subscription?.canceledAt ? subscription.canceledAt.toISOString() : null;
  const planAutoRenew = !!subscription?.plan?.autoRenew;
  const nextBillingDateISO = subscription?.expiresAt ? subscription.expiresAt.toISOString() : null;
  const scheduledPlan = subscription?.scheduledPlan ?? null;
  const formattedScheduledDate = subscription?.scheduledPlanDate
    ? await formatDateServer(subscription.scheduledPlanDate) : null;

  // Pre-format values on the server using DB-backed settings to avoid
  // SSR/CSR hydration mismatches.
  const formattedNextBillingDate = nextBillingDate ? await formatDateServer(nextBillingDate) : null;
  const daysUntilRenewal = nextBillingDate
    ? Math.max(0, Math.ceil((new Date(nextBillingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const latestPayment = recentPayments[0] ?? null;
  const latestPaymentDate = latestPayment ? await formatDateServer(latestPayment.createdAt) : null;
  // Pre-format recent payments' createdAt for client components to avoid hydration mismatch
  const preformattedRecentPayments = await Promise.all(
    recentPayments.map(async (p) => ({ id: p.id, formattedCreatedAt: await formatDateServer(p.createdAt) }))
  );
  const formattedCanceledAt = subscription?.canceledAt ? await formatDateServer(subscription.canceledAt) : null;
  const latestPaymentHelper = latestPayment
    ? `$${(latestPayment.amountCents / 100).toFixed(2)} • ${latestPayment.subscription?.plan?.name ?? 'Subscription'}`
    : 'No invoices on file';
  const subscriptionStart = subscription?.startedAt ?? null;
  const accessProgressPercent =
    subscriptionStart && nextBillingDate && nextBillingDate.getTime() !== subscriptionStart.getTime()
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((Date.now() - subscriptionStart.getTime()) / (nextBillingDate.getTime() - subscriptionStart.getTime())) * 100
            )
          )
        )
      : 0;

  const cycleProgressValue = personalActive && nextBillingDate && subscriptionStart ? `${accessProgressPercent}%` : '—';
  const cycleProgressHelper =
    personalActive && daysUntilRenewal != null
      ? `${pluralize(daysUntilRenewal, 'day')} remaining`
      : workspaceOnly
      ? planDisplay.statusHelper
      : 'Start a plan to track your cycle';
  const activePlanName = planDisplay.planName ?? '—';
  const subscriptionStatusHelper = planDisplay.statusHelper;
  const billingTypeLabel = !planActive
    ? 'No active plan'
    : personalActive
    ? isCancellationScheduled
      ? 'Cancellation scheduled'
      : planAutoRenew
      ? 'Auto-renewing'
      : 'Non-recurring'
    : 'Workspace managed';

  const tokenLabel = planDisplay.tokenLabel;
  const tokenStatValue = planDisplay.tokenStatValue;
  const tokenStatHelper = planDisplay.tokenStatHelper;
  const combinedBalance = paidTokenBalance + freeTokenBalanceVal;
  const tokenTone = planDisplay.planSource === 'FREE'
    ? combinedBalance > 0
      ? 'purple'
      : 'slate'
    : planDisplay.planSource === 'ORGANIZATION'
    ? 'indigo'
    : combinedBalance > 0
    ? 'purple'
    : 'amber';
  const planPriceCents = subscription?.plan?.priceCents ?? null;
  const planPriceDisplay = planPriceCents != null ? `$${(planPriceCents / 100).toFixed(2)}` : '—';
  const planDurationLabel = (() => {
    if (!subscription?.plan) return '—';
    if (planAutoRenew) {
      switch (subscription.plan.recurringInterval) {
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
    const hours = subscription.plan.durationHours ?? 0;
    if (hours >= 8760) return 'Annual access';
    if (hours >= 720) return 'Monthly access';
    if (hours >= 168) return 'Weekly access';
    return 'One-time access';
  })();
  const currentPlanDescription =
    subscription?.plan?.shortDescription || subscription?.plan?.description || `${process.env.NEXT_PUBLIC_SITE_NAME || 'YourApp'} subscription`;
  const planInfoTiles: PlanInfoTile[] = personalActive
    ? [
        {
          label: 'Price',
          value: planPriceDisplay,
          helper: planAutoRenew ? 'Renews automatically' : 'One-time payment',
          tone: 'emerald' as const,
        },
        {
          label: 'Access',
          value: planDurationLabel,
          helper: planAutoRenew ? 'Continues while payments renew' : 'Ends after this cycle',
          tone: 'rose' as const,
        },
        {
          label: tokenLabel,
          value: tokenStatValue,
          helper: tokenStatHelper,
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
          label: tokenLabel,
          value: tokenStatValue,
          helper: tokenStatHelper,
          tone: 'violet' as const,
        },
      ]
    : [];
  const planProgress = personalActive
    ? {
        label: planAutoRenew ? 'Cycle ends' : 'Access ends',
        dateDisplay: formattedNextBillingDate ?? '—',
        percent: accessProgressPercent,
        helper: cycleProgressHelper,
        secondary: formattedCanceledAt ? `Cancelled on ${formattedCanceledAt}` : latestPaymentDate ? `Last invoice: ${latestPaymentDate}` : null,
        badges: [
          { label: 'Billing:', value: billingTypeLabel, tone: 'emerald' as const },
          {
            label: 'Status:',
            value: isCancellationScheduled ? 'Ending after this cycle' : subscription.status,
            tone: isCancellationScheduled ? ('amber' as const) : ('violet' as const),
          },
        ],
      }
    : undefined;

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        accent="indigo"
        eyebrow="Billing & subscription"
        eyebrowIcon="🧾"
        title="Keep billing effortless"
        stats={[
          {
            label: 'Subscription status',
            value: planActive ? 'Active' : 'Inactive',
            helper: subscriptionStatusHelper,
            tone: planActive ? 'emerald' : 'slate'
          },
          {
            label: `Remaining ${tokenLabel}`,
            value: tokenStatValue,
            helper: tokenStatHelper,
            tone: tokenTone
          },
        ]}
      />

  <div className="grid gap-6 xl:grid-cols-[minmax(0,4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <CurrentPlanStatus
            isActive={planActive}
            planSummary={{
              name: activePlanName,
            }}
            infoTiles={planInfoTiles}
            progress={planProgress}
            cancellationNotice={
              isCancellationScheduled && personalActive
                ? {
                    heading: 'Cancellation scheduled',
                    body: (
                      <>
                        Auto-renew is disabled. You&apos;ll keep access until {formattedNextBillingDate ?? 'the end of this period'}.
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
                  description: `${planDisplay.workspace?.name ?? 'Your workspace'} manages billing for your account. Purchase personal time if you need a separate plan.`,
                  action: (
                    <Link
                      href="/pricing"
                      className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                    >
                      Browse personal plans
                    </Link>
                  ),
                }
              : {
                  heading: 'No active subscription',
                  description: 'Choose a plan to unlock more features.',
                  action: (
                    <Link
                      href="/pricing"
                      className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                    >
                      Subscribe to Pro
                    </Link>
                  ),
                }}
            extra={
              latestPayment ? (
                <>
                  <div className={dashboardMutedPanelClass('flex flex-wrap items-center justify-between gap-3 p-4 text-xs text-slate-600 dark:text-neutral-300')}>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Most recent charge</p>
                      <p>{latestPaymentHelper}</p>
                    </div>
                    <Link
                      href="/dashboard/transactions"
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
                    >
                      View all invoices
                    </Link>
                  </div>
                  <PlanBillingActions displayCurrency={activeCurrency} />
                </>
              ) : null
            }
          />

          {upcomingWithFormattedDates.length > 0 ? (
            <section className={dashboardPanelClass('space-y-5')}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Upcoming subscriptions</h2>
                  <p className="text-sm text-slate-500 dark:text-neutral-400">Pending time automatically activates when your current plan ends.</p>
                </div>
                <span className="text-2xl" aria-hidden="true">📅</span>
              </div>

              <div className="space-y-4">
                {upcomingWithFormattedDates.map((sub) => {
                  const startsInFuture = new Date(sub.startedAt).getTime() > Date.now() + 1000;
                  return (
                    <div
                      key={sub.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-600"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{sub.plan.name}</p>
                          <p className="text-xs text-slate-500 dark:text-neutral-400">{sub.plan.shortDescription || sub.plan.description}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500 dark:text-neutral-400">
                          <div className="font-semibold text-slate-900 dark:text-neutral-100">Starts {sub.formattedStartedAt}</div>
                          <div>Ends {sub.formattedExpiresAt}</div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-xs text-blue-600 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200">
                        {startsInFuture
                          ? 'This subscription is queued and will start automatically once your current plan ends.'
                          : 'Activate now to switch immediately, or let it begin when the current plan expires.'}
                      </div>

                      {!startsInFuture ? (
                        <div className="mt-3 flex justify-end">
                          <ActivatePendingButton subscriptionId={sub.id} label="Activate now" />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className={dashboardMutedPanelClass('text-xs text-slate-600 dark:text-neutral-400')}>
                Buying extra time stacks it behind your current plan. You never lose days you&apos;ve already paid for.
              </div>
            </section>
          ) : null}

          <section className="lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-6 lg:shadow-sm lg:transition-shadow dark:lg:border-neutral-800 dark:lg:bg-neutral-900/60 dark:lg:shadow-[0_0_25px_rgba(15,23,42,0.45)]">
            <PaymentManagement
              isActive={planActive}
              displayCurrency={activeCurrency}
              recentPayments={recentPayments}
              isCancellationScheduled={isCancellationScheduled}
              canceledAt={canceledAt}
              planAutoRenew={planAutoRenew}
              nextBillingDate={nextBillingDateISO}
              preformattedNextBillingDate={formattedNextBillingDate}
              preformattedCanceledAt={formattedCanceledAt}
              preformattedRecentPayments={preformattedRecentPayments}
            />
          </section>
        </div>

        <div className="space-y-6">
          <section className={dashboardPanelClass('space-y-3 text-sm text-slate-600 dark:text-neutral-300')}>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Billing information</h2>
              <p className="text-sm text-slate-500 dark:text-neutral-400">
                Answers to common billing questions and how to get help fast.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-slate-800 dark:text-neutral-100">How does billing work?</p>
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  You&apos;re charged upfront for the selected duration. Auto-renew only applies when enabled on your plan.
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-800 dark:text-neutral-100">Can I get a refund?</p>
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  We review refund requests within 7 days of purchase. Share details with support so we can assist quickly.
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-800 dark:text-neutral-100">Need help?</p>
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  Contact us at{' '}
                  <a href={`mailto:${supportEmail}`} className="font-semibold text-blue-600 hover:underline dark:text-blue-300">
                    {supportEmail}
                  </a>{' '}
                  or submit a ticket from the support center.
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/support"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
            >
              Open support center
            </Link>
          </section>

          <div className={dashboardMutedPanelClass('space-y-2 text-xs text-slate-600 dark:text-neutral-400')}>
            <div className="flex items-center gap-2">
              <span className="text-lg">🔒</span>
              <p className="font-semibold text-slate-800 dark:text-neutral-100">Secure payments</p>
            </div>
            <p>Stripe powers our billing. Payment methods are tokenized and never stored on SaaSyBase servers.</p>
            <p className="text-[11px] text-slate-500 dark:text-neutral-500">PCI DSS Level 1 compliant • 3D Secure support • Instant email receipts</p>
          </div>
        </div>
      </div>
    </div>
  );
}
