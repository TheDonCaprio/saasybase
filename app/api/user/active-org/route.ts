/**
 * Active Organization API Route (NextAuth)
 * ============================================
 * GET  — Returns the user's organizations + active org
 * POST — Sets the active organization (stores in cookie)
 *
 * Only meaningful for the NextAuth provider. Clerk manages active org
 * internally via its own session cookie.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authService } from '@/lib/auth-provider';
import { prisma } from '@/lib/prisma';

/** Cookie name used to track the active org for NextAuth users */
const ACTIVE_ORG_COOKIE = 'saasybase-active-org';

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

    const organizations = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
      isOwner: m.organization.ownerUserId === session.userId,
      planName: m.organization.plan?.name || null,
    }));

    // Read active org from cookie
    const jar = await cookies();
    const activeOrgId = jar.get(ACTIVE_ORG_COOKIE)?.value || null;

    // Validate it — if the user no longer belongs to that org, clear it
    const validActiveOrg = activeOrgId && organizations.some((o) => o.id === activeOrgId)
      ? activeOrgId
      : null;

    return NextResponse.json({ activeOrgId: validActiveOrg, organizations });
  } catch (err) {
    console.error('Active org fetch error:', err);
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

    // Switching to personal workspace
    if (!orgId) {
      const jar = await cookies();
      jar.set(ACTIVE_ORG_COOKIE, '', {
        path: '/',
        maxAge: 0,
        httpOnly: false, // Client JS needs to read this
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
      return NextResponse.json({ activeOrgId: null });
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

    const jar = await cookies();
    jar.set(ACTIVE_ORG_COOKIE, orgId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      httpOnly: false, // Client JS needs to read this
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return NextResponse.json({ activeOrgId: orgId });
  } catch (err) {
    console.error('Set active org error:', err);
    return NextResponse.json({ error: 'Failed to set active organization' }, { status: 500 });
  }
}
