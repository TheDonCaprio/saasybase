import { prisma } from './prisma';
import { sendEmail } from './email';
import { toError } from './runtime-guards';
import { Logger } from './logger';

export async function sendWelcomeIfNotSent(userId: string, email: string, opts?: { firstName?: string }) {
  try {
    if (!email) return { ok: false, error: 'no-email' };

    // Check email log to avoid duplicates
    const existing = await prisma.emailLog.findFirst({
      where: {
        OR: [{ userId }, { to: email }],
        template: 'welcome',
        status: 'SENT'
      }
    });

    if (existing) {
      Logger.info('sendWelcomeIfNotSent: already sent, skipping', { userId, email });
      return { ok: true, skipped: true };
    }

    // Prefer an explicit provided firstName, otherwise try to resolve from the local
    // user record so emails can address users by name when available.
    let firstName = opts?.firstName ?? '';
    if (!firstName) {
      try {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        if (u?.name) firstName = u.name;
      } catch {
        // ignore and leave firstName empty
      }
    }
    const result = await sendEmail({
      to: email,
      templateKey: 'welcome',
      userId,
      variables: { firstName, userEmail: email }
    });

    if (!result.success) {
      Logger.warn('sendWelcomeIfNotSent: sendEmail failed', { userId, email, error: result.error });
      return { ok: false, error: result.error ?? 'send-failed' };
    }

    Logger.info('sendWelcomeIfNotSent: welcome email sent', { userId, email });
    return { ok: true, sent: true };
  } catch (err: unknown) {
    const e = toError(err);
    Logger.error('sendWelcomeIfNotSent: unexpected error', { error: e.message });
    return { ok: false, error: e.message };
  }
}

export default sendWelcomeIfNotSent;
