import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../../../lib/prisma';
import { expireOrganizationInvite } from '../../../../../lib/teams';
import { Logger } from '../../../../../lib/logger';
import { toError } from '../../../../../lib/runtime-guards';

export async function POST(request: NextRequest) {
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

    // attempt to revoke at Clerk if we can resolve a `clerkOrganizationId`.
    // The `OrganizationInvite` stores `organizationId` (local) — load the
    // organization and read its `clerkOrganizationId` before calling Clerk.
    try {
      if (invite.organizationId) {
        const org = await prisma.organization.findUnique({
          where: { id: invite.organizationId },
          select: { clerkOrganizationId: true, ownerUserId: true },
        });
        // Clerk requires `requestingUserId` when revoking invitations. Use the
        // organization's owner user id (local Clerk user id) when available.
        if (org?.clerkOrganizationId && org.ownerUserId) {
          // Use authService for org invitation revocation (Clerk-specific, best-effort)
          try {
            // For now, org invitation revocation is Clerk-specific.
            // The authService doesn't have a revokeOrganizationInvitation method yet,
            // so we use the provider instance escape hatch.
            const { ClerkAuthProvider } = await import('@/lib/auth-provider/providers/clerk');
            const provider = authService.getProviderInstance();
            if (provider instanceof ClerkAuthProvider) {
              // Access clerkClient through the provider for this Clerk-specific operation
              const clerkMod = await import('@clerk/nextjs/server');
              const client = await clerkMod.clerkClient();
              await client.organizations.revokeOrganizationInvitation({
                organizationId: org.clerkOrganizationId,
                invitationId: token,
                requestingUserId: org.ownerUserId,
              });
            }
          } catch (innerErr: unknown) {
            Logger.info('invite decline: Clerk revoke failed (continuing)', { token, error: toError(innerErr).message });
          }
        }
      }
    } catch (err: unknown) {
      // log but continue — revocation is best-effort here
      Logger.info('invite decline: Clerk revoke failed (continuing)', { token, error: toError(err).message });
    }

    await expireOrganizationInvite(token);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const error = toError(err);
    Logger.error('invite decline failed', { error: error.message, token });
    return NextResponse.json({ ok: false, error: error.message || 'Unable to decline invite' }, { status: 400 });
  }
}
