import PricingList from '../../components/pricing/PricingList';
import { prisma } from '../../lib/prisma';
import { auth } from '@clerk/nextjs/server';
import { formatDateServer } from '../../lib/formatDate.server';
import { pluralize } from '../../lib/pluralize';
import { getDefaultTokenLabel, getPricingSettings, generatePricingGridClasses, getFreePlanSettings } from '../../lib/settings';
import { CurrentPlanStatus } from '../../components/dashboard/CurrentPlanStatus';
import PlanBillingActions from '../../components/dashboard/PlanBillingActions';
import { PricingPageClient } from '../../components/pricing/PricingPageClient';
import { getActiveCurrency } from '../../lib/payment/registry';
import { formatCurrency } from '../../lib/utils/currency';

export default async function PricingPage() {
  const { userId } = await auth();
  const numberFormatter = new Intl.NumberFormat('en-US');
  const activeCurrency = getActiveCurrency();

  const [currentSubscription, plansRaw, defaultTokenLabel, userRecord] = await Promise.all([
    userId ? prisma.subscription.findFirst({
    where: { userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
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
          tokenName: true
        }
      }
    }
  }) : null,
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
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { tokenBalance: true, freeTokenBalance: true } }) : null
  ]);

  const plans = plansRaw.map((plan) => {
    const planTokenName = typeof plan.tokenName === 'string' ? plan.tokenName.trim() : '';
    return { ...plan, tokenName: planTokenName || defaultTokenLabel };
  });

  // Calculate next billing date
  const nextBillingDate = currentSubscription?.expiresAt;
  const formattedNextBilling = nextBillingDate ? await formatDateServer(nextBillingDate) : null;
  const isCancellationScheduled = !!currentSubscription?.canceledAt;
  const formattedCanceledAt = currentSubscription?.canceledAt ? await formatDateServer(currentSubscription.canceledAt) : null;
  const isActive = !!currentSubscription;
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
  const planDescription =
    currentSubscription?.plan?.shortDescription || currentSubscription?.plan?.description || `${process.env.NEXT_PUBLIC_SITE_NAME || 'YourApp'} subscription`;
  const planTokenNameRaw = currentSubscription?.plan?.tokenName;
  const planTokenName = typeof planTokenNameRaw === 'string' ? planTokenNameRaw.trim() : '';
  const paidTokenBalance = typeof userRecord?.tokenBalance === 'number' ? userRecord.tokenBalance : 0;
  const freeTokenBalanceVal = typeof userRecord?.freeTokenBalance === 'number' ? userRecord.freeTokenBalance : 0;
  const freePlanSettings = await getFreePlanSettings();
  const tokenLimitRaw = currentSubscription?.plan?.tokenLimit ?? (currentSubscription ? null : (freePlanSettings.renewalType === 'unlimited' ? null : freePlanSettings.tokenLimit));
  const normalizedTokenName = planTokenName || freePlanSettings.tokenName || defaultTokenLabel;
  const tokenLabel = normalizedTokenName.charAt(0).toUpperCase() + normalizedTokenName.slice(1);
  const formattedPaidBalance = numberFormatter.format(paidTokenBalance);
  const formattedFreeBalance = numberFormatter.format(freeTokenBalanceVal);
  const tokenLimitDisplay = tokenLimitRaw != null ? numberFormatter.format(tokenLimitRaw) : 'Unlimited';
  const tokenStatValue = `${formattedPaidBalance} paid • ${formattedFreeBalance} free`;
  const tokenStatHelper = tokenLimitRaw != null
    ? `Out of ${tokenLimitDisplay} ${normalizedTokenName}`
    : freePlanSettings.renewalType === 'unlimited'
    ? `Unlimited ${normalizedTokenName} for free users`
    : `Free users receive ${numberFormatter.format(freePlanSettings.tokenLimit)} ${normalizedTokenName}`;
  const subscriptionStart = currentSubscription?.startedAt ?? null;
  const accessProgressPercent =
    subscriptionStart && nextBillingDate && nextBillingDate.getTime() !== subscriptionStart.getTime()
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((Date.now() - subscriptionStart.getTime()) /
                (nextBillingDate.getTime() - subscriptionStart.getTime())) *
                100
            )
          )
        )
      : 0;
  const daysUntilRenewal = nextBillingDate
    ? Math.max(0, Math.ceil((new Date(nextBillingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const cycleProgressHelper = isActive && daysUntilRenewal != null
    ? `${pluralize(daysUntilRenewal, 'day')} ${planAutoRenew ? 'until renewal' : 'remaining'}`
    : isActive
    ? 'Renewal date to be announced'
    : 'Upgrade to unlock pro features';
  const billingTypeLabel = !isActive
    ? 'No active plan'
    : isCancellationScheduled
    ? 'Cancellation scheduled'
    : planAutoRenew
    ? 'Auto-renewing'
    : 'One-time access';
  const currentStatusLabel = isCancellationScheduled ? 'Ending after this cycle' : currentSubscription?.status ?? 'Inactive';
  const planInfoTiles = isActive
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
    : [];
  const planProgress = isActive
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

  const activeRecurringPlan = currentSubscription?.plan?.autoRenew
    ? {
        planId: currentSubscription.plan.id,
        priceCents: typeof currentSubscription.plan.priceCents === 'number'
          ? currentSubscription.plan.priceCents
          : null,
      }
    : null;

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
              <a href="/dashboard/coupons" className="text-blue-400 underline underline-offset-4">dashboard coupons page</a>{' '}
              before checking out so it appears here automatically.
            </p>
          </div>
        </div>
        
        {/* Current Plan Information for Logged-in Users */}
        {userId && (
          <CurrentPlanStatus
            className="current-plan-status"
            title=""
            isActive={isActive}
            description=""
            planSummary={{
              eyebrow: 'Plan overview',
              name: currentSubscription?.plan?.name ?? '—',
              description: planDescription,
            }}
            infoTiles={planInfoTiles}
            progress={planProgress}
            cancellationNotice={
              isCancellationScheduled
                ? {
                    heading: 'Cancellation scheduled',
                    body: (
                      <>
                        Your subscription is scheduled to stop renewing. You will retain access until{' '}
                        <span className="font-medium">{formattedNextBilling ?? 'the period end'}</span>.
                      </>
                    ),
                  }
                : undefined
            }
            emptyState={{
              heading: "You're currently on the free tier",
              description: 'Upgrade to unlock premium features',
            }}
            extra={<PlanBillingActions />}
          />
        )}
        
    <PricingList plans={plans} activeRecurringPlan={activeRecurringPlan} gridClasses={gridClasses} currency={activeCurrency} />
        <div className="text-xs text-neutral-500 space-y-1">
          <p>• <span className="text-blue-400">●</span> Auto-renewing plans will automatically charge and extend your access</p>
          <p>• <span className="text-yellow-400">●</span> One-time plans require manual renewal when they expire</p>
        </div>
      </div>
    </PricingPageClient>
  );
}
