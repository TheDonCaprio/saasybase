export const dynamic = 'force-dynamic';

import { requireAdminSectionAccess } from '../../../../lib/route-guards';
import { prisma } from '../../../../lib/prisma';
import { DashboardPageHeader } from '../../../../components/dashboard/DashboardPageHeader';
import { AdminStatCard } from '../../../../components/admin/AdminStatCard';
import type { AdminStatCardProps } from '../../../../components/admin/AdminStatCard';
import { OrganizationsClient } from '../../../../components/admin/OrganizationsClient';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBuilding, faEnvelopeOpenText, faSitemap, faUsersGear } from '@fortawesome/free-solid-svg-icons';
import { buildDashboardMetadata } from '../../../../lib/dashboardMetadata';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Organizations',
    description: 'Audit every workspace, monitor member caps, and intervene directly without leaving the admin console.',
    audience: 'admin'
  });
}

export default async function AdminOrganizationsPage() {
  await requireAdminSectionAccess('organizations');

  const baseWhere = { memberships: { some: { status: 'ACTIVE' } } } as const;
  const page = 1;
  const limit = 25;
  const skip = (page - 1) * limit;

  const [organizations, totalCount, tokenAggregate, pendingInviteCount, activeMemberCount, seatLimitedCount, hardCapCount] = await Promise.all([
    prisma.organization.findMany({
      where: baseWhere,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        plan: { select: { id: true, name: true, tokenLimit: true, organizationTokenPoolStrategy: true } },
        memberships: {
          where: { status: 'ACTIVE' },
          select: { id: true, sharedTokenBalance: true, memberTokenUsage: true, status: true },
        },
        invites: { select: { status: true } }
      }
    }),
    prisma.organization.count({ where: baseWhere }),
    Promise.all([
      prisma.organization.aggregate({
        _sum: { tokenBalance: true },
        where: { ...baseWhere, tokenPoolStrategy: 'SHARED_FOR_ORG' },
      }),
      prisma.organizationMembership.aggregate({
        _sum: { sharedTokenBalance: true },
        where: {
          status: 'ACTIVE',
          organization: {
            memberships: { some: { status: 'ACTIVE' } },
            tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
          },
        },
      }),
    ]),
    prisma.organizationInvite.count({ where: { status: 'PENDING' } }),
    prisma.organizationMembership.count({ where: { status: 'ACTIVE' } }),
    prisma.organization.count({ where: { seatLimit: { not: null } } }),
    prisma.organization.count({ where: { memberCapStrategy: 'HARD' } })
  ]);

  const totalTokenBalance = Number(tokenAggregate[0]._sum.tokenBalance ?? 0) + Number(tokenAggregate[1]._sum.sharedTokenBalance ?? 0);
  const avgMembers = totalCount > 0 ? Math.round(activeMemberCount / totalCount) : 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const initialOrganizations = organizations.map((org) => {
    const effectiveTokenPoolStrategy = org.plan?.organizationTokenPoolStrategy === 'ALLOCATED_PER_MEMBER'
      || org.tokenPoolStrategy === 'ALLOCATED_PER_MEMBER'
      ? 'ALLOCATED_PER_MEMBER'
      : 'SHARED_FOR_ORG';
    const planTokenLimit = typeof org.plan?.tokenLimit === 'number' ? org.plan.tokenLimit : null;
    const effectiveTokenBalance = effectiveTokenPoolStrategy === 'ALLOCATED_PER_MEMBER'
      ? org.memberships.reduce((sum, membership) => {
        const actualBalance = Math.max(0, Number(membership.sharedTokenBalance ?? 0));
        const usage = Math.max(0, Number(membership.memberTokenUsage ?? 0));
        return sum + (actualBalance > 0 || planTokenLimit == null ? actualBalance : Math.max(0, planTokenLimit - usage));
      }, 0)
      : Math.max(0, Number(org.tokenBalance ?? 0));

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      owner: org.owner ? { id: org.owner.id, name: org.owner.name, email: org.owner.email } : null,
      billingEmail: org.billingEmail,
      plan: org.plan ? { id: org.plan.id, name: org.plan.name } : null,
      tokenBalance: effectiveTokenBalance,
      memberTokenCap: org.memberTokenCap,
      memberCapStrategy: org.memberCapStrategy,
      memberCapResetIntervalHours: org.memberCapResetIntervalHours,
      tokenPoolStrategy: effectiveTokenPoolStrategy,
      seatLimit: org.seatLimit,
      activeMembers: org.memberships.length,
      pendingInvites: org.invites.filter((invite) => invite.status === 'PENDING').length,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  });

  const headerStats = [
    {
      label: 'Active members',
      value: formatNumber(activeMemberCount),
      helper: `${formatNumber(pendingInviteCount)} invites pending`,
      tone: 'blue' as const
    },
    {
      label: 'Tokens under management',
      value: formatNumber(totalTokenBalance),
      helper: 'Shared pool credits',
      tone: 'emerald' as const
    }
  ];

  const metricCards: AdminStatCardProps[] = [
    {
      label: 'Average members per org',
      value: formatNumber(avgMembers),
      helper: `${formatNumber(totalCount)} active orgs`,
      icon: faUsersGear,
      accent: 'theme'
    },
    {
      label: 'Seat-limited workspaces',
      value: formatNumber(seatLimitedCount),
      helper: `${formatNumber(totalCount)} total`,
      icon: faBuilding,
      accent: 'theme'
    },
    {
      label: 'Hard cap orgs',
      value: formatNumber(hardCapCount),
      helper: 'Using strict token ceilings',
      icon: faSitemap,
      accent: 'theme'
    },
    {
      label: 'Pending invites',
      value: formatNumber(pendingInviteCount),
      helper: 'Awaiting approval',
      icon: faEnvelopeOpenText,
      accent: 'theme'
    }
  ];

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="indigo"
        eyebrow="Workspaces"
        eyebrowIcon={<FontAwesomeIcon icon={faBuilding} />}
        title="Organization management"
        stats={headerStats}
      />

      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {metricCards.map((card) => (
          <AdminStatCard key={card.label} {...card} />
        ))}
      </section>

      <OrganizationsClient
        initialOrganizations={initialOrganizations}
        initialPageInfo={{
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        }}
      />
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}
