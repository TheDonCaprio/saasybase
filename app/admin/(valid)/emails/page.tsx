import { requireAdminPageAccess } from '../../../../lib/route-guards';
import { prisma } from '../../../../lib/prisma';
import EmailTemplatesClient from '../../../../components/admin/EmailTemplatesClient';
import { DashboardPageHeader } from '../../../../components/dashboard/DashboardPageHeader';
import { AdminStatCard, type AdminStatCardProps } from '../../../../components/admin/AdminStatCard';
import { dashboardPanelClass } from '../../../../components/dashboard/dashboardSurfaces';
import {
  faPaperPlane,
  faEnvelopeOpenText,
  faCode,
  faTriangleExclamation,
  faEnvelope
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { buildDashboardMetadata } from '../../../../lib/dashboardMetadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Emails',
    description: 'Audit template coverage, monitor delivery health, and seed defaults so campaigns never miss a beat.',
    audience: 'admin',
  });
}

export default async function EmailTemplatesPage() {
  await requireAdminPageAccess('/admin/emails');
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    templates,
    totalTemplates,
    activeTemplates,
    updatedTemplates7d,
    inactiveTemplates,
    sentLast24h,
    failedLast24h,
    sentLast7d,
    failedLast7d,
    templatedSends7d,
    uniqueRecipients7d
  ] = await Promise.all([
    prisma.emailTemplate.findMany({ orderBy: { name: 'asc' } }),
    prisma.emailTemplate.count(),
    prisma.emailTemplate.count({ where: { active: true } }),
    prisma.emailTemplate.count({ where: { updatedAt: { gte: sevenDaysAgo } } }),
    prisma.emailTemplate.count({ where: { active: false } }),
    prisma.emailLog.count({ where: { createdAt: { gte: twentyFourHoursAgo }, status: 'SENT' } }),
    prisma.emailLog.count({ where: { createdAt: { gte: twentyFourHoursAgo }, status: 'FAILED' } }),
    prisma.emailLog.count({ where: { createdAt: { gte: sevenDaysAgo }, status: 'SENT' } }),
    prisma.emailLog.count({ where: { createdAt: { gte: sevenDaysAgo }, status: 'FAILED' } }),
    prisma.emailLog.count({ where: { createdAt: { gte: sevenDaysAgo }, template: { not: null } } }),
    prisma.emailLog.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      distinct: ['to'],
      select: { to: true }
    })
  ]);

  const totalAttempts7d = sentLast7d + failedLast7d;
  const templatedShare7d = totalAttempts7d > 0 ? templatedSends7d / totalAttempts7d : 0;
  const deliveryRate7d = totalAttempts7d > 0 ? sentLast7d / totalAttempts7d : 0;

  const numberFormatter = new Intl.NumberFormat('en-US');
  const formatNumber = (value: number) => numberFormatter.format(value);
  const formatPercentage = (value: number) =>
    `${(Number.isFinite(value) ? value * 100 : 0).toFixed(value * 100 >= 1 ? 1 : 2)}%`;

  const heroStats = [
    {
      label: 'Active templates',
      value: formatNumber(activeTemplates),
      helper: `${formatNumber(totalTemplates)} total`,
      tone: 'purple' as const
    },
    {
      label: 'Delivery success (7d)',
      value: formatPercentage(deliveryRate7d),
      helper: `${formatNumber(totalAttempts7d)} total attempts`,
      tone: 'emerald' as const
    }
  ];

  const metricCards: AdminStatCardProps[] = [
    {
      label: 'Emails sent (24h)',
      value: formatNumber(sentLast24h),
      helper: `${formatNumber(failedLast24h)} failures`,
      icon: faPaperPlane,
      accent: 'theme'
    },
    {
      label: 'Emails sent (7d)',
      value: formatNumber(sentLast7d),
      helper: `${formatNumber(uniqueRecipients7d.length)} recipients`,
      icon: faEnvelopeOpenText,
      accent: 'theme'
    },
    {
      label: 'Templated sends (7d)',
      value: formatNumber(templatedSends7d),
      helper: `${formatPercentage(templatedShare7d)} of total`,
      icon: faCode,
      accent: 'theme'
    },
    {
      label: 'Inactive templates',
      value: formatNumber(inactiveTemplates),
      helper: `${formatNumber(updatedTemplates7d)} updated this week`,
      icon: faTriangleExclamation,
      accent: 'theme'
    }
  ];

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="violet"
        eyebrow="Messaging"
        eyebrowIcon={<FontAwesomeIcon icon={faEnvelope} className="w-5 h-5" />}
        title="Email delivery center"
        stats={heroStats}
      >
      </DashboardPageHeader>

      <section className="grid grid-cols-2 gap-4 min-[834px]:grid-cols-4">
        {metricCards.map((card) => (
          <AdminStatCard key={card.label} {...card} />
        ))}
      </section>

      <div className={dashboardPanelClass('p-6')}> 
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-neutral-50">Template management</h2>
            <p className="text-sm text-slate-600 dark:text-neutral-300">
              Review HTML and text content, toggle active states, or test-send any template in seconds. Seeding prebuilt templates keeps onboarding smooth for new workspaces.
            </p>
          </div>
          <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/40 p-4 text-sm text-violet-700 dark:border-violet-500/50 dark:bg-violet-500/15 dark:text-violet-100">
            <p className="font-medium">Need a fresh start?</p>
            <p className="mt-1 text-xs text-violet-600/90 dark:text-violet-200/80">
              Use the seeding action to restore the default transactional templates. It is safe to run as many times as needed.
            </p>
          </div>
        </div>
      </div>

      <EmailTemplatesClient initialTemplates={templates} />

      
    </div>
  );
}
