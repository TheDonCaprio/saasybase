import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '../../../../../lib/prisma';
import { sendEmail, getSiteName, getSupportEmail } from '../../../../../lib/email';
import { getEnv } from '../../../../../lib/env';
import { toError } from '../../../../../lib/runtime-guards';
import { fetchTeamDashboardState } from '../../../../../lib/team-dashboard';
import { Logger } from '../../../../../lib/logger';

export async function POST(request: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let token: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    const candidate = (body as Record<string, unknown>).token ?? (body as Record<string, unknown>).invitationId;
    if (typeof candidate === 'string') token = candidate;
  } catch (err) {
    Logger.warn('team invite resend parse error', { error: String(err) });
  }

  if (!token) return NextResponse.json({ ok: false, error: 'Invitation token is required.' }, { status: 400 });

  // Find invite and owning organization
  const invite = await prisma.organizationInvite.findUnique({ where: { token } });
  if (!invite) return NextResponse.json({ ok: false, error: 'Invitation not found.' }, { status: 404 });

  const organization = await prisma.organization.findUnique({ where: { id: invite.organizationId }, select: { id: true, ownerUserId: true, name: true, slug: true, clerkOrganizationId: true } });
  if (!organization || organization.ownerUserId !== userId || (orgId && organization.clerkOrganizationId !== orgId)) {
    return NextResponse.json({ ok: false, error: 'Not authorized to resend this invite.' }, { status: 403 });
  }

  try {
    const inviter = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const [siteName, supportEmail] = await Promise.all([getSiteName(), getSupportEmail()]);
    const siteLabel = siteName || process.env.NEXT_PUBLIC_SITE_NAME || 'YourApp';
    const baseUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
    const acceptUrl = `${baseUrl}/invite/${encodeURIComponent(invite.token)}`;
    const declineUrl = `${baseUrl}/invite/${encodeURIComponent(invite.token)}?action=decline`;
    const joinUrl = `${baseUrl}/sign-up?redirect_url=${encodeURIComponent(`/invite/${encodeURIComponent(invite.token)}`)}`;
    const signInUrl = `${baseUrl}/sign-in?redirect_url=${encodeURIComponent(`/invite/${encodeURIComponent(invite.token)}`)}`;
    const inviterDisplay = inviter?.name && inviter.name.trim().length > 0 ? inviter.name : 'A teammate';

    const templateVars = {
      inviterName: inviterDisplay,
      organizationName: organization.name,
      acceptUrl,
      declineUrl,
      signInUrl,
      joinUrl,
    };

    const result = await sendEmail({
      to: invite.email,
      templateKey: 'team_invitation',
      variables: templateVars,
      subject: `${siteLabel}: ${inviterDisplay} invited you to ${organization.name}`,
      text: `Hi there, ${inviterDisplay} invited you to join ${organization.name} on ${siteLabel}. Accept: ${acceptUrl}`,
      replyTo: supportEmail || undefined,
    });

    if (!result.success) {
      Logger.warn('team invite resend: failed to send', { email: invite.email, error: result.error });
      return NextResponse.json({ ok: false, error: result.error || 'Failed to resend invite' }, { status: 500 });
    }

    const state = await fetchTeamDashboardState(userId, {
      forceSync: true,
      activeClerkOrgId: orgId ?? null,
    });
    return NextResponse.json({ ok: true, ...state });
  } catch (err: unknown) {
    const e = toError(err);
    Logger.warn('team invite resend failed', { error: e.message, token });
    return NextResponse.json({ ok: false, error: e.message || 'Unable to resend invite' }, { status: 400 });
  }
}
