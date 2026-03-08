import { NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import type { AuthUser } from '@/lib/auth-provider';
import { Logger } from '../../../../lib/logger';
import { toError } from '../../../../lib/runtime-guards';
import { sendWelcomeIfNotSent } from '../../../../lib/welcome';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const { userId } = await authService.getSession();

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    let user: AuthUser | null;
    try {
      user = await authService.getUser(userId);
    } catch (err: unknown) {
      Logger.warn('Failed to fetch user in welcome endpoint', { error: toError(err).message });
      return NextResponse.json({ ok: false, error: 'failed-to-fetch-user' }, { status: 500 });
    }

    if (!user) {
      Logger.warn('Welcome endpoint: user not found', { userId });
      return NextResponse.json({ ok: false, error: 'failed-to-fetch-user' }, { status: 500 });
    }

    const email = user.email;
    const verified = user.emailVerified ?? false;

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
