import { NextRequest, NextResponse } from 'next/server';
import { toError, asRecord, getNestedString, getNestedNumber } from '../../../../lib/runtime-guards';
import { Logger } from '../../../../lib/logger';
import { authService } from '@/lib/auth-provider';
import { sendWelcomeIfNotSent } from '../../../../lib/welcome';
import { prisma } from '../../../../lib/prisma';
import {
  upsertOrganization,
  syncOrganizationMembership,
  removeOrganizationMembership,
  upsertOrganizationInvite,
  expireOrganizationInvite,
  markInviteAccepted,
  deleteOrganizationByClerkId,
} from '../../../../lib/teams';
import { ensureUserExists } from '../../../../lib/user-helpers';

export const runtime = 'nodejs';

function extractUserId(payload: unknown): string | null {
  const rec = asRecord(payload) ?? {};
  // Try common Clerk payload shapes
  const maybe = (
    getNestedString(rec, ['data', 'id']) ||
    getNestedString(rec, ['data', 'user', 'id']) ||
    getNestedString(rec, ['user', 'id']) ||
    getNestedString(rec, ['data', 'object', 'id']) ||
    null
  );
  // Clerk sends different object IDs (email address ids, organization ids). We
  // only consider it a user id if it looks like one (starts with 'user_'). This
  // avoids treating an email-address id (e.g. 'ema_...') as a user id and then
  // failing a lookup against Clerk.
  if (typeof maybe === 'string' && maybe.startsWith('user_')) return maybe;
  return null;
}

type OrganizationEventResponse = {
  handled: boolean;
  status?: number;
  body?: Record<string, unknown>;
};

async function maybeHandleOrganizationEvent(eventType: string | null, payload: Record<string, unknown>): Promise<OrganizationEventResponse> {
  const normalizedType = (eventType ?? '').toLowerCase();
  const dataRecord = asRecord(payload?.data) ?? {};
  const objectType = (getNestedString(payload, ['data', 'object']) || getNestedString(payload, ['object']) || '').toLowerCase();

  const respond = (body: Record<string, unknown>, status = 200): OrganizationEventResponse => ({
    handled: true,
    status,
    body,
  });

  const skip = (reason: string): OrganizationEventResponse => respond({ ok: true, skipped: true, reason });

  const hasOrgContext = objectType === 'organization' || normalizedType.startsWith('organization.');
  const hasMembershipContext = objectType === 'organization_membership' || normalizedType.includes('organizationmembership') || normalizedType.includes('organization_membership');
  const hasInviteContext = objectType === 'organization_invitation' || normalizedType.includes('organizationinvitation') || normalizedType.includes('organization_invitation');

  if (!hasOrgContext && !hasMembershipContext && !hasInviteContext) {
    return { handled: false };
  }

  try {
    if (hasOrgContext) {
      const clerkOrganizationId = getNestedString(dataRecord, ['id']) || getNestedString(payload, ['data', 'organization_id']) || null;
      if (!clerkOrganizationId) {
        Logger.warn('Clerk webhook: organization event missing id', { eventType });
        return skip('missing-organization-id');
      }

      if (normalizedType.endsWith('.deleted')) {
        const deleted = await deleteOrganizationByClerkId(clerkOrganizationId);
        Logger.info('Clerk webhook: organization deleted sync', { clerkOrganizationId, deleted });
        return respond({ ok: true, deleted });
      }

      const seatLimitNumber = getNestedNumber(dataRecord, ['max_allowed_memberships']) ?? getNestedNumber(dataRecord, ['public_metadata', 'seatLimit']);
      const snapshot = {
        clerkOrganizationId,
        name: getNestedString(dataRecord, ['name']) ?? undefined,
        slug: getNestedString(dataRecord, ['slug']) ?? undefined,
        ownerUserId: getNestedString(dataRecord, ['created_by']) ?? getNestedString(dataRecord, ['createdBy']) ?? undefined,
        billingEmail: getNestedString(dataRecord, ['public_metadata', 'billingEmail']) ?? getNestedString(dataRecord, ['billing_email']) ?? undefined,
        planId: getNestedString(dataRecord, ['public_metadata', 'planId']) ?? getNestedString(dataRecord, ['plan_id']) ?? undefined,
        seatLimit: typeof seatLimitNumber === 'number' ? seatLimitNumber : undefined,
        tokenPoolStrategy: getNestedString(dataRecord, ['public_metadata', 'tokenPoolStrategy']) ?? undefined,
      };

      const saved = await upsertOrganization(snapshot);
      if (!saved) {
        Logger.error('Clerk webhook: organization upsert failed', { clerkOrganizationId, eventType });
        return respond({ ok: false, error: 'organization-upsert-failed' }, 500);
      }

      Logger.info('Clerk webhook: organization synced', { clerkOrganizationId, eventType });
      return respond({ ok: true, organizationId: saved.id });
    }

    if (hasMembershipContext) {
      const userId = getNestedString(dataRecord, ['public_user_data', 'user_id']) || getNestedString(dataRecord, ['user_id']) || getNestedString(payload, ['data', 'user', 'id']) || null;
      const clerkOrganizationId = getNestedString(dataRecord, ['organization', 'id']) || getNestedString(dataRecord, ['organization_id']) || null;
      const organizationSlug = getNestedString(dataRecord, ['organization', 'slug']) || getNestedString(dataRecord, ['public_organization_data', 'slug']) || null;

      if (!userId || !clerkOrganizationId) {
        Logger.warn('Clerk webhook: membership event missing identifiers', { eventType, userId, clerkOrganizationId });
        return skip('membership-missing-identifiers');
      }

      if (normalizedType.endsWith('.deleted') || normalizedType.endsWith('.removed')) {
        await removeOrganizationMembership({ userId, clerkOrganizationId, organizationSlug });
        Logger.info('Clerk webhook: membership removed', { clerkOrganizationId, userId });
        return respond({ ok: true, removed: true });
      }

      const roleRaw = getNestedString(dataRecord, ['role']) || undefined;
      const statusRaw = getNestedString(dataRecord, ['status']) || undefined;
      await ensureUserExists({ userId });

      const membership = await syncOrganizationMembership({
        userId,
        clerkOrganizationId,
        organizationSlug,
        role: roleRaw ? roleRaw.toUpperCase() : undefined,
        status: statusRaw ? statusRaw.toUpperCase() : undefined,
      });

      if (!membership) {
        Logger.error('Clerk webhook: membership sync failed', { clerkOrganizationId, userId, eventType });
        return respond({ ok: false, error: 'membership-sync-failed' }, 500);
      }

      Logger.info('Clerk webhook: membership synced', { clerkOrganizationId, userId, role: membership.role, status: membership.status });
      return respond({ ok: true, membershipId: membership.id });
    }

    if (hasInviteContext) {
      const token = getNestedString(dataRecord, ['id']) || getNestedString(dataRecord, ['token']) || null;
      const clerkOrganizationId = getNestedString(dataRecord, ['organization_id']) || getNestedString(dataRecord, ['organization', 'id']) || null;
      const organizationSlug = getNestedString(dataRecord, ['public_organization_data', 'slug']) || getNestedString(dataRecord, ['organization', 'slug']) || null;

      if (!token || !clerkOrganizationId) {
        Logger.warn('Clerk webhook: invitation event missing identifiers', { eventType, token, clerkOrganizationId });
        return skip('invite-missing-identifiers');
      }

      if (normalizedType.endsWith('.accepted')) {
        await markInviteAccepted(token);
        Logger.info('Clerk webhook: invitation accepted', { token, clerkOrganizationId });
        return respond({ ok: true, accepted: true });
      }

      if (normalizedType.endsWith('.revoked') || normalizedType.endsWith('.deleted') || normalizedType.endsWith('.expired')) {
        await expireOrganizationInvite(token);
        Logger.info('Clerk webhook: invitation expired/revoked', { token, clerkOrganizationId, eventType });
        return respond({ ok: true, expired: true });
      }

      const email = getNestedString(dataRecord, ['email_address']) || getNestedString(dataRecord, ['email']) || null;
      if (!email) {
        Logger.warn('Clerk webhook: invitation event missing email', { token, clerkOrganizationId });
        return skip('invite-missing-email');
      }

      const expiresAt = getNestedNumber(dataRecord, ['expires_at']);
      const acceptedAt = getNestedNumber(dataRecord, ['accepted_at']);
      const invitedByUserId = getNestedString(dataRecord, ['public_inviter_data', 'user_id']) || getNestedString(dataRecord, ['created_by']) || null;
      const roleRaw = getNestedString(dataRecord, ['role']) || undefined;
      const statusRaw = getNestedString(dataRecord, ['status']) || undefined;

      const invite = await upsertOrganizationInvite({
        token,
        email,
        clerkOrganizationId,
        organizationSlug,
        role: roleRaw ? roleRaw.toUpperCase() : undefined,
        status: statusRaw ? statusRaw.toUpperCase() : undefined,
        invitedByUserId,
        expiresAt: expiresAt ?? undefined,
        acceptedAt: acceptedAt ?? undefined,
      });

      if (!invite) {
        Logger.error('Clerk webhook: invite upsert failed', { clerkOrganizationId, token, eventType });
        return respond({ ok: false, error: 'invite-upsert-failed' }, 500);
      }

      Logger.info('Clerk webhook: invite synced', { clerkOrganizationId, token, status: invite.status });
      return respond({ ok: true, inviteId: invite.id });
    }
  } catch (err) {
    const error = toError(err);
    Logger.error('Clerk webhook: organization dispatcher error', { error: error.message, eventType });
    return respond({ ok: false, error: error.message }, 500);
  }

  return { handled: false };
}

async function fetchClerkUserById(userId: string) {
  try {
    return await authService.getUser(userId);
  } catch (err) {
    const error = toError(err);
    Logger.warn('Clerk webhook: failed to fetch user from auth provider', { userId, error: error.message });
    return null;
  }
}


export async function POST(req: NextRequest) {
  const start = Date.now();
  try {
    const raw = await req.text();
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }

    // Verify Clerk webhook signature using Clerk's SDK (or Svix) if available.
    // Accept both Clerk-specific and Svix/webhook header names so we don't
    // falsely log "missing signature header" when Clerk delivers svix-signed events.
    const signatureHeader = req.headers.get('clerk-signature') || req.headers.get('Clerk-Signature') || req.headers.get('x-clerk-signature') || req.headers.get('svix-signature') || req.headers.get('Svix-Signature') || req.headers.get('webhook-signature') || req.headers.get('Webhook-Signature');
    const hasAnySignatureHeader = Boolean(
      req.headers.get('clerk-signature') ||
      req.headers.get('Clerk-Signature') ||
      req.headers.get('x-clerk-signature') ||
      req.headers.get('svix-signature') ||
      req.headers.get('Svix-Signature') ||
      req.headers.get('webhook-signature') ||
      req.headers.get('Webhook-Signature')
    );
    const clerkSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!clerkSecret) {
      Logger.warn('Clerk webhook: CLERK_WEBHOOK_SECRET not configured');
      return NextResponse.json({ ok: false, error: 'webhook-secret-not-configured' }, { status: 500 });
    }

    if (!hasAnySignatureHeader) {
      // In production we require a signature. In development it's common to test webhooks
      // without signing enabled (or when using tunnels that don't relay headers). Allow
      // processing in non-production with a warning, but reject in production.
      if (process.env.NODE_ENV === 'production') {
        Logger.warn('Clerk webhook: missing signature header');
        return NextResponse.json({ ok: false, error: 'missing-signature' }, { status: 400 });
      }
      Logger.warn('Clerk webhook: missing signature header - continuing in non-production (no verification)');
    }

    let verifiedSignature = false;
    try {
      // Prefer verifying with Svix (Clerk uses Svix for webhook delivery). Svix will
      // parse the payload and validate the signature/timestamp. If Svix verification
      // succeeds it returns the parsed payload; otherwise it throws.
      try {
        const { Webhook: SvixWebhook } = await import('svix');
        const wh = new SvixWebhook(clerkSecret as string);
        // Build a plain headers object for Svix (it lower-cases internally)
        const headersObj: Record<string, string> = {};
        req.headers.forEach((v, k) => {
          const val = Array.isArray(v) ? (v as string[]).join(',') : String(v);
          headersObj[k] = val;
        });
        try {
          // svix verifies and returns parsed JSON
          const parsed = wh.verify(raw, headersObj);
          verifiedSignature = true;
          payload = parsed as unknown;
        } catch (err: unknown) {
          // verification failed with Svix; log and fall through to any other check
          Logger.warn('Clerk webhook: svix verification failed', { error: toError(err).message });
        }
      } catch (e) {
        // Svix not available or import failed; attempt to use @clerk/nextjs/server helpers
        Logger.debug('Clerk webhook: svix import failed', { error: toError(e).message });
      }

      if (!verifiedSignature) {
        try {
          const sdkModule = await import('@clerk/nextjs/server');
          type ClerkSdkLike = {
            webhooks?: { verify?: (raw: string, header: string | null, secret: string | undefined) => Promise<unknown>; verifySignature?: (raw: string, header: string | null, secret: string | undefined) => Promise<unknown> };
            Webhook?: { verify?: (raw: string, header: string | null, secret: string | undefined) => Promise<unknown> };
            verifyWebhookSignature?: (raw: string, header: string | null, secret: string | undefined) => Promise<unknown>;
          };
          const sdk = sdkModule as unknown as ClerkSdkLike;
          if (sdk.webhooks && typeof sdk.webhooks.verify === 'function') {
            await sdk.webhooks.verify(raw, signatureHeader, clerkSecret);
            verifiedSignature = true;
          } else if (sdk.webhooks && typeof sdk.webhooks.verifySignature === 'function') {
            await sdk.webhooks.verifySignature(raw, signatureHeader, clerkSecret);
            verifiedSignature = true;
          } else if (sdk.Webhook && typeof sdk.Webhook.verify === 'function') {
            await sdk.Webhook.verify(raw, signatureHeader, clerkSecret);
            verifiedSignature = true;
          } else if (typeof sdk.verifyWebhookSignature === 'function') {
            await sdk.verifyWebhookSignature(raw, signatureHeader, clerkSecret);
            verifiedSignature = true;
          }
        } catch (err: unknown) {
          Logger.debug('Clerk webhook: clerk-sdk verification attempt failed', { error: toError(err).message });
        }
      }
    } catch (e) {
      Logger.warn('Clerk webhook: signature verification attempt failed', { error: toError(e).message });
    }

    // If a signature header was present but we failed to verify, reject. If no signature
    // header was present and we're in non-production, we continue (verifiedSignature may be false).
    if (hasAnySignatureHeader && !verifiedSignature) {
      Logger.warn('Clerk webhook: signature could not be verified - rejecting', { header: signatureHeader?.slice?.(0, 80) });
      return NextResponse.json({ ok: false, error: 'invalid-signature' }, { status: 400 });
    }

    const payloadRecord = asRecord(payload) ?? {};
    const eventType = getNestedString(payloadRecord, ['type']) || getNestedString(payloadRecord, ['event']) || null;
    const orgHandled = await maybeHandleOrganizationEvent(eventType, payloadRecord);
    if (orgHandled.handled) {
      return NextResponse.json(orgHandled.body ?? { ok: true }, { status: orgHandled.status ?? 200 });
    }

    const userId = extractUserId(payload);
    
    // Explicitly handle user.created to reliably initialize token balances
    if (userId && typeof eventType === 'string' && eventType.toLowerCase() === 'user.created') {
      const dataRecord = asRecord(payloadRecord.data);
      const emailAddresses = Array.isArray(dataRecord?.email_addresses) ? dataRecord.email_addresses : [];
      const email = asRecord(emailAddresses[0])?.email_address;
      
      try {
        await ensureUserExists({ userId, emailOverride: typeof email === 'string' ? email : undefined });
        Logger.info('Clerk webhook: guaranteed user.created token allocation', { userId });
      } catch (err) {
        Logger.error('Clerk webhook: failed to allocate initial tokens on user.created', { userId, error: toError(err).message });
      }
    }
    if (!userId) {
      // Try to find an email in the payload and map to our user. Clerk webhook payloads
      // can vary by event type - try several likely locations.
      const rec = payloadRecord;
      const possibleEmail =
        getNestedString(rec, ['data', 'email']) ||
        getNestedString(rec, ['data', 'attributes', 'email']) ||
        getNestedString(rec, ['data', 'attributes', 'email_address', 'emailAddress']) ||
        getNestedString(rec, ['data', 'attributes', 'email_addresses', '0', 'emailAddress']) ||
        getNestedString(rec, ['data', 'attributes', 'primary_email_address', 'emailAddress']) ||
        getNestedString(rec, ['data', 'object', 'email']) ||
        getNestedString(rec, ['email']) ||
        getNestedString(rec, ['data', 'attributes', 'emailAddress']) ||
        null;

      if (!possibleEmail) {
        // If the payload contains an email object id (ema_...)
        // or other non-user object, it's not actionable here. Log a compact
        // summary to help debugging and return 200 to avoid retries for
        // unsupported events.
        const eventType = getNestedString(rec, ['type']) || getNestedString(rec, ['event']) || getNestedString(rec, ['data', 'type']) || 'unknown';
        Logger.info('Clerk webhook: unsupported event or missing email/user in payload - skipping', { eventType });
        return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
      }

      // Map email -> userId via our DB
      const dbUser = await prisma.user.findFirst({ where: { email: possibleEmail }, select: { id: true, name: true } });
      if (!dbUser) {
        Logger.warn('Clerk webhook: email not found in local DB', { email: possibleEmail });
        return NextResponse.json({ ok: false }, { status: 404 });
      }
      // Use db user id
      const res = await sendWelcomeIfNotSent(dbUser.id, possibleEmail, { firstName: dbUser.name ?? undefined });
      return NextResponse.json(res, { status: res.ok ? 200 : 500 });
    }

    // Fetch user from auth provider to get primary email and verification status
    const authUserRecord = await fetchClerkUserById(userId as string);

    const email = authUserRecord?.email ?? null;
    const verified = authUserRecord?.emailVerified ?? false;

    if (!email || !verified) {
      Logger.info('Clerk webhook: user email missing or not verified, skipping welcome', { userId, email, verified });
      return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
    }

    const userName = authUserRecord?.firstName ?? authUserRecord?.fullName ?? null;
    const result = await sendWelcomeIfNotSent(userId as string, email as string, { firstName: userName ?? undefined });
    const duration = Date.now() - start;
    Logger.info('Clerk webhook processed', { userId, duration, result });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err: unknown) {
    const e = toError(err);
    Logger.error('Clerk webhook error', { error: e.message });
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
