import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { prisma } from '../../../../lib/prisma';
import { upsertOrganizationInvite } from '../../../../lib/teams';
import { fetchTeamDashboardState } from '../../../../lib/team-dashboard';
import { Logger } from '../../../../lib/logger';
import { toError } from '../../../../lib/runtime-guards';
import { sendEmail, getSiteName, getSupportEmail } from '../../../../lib/email';
import { getEnv } from '../../../../lib/env';
import { ensureTeamOrganization } from '../../../../lib/organization-access';
import { type ClerkMembershipRole } from '../../../../lib/clerk-memberships';

// Clerk client types not required in this module

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

export async function POST(request: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const clerk = await clerkClient();

  let email: string | null = null;
  let role: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    email = normalizeEmail((body as Record<string, unknown>).email);
    const rawRole = (body as Record<string, unknown>).role;
    if (typeof rawRole === 'string' && rawRole.trim().length > 0) {
      role = rawRole.trim().toLowerCase();
    }
  } catch (err) {
    Logger.warn('team invite parse error', { error: String(err) });
  }

  if (!email) {
    return NextResponse.json({ ok: false, error: 'A valid email address is required.' }, { status: 400 });
  }

  let organization = null;
  if (orgId) {
    organization = await prisma.organization.findFirst({
      where: {
        ownerUserId: userId,
        clerkOrganizationId: orgId,
      },
    });
    if (!organization) {
      return NextResponse.json({ ok: false, error: 'Active workspace is not owned by you or not provisioned yet.' }, { status: 403 });
    }
  } else {
    try {
      organization = await ensureTeamOrganization(userId);
    } catch (err: unknown) {
      const error = toError(err);
      Logger.warn('team invite ensure organization failed', { userId, error: error.message });
      return NextResponse.json({ ok: false, error: error.message || 'Provision a team workspace before inviting members.' }, { status: 400 });
    }
  }

  const inviter = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });

  if (!organization || !organization.clerkOrganizationId) {
    return NextResponse.json({ ok: false, error: 'Provision a team workspace before inviting members.' }, { status: 400 });
  }

  try {
    const resolvedRole: ClerkMembershipRole = role && role.toLowerCase().includes('admin') ? 'org:admin' : 'org:member';

    // If the recipient already has a Clerk account we DO NOT auto-add them.
    // Instead, send the same site-hosted invitation so they can accept or
    // decline from our UI. This avoids surprising automatic membership
    // assignments and gives members explicit control.
    const existingClerkUserId = await findClerkUserId(clerk, email);
    if (existingClerkUserId) {
      Logger.info('team invite: recipient has Clerk account; sending site-hosted invite instead of auto-adding', { email, clerkUserId: existingClerkUserId });
    }

    // If the recipient already has a Clerk user account we add them immediately.
    // Otherwise create a local invite record and send our own email. This avoids
    // Clerk sending its hosted invitation email which redirects users to the
    // Clerk site; we want acceptance to happen on-site instead (see custom
    // flows guide).
    const savedInvite = await upsertOrganizationInvite({
      email,
      organizationId: organization.id,
      clerkOrganizationId: organization.clerkOrganizationId,
      role: String(resolvedRole).toLowerCase().includes('admin') ? 'ADMIN' : 'MEMBER',
      status: 'PENDING',
      invitedByUserId: userId,
      organizationSlug: organization.slug,
    });

    await notifyPendingInviteEmail({
      email,
      organizationName: organization.name,
      inviterName: inviter?.name ?? null,
      token: savedInvite?.token ?? '',
    });

    // If the recipient already has a local user record, create an on-site
    // notification so they see the pending invite under /dashboard/notifications
    try {
      const recipient = await prisma.user.findUnique({ where: { email } });
      if (recipient) {
        const baseUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
        const token = savedInvite?.token ?? '';
        const acceptUrl = `${baseUrl}/invite/${encodeURIComponent(token)}`;

        await prisma.notification.create({
          data: {
            userId: recipient.id,
            title: `Invitation to join ${organization.name}`,
            message: `${inviter?.name ?? 'A teammate'} invited you to join ${organization.name}. Open your team dashboard to accept or decline.`,
            type: 'TEAM_INVITE',
            url: acceptUrl,
            read: false,
          },
        });
      }
    } catch (err: unknown) {
      Logger.warn('team invite: failed to create on-site notification', { email, error: toError(err).message });
    }

    const state = await fetchTeamDashboardState(userId, {
      forceSync: true,
      activeClerkOrgId: orgId ?? null,
    });
    return NextResponse.json({ ok: true, ...state });
  } catch (err: unknown) {
    const error = toError(err);
    let raw = null;
    try {
      raw = JSON.parse(JSON.stringify(err));
    } catch {
      raw = String(err);
    }
    Logger.warn('team invite failed', { userId, error: error.message, rawError: raw });
    return NextResponse.json({ ok: false, error: error.message || 'Unable to send invite' }, { status: 400 });
  }
}

async function findClerkUserId(client: Awaited<ReturnType<typeof clerkClient>>, email: string): Promise<string | null> {
  try {
    const result = await client.users.getUserList({ emailAddress: [email], limit: 1 });
    return result?.data?.[0]?.id ?? null;
  } catch (err: unknown) {
    Logger.warn('team invite: failed to look up Clerk user by email', { email, error: toError(err).message });
    return null;
  }
}

// ensureLocalUser is intentionally omitted: invites will be site-hosted and
// the accept flow will ensure users exist when they accept.


async function notifyPendingInviteEmail(params: { email: string; organizationName: string; inviterName: string | null; token: string }) {
  try {
    const [siteName, supportEmail] = await Promise.all([getSiteName(), getSupportEmail()]);
    const siteLabel = siteName || process.env.NEXT_PUBLIC_SITE_NAME || 'YourApp';
    // const supportContact = supportEmail || 'support@example.com'; // Unused
    const baseUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
    const acceptUrl = `${baseUrl}/invite/${encodeURIComponent(params.token)}`;
    const declineUrl = `${baseUrl}/invite/${encodeURIComponent(params.token)}?action=decline`;
    const joinUrl = `${baseUrl}/sign-up?redirect_url=${encodeURIComponent(`/invite/${encodeURIComponent(params.token)}`)}`;
    const signInUrl = `${baseUrl}/sign-in?redirect_url=${encodeURIComponent(`/invite/${encodeURIComponent(params.token)}`)}`;
    const inviterDisplay = params.inviterName && params.inviterName.trim().length > 0 ? params.inviterName : 'A teammate';

    // Prefer using a rendered template (seeded via `team_invitation`) so
    // site maintainers can tweak the copy in the DB. Fall back to the local
    // content via `sendEmail` if the template is not present or fails.
    const templateVars = {
      inviterName: inviterDisplay,
      organizationName: params.organizationName,
      acceptUrl,
      declineUrl,
      signInUrl,
      joinUrl,
    };

    const result = await sendEmail({
      to: params.email,
      templateKey: 'team_invitation',
      variables: templateVars,
      // Provide a fallback subject/text for transports that need it.
      subject: `${siteLabel}: ${inviterDisplay} invited you to ${params.organizationName}`,
      text: `Hi there, ${inviterDisplay} invited you to join ${params.organizationName} on ${siteLabel}. Accept: ${acceptUrl}`,
      replyTo: supportEmail || undefined,
      // Persist which template key was used so EmailLog reflects it
    });

    if (!result.success) {
      Logger.warn('team invite: failed to send notification email', { email: params.email, error: result.error });
    }
  } catch (err: unknown) {
    Logger.warn('team invite: notify email threw', { email: params.email, error: toError(err).message });
  }
}
