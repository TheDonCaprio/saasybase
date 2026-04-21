/**
 * Active Organization API Route (NextAuth)
 * ============================================
 * GET  — Returns the user's organizations + active org
 * POST — Sets the active organization (stores in an httpOnly cookie)
 *
 * Only meaningful for the NextAuth provider. Clerk manages active org
 * internally via its own session cookie.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { betterAuthServer } from '@/lib/better-auth';
import { authService } from '@/lib/auth-provider';
import { prisma } from '@/lib/prisma';
import { ACTIVE_ORG_COOKIE, getActiveOrgCookieOptions } from '@/lib/active-organization';
import { getActiveTeamSubscription } from '@/lib/organization-access';
import { Logger } from '@/lib/logger';

function isBetterAuthProviderEnabled() {
  return (process.env.AUTH_PROVIDER || '').toLowerCase() === 'betterauth';
}

export async function GET() {
  try {
    const session = await authService.getSession();
    if (!session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all organizations the user belongs to
    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: session.userId, status: 'ACTIVE' },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            ownerUserId: true,
            plan: { select: { name: true } },
          },
        },
      },
    });

    const effectivePlans = new Map(
      await Promise.all(
        memberships.map(async (membership) => {
          const activeTeamSubscription = await getActiveTeamSubscription(membership.organization.ownerUserId, {
            includeGrace: true,
          });
          return [membership.organization.id, activeTeamSubscription?.plan ?? null] as const;
        }),
      ),
    );

    const organizations = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
      isOwner: m.organization.ownerUserId === session.userId,
      planName: effectivePlans.get(m.organization.id)?.name || m.organization.plan?.name || null,
    }));

    // Read active org from cookie
    const jar = await cookies();
    const cookieActiveOrgId = jar.get(ACTIVE_ORG_COOKIE)?.value || null;
    const activeOrgId = session.orgId || cookieActiveOrgId;

    // Validate it — if the user no longer belongs to that org, clear it
    const validActiveOrg = activeOrgId && organizations.some((o) => o.id === activeOrgId)
      ? activeOrgId
      : null;

    if (activeOrgId && !validActiveOrg) {
      const response = NextResponse.json({ activeOrgId: null, organizations });
      response.cookies.set(ACTIVE_ORG_COOKIE, '', getActiveOrgCookieOptions({ maxAge: 0 }));
      return response;
    }

    return NextResponse.json({ activeOrgId: validActiveOrg, organizations });
  } catch (err) {
    Logger.error('Active org fetch error', err);
    return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authService.getSession();
    if (!session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = (await request.json()) as { orgId: string | null };

    if (isBetterAuthProviderEnabled()) {
      const response = NextResponse.json({ activeOrgId: orgId });

      try {
        const result = await betterAuthServer.api.setActiveOrganization({
          headers: request.headers,
          body: {
            organizationId: orgId,
          },
        });

        const nextActiveOrgId = result?.id ?? orgId;

        if (nextActiveOrgId) {
          response.cookies.set(
            ACTIVE_ORG_COOKIE,
            nextActiveOrgId,
            getActiveOrgCookieOptions({ maxAge: 60 * 60 * 24 * 365 }),
          );
        } else {
          response.cookies.set(ACTIVE_ORG_COOKIE, '', getActiveOrgCookieOptions({ maxAge: 0 }));
        }

        return NextResponse.json({ activeOrgId: nextActiveOrgId }, { headers: response.headers });
      } catch (error) {
        Logger.error('Set Better Auth active org error', error);
        return NextResponse.json({ error: 'Failed to set active organization' }, { status: 500 });
      }
    }

    // Switching to personal workspace
    if (!orgId) {
      const response = NextResponse.json({ activeOrgId: null });
      response.cookies.set(ACTIVE_ORG_COOKIE, '', getActiveOrgCookieOptions({ maxAge: 0 }));
      return response;
    }

    // Verify the user is actually a member of this org
    const membership = await prisma.organizationMembership.findFirst({
      where: {
        organizationId: orgId,
        userId: session.userId,
        status: 'ACTIVE',
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'You are not a member of this organization' }, { status: 403 });
    }

    const response = NextResponse.json({ activeOrgId: orgId });
    response.cookies.set(ACTIVE_ORG_COOKIE, orgId, getActiveOrgCookieOptions({ maxAge: 60 * 60 * 24 * 365 }));
    return response;
  } catch (err) {
    Logger.error('Set active org error', err);
    return NextResponse.json({ error: 'Failed to set active organization' }, { status: 500 });
  }
}
