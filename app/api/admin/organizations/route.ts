import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdminSectionAccess } from '../../../../lib/route-guards';
import { adminRateLimit } from '../../../../lib/rateLimit';
import { Logger } from '../../../../lib/logger';
import { buildStringContainsFilter, sanitizeWhereForInsensitiveSearch } from '../../../../lib/queryUtils';
import { Prisma } from '@/lib/prisma-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { userId: actorId } = await requireAdminSectionAccess('organizations');
    const rate = await adminRateLimit(actorId, request, 'admin-orgs:list', { limit: 240, windowMs: 120_000 });
    if (!rate.success && !rate.allowed) {
      Logger.error('Admin org list rate limiter unavailable', { actorId, error: rate.error });
      return NextResponse.json({ error: 'Service temporarily unavailable.' }, { status: 503 });
    }
    if (!rate.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rate.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    const url = new URL(request.url);
    const pageParam = Number(url.searchParams.get('page') ?? 1);
    const limitParam = Number(url.searchParams.get('limit') ?? 25);
    const search = url.searchParams.get('search')?.trim() ?? '';
    const statusFilter = url.searchParams.get('status')?.toUpperCase()?.trim() ?? '';
    const suspensionFilter = url.searchParams.get('suspension')?.toUpperCase()?.trim() ?? '';
    const rawSortBy = url.searchParams.get('sortBy')?.toLowerCase() ?? 'createdat';
    const rawSortOrder = url.searchParams.get('sortOrder')?.toLowerCase() ?? 'desc';

    const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const takeRaw = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : 25;
    const take = Math.min(Math.max(takeRaw, 1), 100);
    const skip = (page - 1) * take;

    const orderDirection: Prisma.SortOrder = rawSortOrder === 'asc' ? 'asc' : 'desc';
    const sortBy = rawSortBy;

    let orderBy: Prisma.OrganizationOrderByWithRelationInput;
    switch (sortBy) {
      case 'name':
        orderBy = { name: orderDirection };
        break;
      case 'members':
        orderBy = { memberships: { _count: orderDirection } };
        break;
      case 'tokenbalance':
        orderBy = { tokenBalance: orderDirection };
        break;
      case 'pendinginvites':
        orderBy = { invites: { _count: orderDirection } };
        break;
      default:
        orderBy = { createdAt: orderDirection };
        break;
    }

    const where: Prisma.OrganizationWhereInput = {
      memberships: {
        some: { status: 'ACTIVE' }
      }
    };

    const andFilters: Prisma.OrganizationWhereInput[] = [];

    if (search) {
      const filter = buildStringContainsFilter(search, process.env.DATABASE_URL);
      andFilters.push({
        OR: [
          { name: filter },
          { slug: filter },
          { billingEmail: filter },
          { owner: { name: filter } },
          { owner: { email: filter } }
        ]
      });
    }

    if (statusFilter && statusFilter !== 'ALL') {
      switch (statusFilter) {
        case 'SEAT_LIMITED':
          andFilters.push({ seatLimit: { not: null } });
          break;
        case 'UNLIMITED_SEATS':
          andFilters.push({ seatLimit: null });
          break;
        case 'HARD_CAP':
          andFilters.push({ memberCapStrategy: 'HARD' });
          break;
        case 'SOFT_CAP':
          andFilters.push({ memberCapStrategy: 'SOFT' });
          break;
        case 'NO_CAP':
          andFilters.push({ OR: [ { memberCapStrategy: 'DISABLED' }, { memberTokenCap: { equals: null } } ] });
          break;
        default:
          break;
      }
    }

    if (suspensionFilter && suspensionFilter !== 'ALL') {
      if (suspensionFilter === 'SUSPENDED') {
        andFilters.push({ suspendedAt: { not: null } });
      } else if (suspensionFilter === 'ACTIVE') {
        andFilters.push({ suspendedAt: null });
      }
    }

    if (andFilters.length) {
      where.AND = andFilters;
    }

    const sanitizedWhere = sanitizeWhereForInsensitiveSearch(where, process.env.DATABASE_URL);
    const orderByClause: Prisma.OrganizationOrderByWithRelationInput[] = [orderBy];
    if (orderByClause[0] && !('createdAt' in orderByClause[0]) && sortBy !== 'createdat') {
      orderByClause.push({ createdAt: 'desc' });
    }

    const [organizations, totalCount] = await Promise.all([
      prisma.organization.findMany({
        where: sanitizedWhere,
        orderBy: orderByClause,
        skip,
        take,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          plan: { select: { id: true, name: true, tokenLimit: true, organizationTokenPoolStrategy: true } },
          memberships: {
            select: { status: true, sharedTokenBalance: true, memberTokenUsage: true },
            take: 200
          },
          invites: {
            select: { status: true },
            take: 50
          }
        }
      }),
      prisma.organization.count({ where: sanitizedWhere })
    ]);

    const payload = organizations.map((org) => {
      const effectiveBillingEmail = org.billingEmail ?? org.owner?.email ?? null;
      const activeMembers = org.memberships.filter((m) => m.status === 'ACTIVE').length;
      const pendingInvites = org.invites.filter((invite) => invite.status === 'PENDING').length;
      const effectiveTokenPoolStrategy = org.plan?.organizationTokenPoolStrategy === 'ALLOCATED_PER_MEMBER'
        || org.tokenPoolStrategy === 'ALLOCATED_PER_MEMBER'
        ? 'ALLOCATED_PER_MEMBER'
        : 'SHARED_FOR_ORG';
      const planTokenLimit = typeof org.plan?.tokenLimit === 'number' ? org.plan.tokenLimit : null;
      const effectiveTokenBalance = effectiveTokenPoolStrategy === 'ALLOCATED_PER_MEMBER'
        ? org.memberships
          .filter((membership) => membership.status === 'ACTIVE')
          .reduce((sum, membership) => {
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
        billingEmail: effectiveBillingEmail,
        hasCustomBillingEmail: Boolean(org.billingEmail),
        suspendedAt: org.suspendedAt,
        suspensionReason: org.suspensionReason,
        plan: org.plan ? { id: org.plan.id, name: org.plan.name } : null,
        tokenBalance: effectiveTokenBalance,
        memberTokenCap: org.memberTokenCap,
        memberCapStrategy: org.memberCapStrategy,
        memberCapResetIntervalHours: org.memberCapResetIntervalHours,
        tokenPoolStrategy: effectiveTokenPoolStrategy,
        seatLimit: org.seatLimit,
        activeMembers,
        pendingInvites,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt
      };
    });

    const totalPages = Math.max(1, Math.ceil(totalCount / take));

    return NextResponse.json({
      data: payload,
      totalCount,
      totalPages,
      page,
      limit: take,
      pageInfo: {
        page,
        limit: take,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (error) {
    Logger.error('Failed to load admin organizations', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to load organizations' }, { status: 500 });
  }
}
