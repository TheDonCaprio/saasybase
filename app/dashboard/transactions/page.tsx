import Link from 'next/link';
import { prisma } from '../../../lib/prisma';
import { PaginatedTransactionList } from '../../../components/dashboard/PaginatedTransactionList';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import { AdminStatCard } from '../../../components/admin/AdminStatCard';
import {
  faCircleCheck,
  faClock,
  faTriangleExclamation,
  faArrowRotateLeft
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMoneyBillWave } from '@fortawesome/free-solid-svg-icons';
import { dashboardMutedPanelClass } from '../../../components/dashboard/dashboardSurfaces';
export const dynamic = 'force-dynamic';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '../../../lib/route-guards';
import { getActiveCurrencyAsync } from '../../../lib/payment/registry';
import { formatCurrency } from '../../../lib/utils/currency';
import { enforceTeamWorkspaceProvisioningGuard } from '../../../lib/dashboard-workspace-guard';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Transactions',
    description: 'Review charges, refunds, and coupon usage with export-ready records from your SaaSyBase billing history.',
    audience: 'user',
  });
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const returnPath = buildReturnPath('/dashboard/transactions', resolvedSearchParams);
  const { userId } = await requireAuth(returnPath);
  await enforceTeamWorkspaceProvisioningGuard(userId);

  const page = 1;
  const limit = 50;
  const skip = (page - 1) * limit;

  const [payments, totalCount, allPayments, completedCount, pendingCount, failedCount, refundedCount, refundedSumResult, activeCurrency] = await Promise.all([
    prisma.payment.findMany({ 
      where: { userId }, 
      orderBy: { createdAt: 'desc' }, 
      skip,
      take: limit,
      include: { 
        subscription: { 
          include: { plan: true }
        },
        plan: true
      }
    }),
    prisma.payment.count({ where: { userId } }),
    prisma.payment.findMany({
      where: { userId },
      select: { amountCents: true }
    })
    ,
    prisma.payment.count({ where: { userId, status: { in: ['COMPLETED', 'SUCCEEDED'] } } }),
    prisma.payment.count({ where: { userId, status: { in: ['PENDING', 'PENDING_SUBSCRIPTION'] } } }),
    prisma.payment.count({ where: { userId, status: 'FAILED' } }),
    prisma.payment.count({ where: { userId, status: 'REFUNDED' } }),
    prisma.payment.aggregate({ where: { userId, status: 'REFUNDED' }, _sum: { amountCents: true } }),
    getActiveCurrencyAsync(),
  ]);

  const totalSpent = allPayments.reduce((sum, p) => sum + p.amountCents, 0);
  const totalSpentFormatted = formatCurrency(totalSpent, activeCurrency);

  const refundedAmountCents = refundedSumResult?._sum?.amountCents ?? 0;
  const refundedAmountFormatted = formatCurrency(refundedAmountCents, activeCurrency);

  const initialPayments = payments.map((payment) => {
    const subscriptionPlan = payment.subscription?.plan ?? null;
    const directPlan = payment.plan ?? null;

    const subscription = payment.subscription
      ? {
          id: payment.subscription.id,
          status: payment.subscription.status,
          startedAt: payment.subscription.startedAt,
          expiresAt: payment.subscription.expiresAt,
          plan: subscriptionPlan
            ? {
                name: subscriptionPlan.name ?? '',
                durationHours: subscriptionPlan.durationHours ?? 0,
              }
            : {
                name: '',
                durationHours: 0,
              },
        }
      : null;

    const planForDisplay = subscriptionPlan && subscriptionPlan.name
      ? subscriptionPlan
      : directPlan;

    const plan = planForDisplay && typeof planForDisplay.id === 'string' && typeof planForDisplay.name === 'string' && planForDisplay.name.length > 0
      ? {
          id: planForDisplay.id,
          name: planForDisplay.name,
        }
      : null;

    return {
      id: payment.id,
      amountCents: payment.amountCents,
      amountFormatted: formatCurrency(payment.amountCents, activeCurrency),
      subtotalCents: payment.subtotalCents ?? null,
      discountCents: payment.discountCents ?? null,
      subtotalFormatted: payment.subtotalCents != null ? formatCurrency(payment.subtotalCents, activeCurrency) : null,
      discountFormatted: payment.discountCents != null ? formatCurrency(payment.discountCents, activeCurrency) : null,
      couponCode: payment.couponCode ?? null,
      currency: payment.currency ?? activeCurrency,
      status: payment.status,
      createdAt: payment.createdAt,
      subscription,
      plan,
    };
  });
  
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        accent="emerald"
        eyebrow="Billing records"
        eyebrowIcon={<FontAwesomeIcon icon={faMoneyBillWave} />}
        title="Transaction history"
        stats={[
          {
            label: 'All transactions',
            value: totalCount,
            helper: totalCount > 0 ? 'Everything logged' : 'Nothing yet',
            tone: totalCount > 0 ? 'indigo' : 'slate',
          },
          {
            label: 'Total spent',
            value: totalSpentFormatted,
            helper: totalCount > 0 ? `${refundedAmountFormatted} refunded` : 'Nothing yet',
            tone: totalCount > 0 ? 'emerald' : 'slate',
          },
        ]}
      />

      {/* Metric cards (immediately after hero) */}
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <AdminStatCard
          label="Completed"
          value={completedCount.toLocaleString()}
          helper="Successful charges"
          icon={faCircleCheck}
          accent="theme"
          className="h-full"
        />
        <AdminStatCard
          label="Pending"
          value={pendingCount.toLocaleString()}
          helper="Awaiting confirmation"
          icon={faClock}
          accent="theme"
          className="h-full"
        />
        <AdminStatCard
          label="Failed"
          value={failedCount.toLocaleString()}
          helper="Requires attention"
          icon={faTriangleExclamation}
          accent="theme"
          className="h-full"
        />
        <AdminStatCard
          label="Refunded"
          value={refundedCount.toLocaleString()}
          helper="Issued back to you"
          icon={faArrowRotateLeft}
          accent="theme"
          className="h-full"
        />
      </section>

      {totalCount === 0 ? (
        <div className={dashboardMutedPanelClass('text-center text-sm text-slate-600 dark:text-neutral-300')}>
          <div className="mb-2 text-base font-semibold text-slate-800 dark:text-neutral-100">No transactions yet</div>
          <p className="mb-4">Upgrade to {process.env.NEXT_PUBLIC_SITE_NAME || 'YourApp'} to unlock premium exports and you&apos;ll see invoices appear here instantly.</p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Explore plans
          </Link>
        </div>
      ) : (
        <section className="space-y-6 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-6 lg:shadow-sm lg:transition-shadow dark:lg:border-neutral-800 dark:lg:bg-neutral-900/60 dark:lg:shadow-[0_0_25px_rgba(15,23,42,0.45)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Recent payments</h2>
              <p className="text-sm text-slate-500 dark:text-neutral-400">Use filters below to jump to specific invoices or download receipts.</p>
            </div>
            <div className="text-xs text-slate-500 dark:text-neutral-400">
              Showing the latest {Math.min(totalCount, 50)} of {totalCount}
            </div>
          </div>
            <PaginatedTransactionList
              initialPayments={initialPayments}
              initialTotalCount={totalCount}
              initialPage={page}
              displayCurrency={activeCurrency}
            />
        </section>
      )}
    </div>
  );
}
