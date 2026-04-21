import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../../../lib/prisma';
import { expireOrganizationInvite } from '../../../../../lib/teams';
import { Logger } from '../../../../../lib/logger';
import { toError } from '../../../../../lib/runtime-guards';

function getProviderOrganizationId(value: { id?: string | null; providerOrganizationId?: string | null }) {
  return value.providerOrganizationId ?? value.id ?? null;
}

export async function POST(request: NextRequest) {
  // Require authentication so only the invite recipient can decline
  const { userId } = await authService.getSession();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized. Please sign in to decline this invitation.' }, { status: 401 });
  }

  let token: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    const candidate = (body as Record<string, unknown>).token ?? (body as Record<string, unknown>).invitationId ?? (body as Record<string, unknown>).tokenId;
    if (typeof candidate === 'string' && candidate.trim().length > 0) token = candidate.trim();
  } catch (err) {
    Logger.warn('invite decline: failed to parse request body', { error: String(err) });
  }

  // allow GET-like declines via query param as well
  if (!token) {
    try {
      const url = new URL(request.url);
      const q = url.searchParams.get('token') ?? url.searchParams.get('invitationId') ?? url.searchParams.get('id');
      if (q && typeof q === 'string') token = q;
    } catch { }
  }

  if (!token) return NextResponse.json({ ok: false, error: 'Invitation token required.' }, { status: 400 });

  try {
    const invite = await prisma.organizationInvite.findUnique({ where: { token } });
    if (!invite) return NextResponse.json({ ok: false, error: 'Invitation not found.' }, { status: 404 });

    // Attempt provider-side invitation revocation if the active provider supports it.
    // The `OrganizationInvite` stores `organizationId` (local) — load the
    // organization and read its provider organization ID before calling the auth provider.
    try {
      if (invite.organizationId) {
        const org = await prisma.organization.findUnique({
          where: { id: invite.organizationId },
          select: { id: true, providerOrganizationId: true, ownerUserId: true },
        });
        // Use the organization's owner user id when available because the auth provider
        // requires `requestingUserId` for invitation revocation.
        const providerOrganizationId = org
          ? getProviderOrganizationId({ id: org.id, providerOrganizationId: org.providerOrganizationId })
          : null;
        if (providerOrganizationId && org?.ownerUserId && authService.supportsFeature('organization_invites')) {
          try {
            await authService.revokeOrganizationInvitation({
              organizationId: providerOrganizationId,
              invitationId: token,
              requestingUserId: org.ownerUserId,
            });
          } catch (innerErr: unknown) {
            Logger.info('invite decline: provider revoke failed (continuing)', { token, error: toError(innerErr).message });
          }
        }
      }
    } catch (err: unknown) {
      // log but continue — revocation is best-effort here
      Logger.info('invite decline: provider revoke failed (continuing)', { token, error: toError(err).message });
    }

    await expireOrganizationInvite(token);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const error = toError(err);
    Logger.error('invite decline failed', { error: error.message, token });
    return NextResponse.json({ ok: false, error: error.message || 'Unable to decline invite' }, { status: 400 });
  }
}
