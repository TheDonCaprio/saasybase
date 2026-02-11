import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { Logger } from '../../../../lib/logger';
import { toError } from '../../../../lib/runtime-guards';
import { sendWelcomeIfNotSent } from '../../../../lib/welcome';

export const dynamic = 'force-dynamic';

type ClerkUser = Awaited<ReturnType<Awaited<ReturnType<typeof clerkClient>>['users']['getUser']>>;

type MaybeLegacyEmail = {
  id?: string;
  email?: string;
  email_address?: string;
  verification?: { status?: string } | null;
  verified?: boolean;
  primary?: boolean;
};

function pickPrimaryEmail(user: ClerkUser): { email?: string; verified: boolean } {
  const legacySource = (user as unknown as { email_addresses?: MaybeLegacyEmail[] }).email_addresses;
  const legacyAddresses = Array.isArray(legacySource) ? legacySource : [];
  const modernAddresses = Array.isArray(user.emailAddresses) ? user.emailAddresses : [];
  const combined: Array<MaybeLegacyEmail | ClerkUser['emailAddresses'][number]> = [
    ...modernAddresses,
    ...legacyAddresses
  ];

  const primaryId = user.primaryEmailAddressId ?? (user as unknown as { primary_email_address_id?: string }).primary_email_address_id;

  const chosen = (() => {
    if (user.primaryEmailAddress) return user.primaryEmailAddress;
    if (primaryId) {
      const match = combined.find((addr) => addr && (addr as { id?: string }).id === primaryId);
      if (match) return match;
    }
    const flagged = combined.find((addr) => Boolean((addr as MaybeLegacyEmail).primary));
    if (flagged) return flagged;
    return combined.length ? combined[0] : null;
  })();

  const rawEmail = (() => {
    if (!chosen) {
      return (
        user.primaryEmailAddress?.emailAddress ??
        (user as unknown as { email?: string }).email ??
        undefined
      );
    }

    if (typeof (chosen as { emailAddress?: string }).emailAddress === 'string') {
      return (chosen as { emailAddress?: string }).emailAddress;
    }
    if (typeof (chosen as MaybeLegacyEmail).email === 'string') {
      return (chosen as MaybeLegacyEmail).email;
    }
    if (typeof (chosen as MaybeLegacyEmail).email_address === 'string') {
      return (chosen as MaybeLegacyEmail).email_address;
    }

    return undefined;
  })();

  const status =
    (chosen as { verification?: { status?: string } } | null | undefined)?.verification?.status ??
    user.primaryEmailAddress?.verification?.status ??
    undefined;

  const legacyVerified = Boolean(
    (chosen as MaybeLegacyEmail | null | undefined)?.verified ||
    (user as unknown as { primary_email_verified?: boolean }).primary_email_verified
  );

  const verified = status === 'verified' || status === 'passed' || legacyVerified;

  return { email: rawEmail, verified };
}

export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    let user: ClerkUser;
    try {
      const client = await clerkClient();
      user = await client.users.getUser(userId);
    } catch (err: unknown) {
      Logger.warn('Failed to fetch Clerk user in welcome endpoint', { error: toError(err).message });
      return NextResponse.json({ ok: false, error: 'failed-to-fetch-user' }, { status: 500 });
    }

    const { email, verified } = pickPrimaryEmail(user);

    if (!email) {
      Logger.warn('Welcome endpoint: no email found on user', { userId });
      return NextResponse.json({ ok: false, error: 'no-email' }, { status: 400 });
    }

    if (!verified) {
      Logger.info('Welcome endpoint: user email not verified yet, skipping', { userId, email });
      return NextResponse.json({ ok: false, error: 'email-not-verified' }, { status: 400 });
    }

    try {
      const sendRes = await sendWelcomeIfNotSent(userId, email);
      if (!sendRes.ok) {
        return NextResponse.json({ ok: false, error: sendRes.error }, { status: 500 });
      }
      return NextResponse.json(sendRes, { status: 200 });
    } catch (err: unknown) {
      const error = toError(err);
      Logger.error('Welcome endpoint: unexpected error', { error: error.message, stack: error.stack });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  } catch (err: unknown) {
    const error = toError(err);
    Logger.error('Welcome endpoint: auth guard or other error', { error: error.message });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
