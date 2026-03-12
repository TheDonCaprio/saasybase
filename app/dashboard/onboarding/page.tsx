export const dynamic = 'force-dynamic';
import { prisma } from '../../../lib/prisma';
import Link from 'next/link';
import { OnboardingChecklist } from '../../../components/dashboard/OnboardingChecklist';
import { getSiteName, SETTING_DEFAULTS, SETTING_KEYS } from '../../../lib/settings';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import { dashboardPanelClass, dashboardMutedPanelClass } from '../../../components/dashboard/dashboardSurfaces';
import { pluralize } from '../../../lib/pluralize';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar } from '@fortawesome/free-solid-svg-icons';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '../../../lib/route-guards';
import { enforceTeamWorkspaceProvisioningGuard } from '../../../lib/dashboard-workspace-guard';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Onboarding',
    description: 'Complete personalized setup steps to unlock the full SaaSyBase experience for your workspace.',
    audience: 'user',
  });
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const returnPath = buildReturnPath('/dashboard/onboarding', resolvedSearchParams);
  const { userId } = await requireAuth(returnPath);
  await enforceTeamWorkspaceProvisioningGuard(userId);

  // Check user's progress
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscriptions: {
        where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
        take: 1
      },
      payments: { take: 1 },
      settings: { take: 5 }
    }
  });

  const progress = {
    hasSubscription: user?.subscriptions.length ? user.subscriptions.length > 0 : false,
    hasPayment: user?.payments.length ? user.payments.length > 0 : false,
    hasSettings: user?.settings.length ? user.settings.length > 0 : false,
    profileComplete: !!(user?.name && user?.email)
  };

  const completedSteps = Object.values(progress).filter(Boolean).length;
  const totalSteps = Object.keys(progress).length;

  const siteName = await getSiteName().catch(() => process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME]);

  const completionRate = Math.round((completedSteps / totalSteps) * 100);
  const remainingSteps = totalSteps - completedSteps;

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        accent="emerald"
        eyebrow="Getting started"
        eyebrowIcon={<FontAwesomeIcon icon={faStar} className="w-5 h-5" />}
        title={`Welcome to ${siteName}`}
        stats={[
          {
            label: 'Completed steps',
            value: (
              <span>
                {completedSteps} / {totalSteps}
              </span>
            ),
            helper: `${completionRate}% done`,
            tone: completedSteps === totalSteps ? 'emerald' : 'indigo'
          },
          {
            label: 'Next milestone',
            value: remainingSteps === 0 ? 'All caught up' : pluralize(remainingSteps, 'step'),
            helper: remainingSteps === 0 ? 'You’re ready to explore' : 'Complete to progress',
            tone: remainingSteps === 0 ? 'emerald' : 'slate'
          }
        ]}
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-neutral-300">
            <span>Progress</span>
            <span>{completionRate}%</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/70 dark:bg-neutral-900/60">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all"
              style={{ width: `${completionRate === 0 ? 0 : Math.max(18, completionRate)}%` }}
            />
          </div>
        </div>
      </DashboardPageHeader>

  <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,1fr)]">
  <div className="space-y-6 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-6 lg:shadow-sm lg:transition-shadow dark:lg:border-neutral-800 dark:lg:bg-neutral-900/60 dark:lg:shadow-[0_0_25px_rgba(15,23,42,0.45)]">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Onboarding checklist</h2>
            <p className="text-sm text-slate-500 dark:text-neutral-400">Complete each step below to personalize your experience.</p>
          </div>
          <OnboardingChecklist userId={userId} progress={progress} />
        </div>

        <div className="space-y-4">
          <div className={dashboardMutedPanelClass('space-y-3')}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-neutral-100">What happens after onboarding?</p>
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  Unlock more features and priority access to new updates.
                </p>
              </div>
              <span className="text-lg">🚀</span>
            </div>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-neutral-300">
              <li>• Sync preferences across all of your devices.</li>
              <li>• Get curated tips based on your workflow.</li>
              <li>• Access early previews before they launch publicly.</li>
            </ul>
          </div>

          {completedSteps === totalSteps ? (
            <div className={dashboardPanelClass('text-center')}>
              <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-300">🎉 All set!</div>
                <p className="mt-2 text-sm text-slate-600 dark:text-neutral-300">
                You&apos;ve completed onboarding. Jump into the dashboard to explore {siteName} features.
              </p>
              <div className="mt-4 flex justify-center">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  Enter dashboard
                </Link>
              </div>
            </div>
          ) : (
            <div className={dashboardPanelClass('space-y-3')}>
              <div className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Need a hand?</div>
              <p className="text-xs text-slate-500 dark:text-neutral-400">
                Our support team is ready to guide you through onboarding. Share your use case and we&apos;ll tailor the next steps.
              </p>
              <Link
                href="/dashboard/support"
                className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
              >
                Contact support
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
