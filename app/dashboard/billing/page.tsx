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
import { getOrganizationPlanContext, buildPlanDisplay, getPaymentScopeFilter, getPlanScope, getSubscriptionScopeFilter } from '../../../lib/user-plan-context';
import { getActiveCurrencyAsync } from '../../../lib/payment/registry';
import { enforceTeamWorkspaceProvisioningGuard } from '../../../lib/dashboard-workspace-guard';
import { buildPendingSubscriptionSectionCopy } from '../../../lib/pending-subscription-display';

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
  const planScope = getPlanScope(orgId);

  const [subscription, upcomingSubscriptions, recentPayments, supportEmail, userRecord, defaultTokenLabel, organizationPlan, activeCurrency] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE', expiresAt: { gt: now }, ...getSubscriptionScopeFilter(planScope) },
      include: {
        plan: true,
        scheduledPlan: { select: { id: true, name: true, priceCents: true } }
      }
    }),
    prisma.subscription.findMany({
      where: {
        userId,
        status: { in: ['PENDING'] },
        ...getSubscriptionScopeFilter(planScope),
        // Only show upcoming items that are either scheduled for the future
        // or have payment evidence. This prevents abandoned checkout placeholders
        // from appearing as activatable subscriptions.
        OR: [
          { startedAt: { gt: now } },
          { payments: { some: { status: 'SUCCEEDED' } } },
          { prorationPendingSince: { not: null } },
        ],
      },
      include: { plan: true },
      orderBy: { startedAt: 'asc' }
    }),
    prisma.payment.findMany({
      where: { userId, ...getPaymentScopeFilter(planScope) },
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
      isAwaitingPaymentConfirmation: sub.prorationPendingSince instanceof Date,
      formattedStartedAt: await formatDateServer(sub.startedAt),
      formattedExpiresAt: await formatDateServer(sub.expiresAt),
      formattedPendingSince: sub.prorationPendingSince ? await formatDateServer(sub.prorationPendingSince) : null,
    }))
  );
  const pendingSectionCopy = buildPendingSubscriptionSectionCopy(
    upcomingWithFormattedDates.map((subscription) => ({
      isAwaitingPaymentConfirmation: subscription.isAwaitingPaymentConfirmation,
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
  const nowTimeMs = now.getTime();
  const formattedNextBillingDate = nextBillingDate ? await formatDateServer(nextBillingDate) : null;
  const daysUntilRenewal = nextBillingDate
    ? Math.max(0, Math.ceil((nextBillingDate.getTime() - nowTimeMs) / (1000 * 60 * 60 * 24)))
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
  const formattedSubscriptionStart = subscriptionStart ? await formatDateServer(subscriptionStart) : null;
  const accessProgressPercent =
    subscriptionStart && nextBillingDate && nextBillingDate.getTime() !== subscriptionStart.getTime()
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((nowTimeMs - subscriptionStart.getTime()) / (nextBillingDate.getTime() - subscriptionStart.getTime())) * 100
            )
          )
        )
      : 0;
  const cycleProgressHelper =
    personalActive && daysUntilRenewal != null
      ? `${pluralize(daysUntilRenewal, 'day')}`
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
  const planInfoTiles: PlanInfoTile[] = personalActive
    ? [
        {
          label: 'Price',
          value: planPriceDisplay,
          helper: formattedNextBillingDate ? `Next: ${formattedNextBillingDate}` : (planAutoRenew ? 'Auto-renewing' : 'One-time payment'),
          tone: 'emerald' as const,
        },
        {
          label: 'Access',
          value: planDurationLabel,
          helper: planAutoRenew ? (formattedSubscriptionStart ? `Since ${formattedSubscriptionStart}` : 'Auto-renewing') : 'Ends after this cycle',
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
        dateDisplay: cycleProgressHelper,
        percent: accessProgressPercent,
        helper: formattedNextBillingDate ?? '—',
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
                        Auto-renew is disabled for <span className="font-medium">{subscription?.plan?.name ?? 'your current plan'}</span>. You&apos;ll keep access until{' '}
                        <span className="font-medium">{formattedNextBillingDate ?? 'the end of this period'}</span>.
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
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">{pendingSectionCopy.title}</h2>
                  <p className="text-sm text-slate-500 dark:text-neutral-400">{pendingSectionCopy.subtitle}</p>
                </div>
                <span className="text-2xl" aria-hidden="true">📅</span>
              </div>

              <div className="space-y-4">
                {upcomingWithFormattedDates.map((sub) => {
                  const startsInFuture = !sub.isAwaitingPaymentConfirmation && sub.startedAt.getTime() > nowTimeMs + 1000;
                  const price = sub.plan?.priceCents != null ? sub.plan.priceCents : 0;
                  const durationHours = sub.plan?.durationHours ?? 0;
                  return (
                    <div
                      key={sub.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-purple-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-600"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{sub.plan.name}</p>
                          <p className="text-xs text-slate-500 dark:text-neutral-400">{sub.plan.shortDescription || sub.plan.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-slate-900 dark:text-neutral-100">${(price / 100).toFixed(2)}</p>
                          <p className="text-xs text-slate-500 dark:text-neutral-400">
                            {sub.plan?.autoRenew
                              ? sub.plan.recurringInterval === 'year'
                                ? 'per year'
                                : sub.plan?.recurringInterval === 'month'
                                  ? 'per month'
                                  : sub.plan?.recurringInterval === 'week'
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
                          {sub.formattedStartedAt ?? '—'}
                        </div>
                        <div className={dashboardMutedPanelClass('p-3 text-xs text-slate-600 dark:text-neutral-400')}>
                          <span className="font-semibold text-slate-700 dark:text-neutral-200">Expires:</span>{' '}
                          {sub.formattedExpiresAt ?? '—'}
                        </div>
                      </div>

                      <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50/80 p-3 text-xs text-purple-600 dark:border-purple-500/40 dark:bg-purple-500/10 dark:text-purple-200">
                        {sub.isAwaitingPaymentConfirmation
                          ? 'Awaiting Paystack payment confirmation. This switch will only activate after the provider confirms the charge.'
                          : startsInFuture
                            ? 'This subscription is queued and will start automatically once your current plan ends.'
                            : 'Activate now to switch immediately, or let it begin when the current plan expires.'}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-neutral-400">
                        {sub.isAwaitingPaymentConfirmation ? (
                          <span>
                            Started {sub.formattedPendingSince ?? sub.formattedStartedAt ?? 'recently'} and waiting for Paystack to confirm payment.
                          </span>
                        ) : startsInFuture ? (
                          <span>Scheduled to start on {sub.formattedStartedAt ?? '—'}.</span>
                        ) : (
                          <span>Activate now to switch immediately.</span>
                        )}
                        {!sub.isAwaitingPaymentConfirmation && !startsInFuture ? (
                          <ActivatePendingButton subscriptionId={sub.id} label="Activate now" />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {pendingSectionCopy.footerTitle && pendingSectionCopy.footerBody ? (
                <div className={dashboardMutedPanelClass('text-sm text-slate-600 dark:text-neutral-400')}>
                  <div className="font-semibold text-slate-800 dark:text-neutral-100">{pendingSectionCopy.footerTitle}</div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-neutral-400">{pendingSectionCopy.footerBody}</p>
                </div>
              ) : null}
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
