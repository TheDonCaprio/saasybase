import PricingList from '../../components/pricing/PricingList';
import { prisma } from '../../lib/prisma';
import { authService } from '@/lib/auth-provider';
import { formatDateServer } from '../../lib/formatDate.server';
import { pluralize } from '../../lib/pluralize';
import { getDefaultTokenLabel, getPricingSettings, generatePricingGridClasses, getFreePlanSettings } from '../../lib/settings';
import { CurrentPlanStatus } from '../../components/dashboard/CurrentPlanStatus';
import PlanBillingActions from '../../components/dashboard/PlanBillingActions';
import ActivatePendingButton from '../../components/dashboard/ActivatePendingButton';
import { dashboardPanelClass, dashboardMutedPanelClass } from '../../components/dashboard/dashboardSurfaces';
import { PricingPageClient } from '../../components/pricing/PricingPageClient';
import { getActiveCurrencyAsync } from '../../lib/payment/registry';
import { formatCurrency } from '../../lib/utils/currency';
import Link from 'next/link';
import { buildPendingSubscriptionSectionCopy } from '../../lib/pending-subscription-display';
import { PLAN_WITH_BILLING_FIELDS, buildPlanDisplay, getOrganizationPlanContext, getPlanScope, getSubscriptionScopeFilter } from '../../lib/user-plan-context';
import { buildPricingCardRecurringState } from '../../lib/pricing-card-status';

export default async function PricingPage() {
  const { userId, orgId } = await authService.getSession();
  const activeCurrency = await getActiveCurrencyAsync();
  const now = new Date();
  const nowTimeMs = now.getTime();
  const planScope = getPlanScope(orgId);

  const [currentSubscription, pendingSubscriptionsRaw, plansRaw, defaultTokenLabel, userRecord, organizationPlan, ownedRecurringSubscriptionsForCards] = await Promise.all([
    userId ? prisma.subscription.findFirst({
    where: { userId, status: 'ACTIVE', expiresAt: { gt: now }, ...getSubscriptionScopeFilter(planScope) },
    include: { 
      plan: {
        select: PLAN_WITH_BILLING_FIELDS
      },
      scheduledPlan: {
        select: { id: true, name: true, priceCents: true }
      }
    }
  }) : null,
    userId
      ? prisma.subscription.findMany({
          where: {
            userId,
            status: 'PENDING',
            ...getSubscriptionScopeFilter(planScope),
            OR: [
              { startedAt: { gt: now } },
              { payments: { some: { status: 'SUCCEEDED' } } },
              { prorationPendingSince: { not: null } },
            ],
          },
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
              },
            },
          },
          orderBy: { startedAt: 'asc' },
        })
      : [],
    prisma.plan.findMany({ 
      where: { active: true }, 
      orderBy: { sortOrder: 'asc' },
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
        organizationSeatLimit: true,
        organizationTokenPoolStrategy: true,
      }
    }),
    getDefaultTokenLabel(),
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { tokenBalance: true, freeTokenBalance: true } }) : null,
    userId ? getOrganizationPlanContext(userId, orgId) : null,
    userId
      ? prisma.subscription.findMany({
          where: {
            userId,
            plan: { autoRenew: true },
            OR: [
              { status: 'ACTIVE', expiresAt: { gt: now } },
              {
                status: 'PENDING',
                OR: [
                  { startedAt: { gt: now } },
                  { payments: { some: { status: 'SUCCEEDED' } } },
                  { prorationPendingSince: { not: null } },
                ],
              },
            ],
          },
          select: {
            status: true,
            plan: {
              select: {
                id: true,
                priceCents: true,
                recurringInterval: true,
                supportsOrganizations: true,
                autoRenew: true,
              },
            },
            scheduledPlan: { select: { id: true } },
          },
          orderBy: [{ status: 'asc' }, { expiresAt: 'asc' }, { startedAt: 'asc' }],
        })
      : [],
  ]);

  const { activeRecurringPlansByFamily, scheduledPlanIdsByFamily } = buildPricingCardRecurringState(ownedRecurringSubscriptionsForCards);

  const pendingSubscriptions = await Promise.all(
    pendingSubscriptionsRaw.map(async (sub) => ({
      ...sub,
      isAwaitingPaymentConfirmation: sub.prorationPendingSince instanceof Date,
      formattedStartedAt: await formatDateServer(sub.startedAt),
      formattedExpiresAt: await formatDateServer(sub.expiresAt),
      formattedPendingSince: sub.prorationPendingSince ? await formatDateServer(sub.prorationPendingSince) : null,
    }))
  );
  const pendingSectionCopy = buildPendingSubscriptionSectionCopy(
    pendingSubscriptions.map((subscription) => ({
      isAwaitingPaymentConfirmation: subscription.isAwaitingPaymentConfirmation,
    }))
  );

  const plans = plansRaw.map((plan) => {
    const planTokenName = typeof plan.tokenName === 'string' ? plan.tokenName.trim() : '';
    return { ...plan, tokenName: planTokenName || defaultTokenLabel };
  });

  // Calculate next billing date
  const nextBillingDate = currentSubscription?.expiresAt;
  const formattedNextBilling = nextBillingDate ? await formatDateServer(nextBillingDate) : null;
  const isCancellationScheduled = !!currentSubscription?.canceledAt;
  const formattedCanceledAt = currentSubscription?.canceledAt ? await formatDateServer(currentSubscription.canceledAt) : null;
  const scheduledPlan = currentSubscription?.scheduledPlan ?? null;
  const formattedScheduledDate = currentSubscription?.scheduledPlanDate
    ? await formatDateServer(currentSubscription.scheduledPlanDate) : null;
  const planAutoRenew = !!currentSubscription?.plan?.autoRenew;
  const planPriceCents = currentSubscription?.plan?.priceCents ?? null;
  const planPriceDisplay = planPriceCents != null ? formatCurrency(planPriceCents, activeCurrency) : '—';
  const planDurationLabel = (() => {
    if (!currentSubscription?.plan) return '—';
    if (planAutoRenew) {
      switch (currentSubscription.plan.recurringInterval) {
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
    const hours = currentSubscription.plan.durationHours ?? 0;
    if (hours >= 8760) return 'Annual access';
    if (hours >= 720) return 'Monthly access';
    if (hours >= 168) return 'Weekly access';
    return 'One-time access';
  })();
  const paidTokenBalance = typeof userRecord?.tokenBalance === 'number' ? userRecord.tokenBalance : 0;
  const freeTokenBalanceVal = typeof userRecord?.freeTokenBalance === 'number' ? userRecord.freeTokenBalance : 0;
  const freePlanSettings = await getFreePlanSettings();
  const planDisplay = buildPlanDisplay({
    subscription: currentSubscription,
    organizationContext: organizationPlan,
    userTokenBalance: paidTokenBalance,
    userFreeTokenBalance: freeTokenBalanceVal,
    freePlanSettings,
    defaultTokenLabel,
  });
  const workspaceOnly = !currentSubscription && !!organizationPlan;
  const planActive = Boolean(currentSubscription || workspaceOnly);
  const tokenLabel = planDisplay.tokenLabel;
  const tokenStatValue = planDisplay.tokenStatValue;
  const tokenStatHelper = planDisplay.tokenStatHelper;
  const subscriptionStart = currentSubscription?.startedAt ?? null;
  const accessProgressPercent =
    subscriptionStart && nextBillingDate && nextBillingDate.getTime() !== subscriptionStart.getTime()
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((now.getTime() - subscriptionStart.getTime()) /
                (nextBillingDate.getTime() - subscriptionStart.getTime())) *
                100
            )
          )
        )
      : 0;
  const daysUntilRenewal = nextBillingDate
    ? Math.max(0, Math.ceil((new Date(nextBillingDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : null;
  const cycleProgressHelper = currentSubscription && daysUntilRenewal != null
    ? `${pluralize(daysUntilRenewal, 'day')} ${planAutoRenew ? 'until renewal' : 'remaining'}`
    : currentSubscription
    ? 'Renewal date to be announced'
    : workspaceOnly
    ? planDisplay.statusHelper
    : 'Upgrade to unlock pro features';
  const billingTypeLabel = !planActive
    ? 'No active plan'
    : currentSubscription
    ? isCancellationScheduled
      ? 'Cancellation scheduled'
      : planAutoRenew
        ? 'Auto-renewing'
        : 'One-time access'
    : 'Workspace managed';
  const currentStatusLabel = isCancellationScheduled ? 'Ending after this cycle' : currentSubscription?.status ?? 'Inactive';
  const planInfoTiles = currentSubscription
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
  const planProgress = currentSubscription
    ? {
        label: planAutoRenew ? 'Cycle ends' : 'Access ends',
        dateDisplay: formattedNextBilling ?? '—',
        percent: accessProgressPercent,
        helper: cycleProgressHelper,
        secondary: formattedCanceledAt ? `Cancelled on ${formattedCanceledAt}` : null,
        badges: [
          { label: 'Billing:', value: billingTypeLabel, tone: 'emerald' as const },
          { label: 'Status:', value: currentStatusLabel, tone: isCancellationScheduled ? ('amber' as const) : ('indigo' as const) },
        ],
      }
    : undefined;

  // Fetch pricing layout settings and generate grid classes
  const pricingSettings = await getPricingSettings();
  const oneTimePlans = plans.filter(p => !p.autoRenew);
  const recurringPlans = plans.filter(p => p.autoRenew);
  const gridClasses = {
    oneTime: oneTimePlans.length > 0 ? generatePricingGridClasses(oneTimePlans.length, pricingSettings.maxColumns, pricingSettings.centerUneven) : undefined,
    recurring: recurringPlans.length > 0 ? generatePricingGridClasses(recurringPlans.length, pricingSettings.maxColumns, pricingSettings.centerUneven) : undefined,
  };

  return (
    <PricingPageClient>
      <div className="mx-auto w-full max-w-[1440px] px-4 lg:px-8 space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-neutral-50">Pricing</h1>
            <p className="text-sm text-neutral-400 max-w-xl">
              Access flexible plans for teams and solo creators. Upgrade when you need more power, or stick with a one-time pass for quick projects.
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-5 py-4 text-sm text-neutral-300 shadow-[0_0_30px_-20px_rgba(0,0,0,0.9)]">
            <div className="font-medium text-neutral-100">Have a promo code?</div>
            <p className="text-neutral-400 mt-1">
              Redeem it on the{' '}
              <Link href="/dashboard/coupons" className="text-blue-400 underline underline-offset-4">dashboard coupons page</Link>{' '}
              before checking out so it appears here automatically.
            </p>
          </div>
        </div>
        
        {/* Current Plan Information for Logged-in Users */}
        {userId && (
          <CurrentPlanStatus
            className="current-plan-status"
            title=""
            isActive={planActive}
            description=""
            planSummary={{
              name: currentSubscription?.plan?.name ?? planDisplay.planName,
            }}
            infoTiles={planInfoTiles}
            progress={planProgress}
            cancellationNotice={
              isCancellationScheduled
                ? {
                    heading: 'Cancellation scheduled',
                    body: (
                      <>
                        Auto-renew is disabled for <span className="font-medium">{currentSubscription?.plan?.name ?? 'your current plan'}</span>. You&apos;ll keep access until{' '}
                        <span className="font-medium">{formattedNextBilling ?? 'the end of this period'}</span>.
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
                  heading: "You're currently on the free tier",
                  description: 'Upgrade to unlock premium features',
                }}
              extra={<PlanBillingActions displayCurrency={activeCurrency} />}
          />
        )}

        {userId && pendingSubscriptions.length > 0 ? (
          <section className={dashboardPanelClass('space-y-5')}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">{pendingSectionCopy.title}</h2>
                <p className="text-sm text-slate-500 dark:text-neutral-400">{pendingSectionCopy.subtitle}</p>
              </div>
              <span className="text-2xl" aria-hidden="true">📅</span>
            </div>

            <div className="space-y-4">
              {pendingSubscriptions.map((sub) => {
                const price = sub.plan?.priceCents != null ? sub.plan.priceCents : 0;
                const durationHours = sub.plan?.durationHours ?? 0;
                const startsInFuture = !sub.isAwaitingPaymentConfirmation && sub.startedAt.getTime() > nowTimeMs + 1000;

                return (
                  <div
                    key={sub.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-purple-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-600"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{sub.plan?.name ?? 'Pending plan'}</p>
                        <p className="text-xs text-slate-500 dark:text-neutral-400">
                          {sub.plan?.shortDescription || sub.plan?.description || 'Details not available'}
                        </p>
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
                        : 'This subscription is pending. It will begin automatically when your current plan ends.'}
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
        
    <PricingList plans={plans} activeRecurringPlansByFamily={activeRecurringPlansByFamily} scheduledPlanIdsByFamily={scheduledPlanIdsByFamily} gridClasses={gridClasses} currency={activeCurrency} />
        <div className="text-xs text-neutral-500 space-y-1">
          <p>• <span className="text-blue-400">●</span> Auto-renewing plans will automatically charge and extend your access</p>
          <p>• <span className="text-yellow-400">●</span> One-time plans require manual renewal when they expire</p>
        </div>
      </div>
    </PricingPageClient>
  );
}
