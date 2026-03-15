import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { createBillingNotification } from '../../../../../lib/notifications';
import { shouldEmailUser, sendEmail, getSupportEmail, getSiteName } from '../../../../../lib/email';
import { prisma } from '../../../../../lib/prisma';
import { toError } from '../../../../../lib/runtime-guards';

export const runtime = 'nodejs';

function debugRouteDisabled() {
  return process.env.NODE_ENV === 'production' || process.env.ENABLE_DEBUG_ROUTES !== 'true';
}

// Dev-only endpoint to trigger a billing notification + email for testing.
// POST { userId: string, subject?: string, message?: string, sendAdmin?: boolean }
export async function POST(req: NextRequest) {
  if (debugRouteDisabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    await requireAdmin();

    const body = await req.json();
    const userId = body.userId as string | undefined;
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const subject = body.subject || 'Billing test';
    const message = body.message || 'This is a test billing notification.';
    const sendAdmin = body.sendAdmin === true;

    // Create in-app notification
    await createBillingNotification(userId, message);

    // Send email to user if they want
    const emailOk = await shouldEmailUser(userId);
    let emailSent = false;
    if (emailOk) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
      const siteName = await getSiteName();
      if (user?.email) {
        const res = await sendEmail({ to: user.email, userId, subject: `${siteName}: ${subject}`, text: message });
        emailSent = !!res.success;
      }
    }

    // adminResult may be an email send result; keep it unknown and stringify only for debug responses
    let adminResult: unknown = null;
    if (sendAdmin || process.env.SEND_ADMIN_BILLING_EMAILS === 'true') {
      const adminEmail = await getSupportEmail();
      const siteName = await getSiteName();
      if (adminEmail) {
        const res = await sendEmail({ to: adminEmail, subject: `${siteName}: ${subject}`, text: `User ${userId}: ${message}` });
        // include admin result in response for debugging
        adminResult = res;
      }
    }

    return NextResponse.json({ ok: true, emailSent, adminResult });
  } catch (err: unknown) {
    const authResponse = toAuthGuardErrorResponse(err);
    if (authResponse) return authResponse;
    const e = toError(err);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
