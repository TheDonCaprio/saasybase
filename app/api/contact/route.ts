import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupportEmail, getSiteName, sendEmail } from '@/lib/email';
import { SETTING_DEFAULTS, SETTING_KEYS } from '@/lib/settings';
import { rateLimit, getClientIP } from '@/lib/rateLimit';
import { Logger } from '@/lib/logger';
import { toError } from '@/lib/runtime-guards';

export const dynamic = 'force-dynamic';

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(120, 'Name is too long.'),
  email: z.string().trim().email('Enter a valid email address.'),
  topic: z.string().trim().min(2, 'Please select a topic.').max(160, 'Topic is too long.'),
  message: z
    .string()
    .trim()
    .min(20, 'Tell us a bit more so we can help.')
    .max(2000, 'Message is too long. You can always email us directly.'),
  company: z
    .string()
    .trim()
    .max(160, 'Company name is too long.')
    .optional()
    .transform((value) => (value ? value : undefined))
});

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const limiterKey = `contact:ip:${ip}`;

  const rateResult = await rateLimit(
    limiterKey,
    { limit: 5, windowMs: 60 * 60 * 1000, message: 'Too many contact requests. Please try again in a little while.' },
    {
      ip,
      route: request.nextUrl.pathname,
      method: request.method,
      userAgent: request.headers.get('user-agent')
    }
  );

  if (!rateResult.success && !rateResult.allowed) {
    Logger.error('Contact form rate limiter unavailable', { key: limiterKey, error: rateResult.error });
    return NextResponse.json(
      { error: 'Service temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    );
  }

  if (!rateResult.allowed) {
    const retryAfterSeconds = Math.max(0, Math.ceil((rateResult.reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: rateResult.error ?? 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfterSeconds.toString()
        }
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error: unknown) {
    Logger.warn('Contact form payload was not JSON', { error: toError(error).message });
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    const { fieldErrors } = parsed.error.flatten();
    return NextResponse.json({ error: 'Validation failed.', fieldErrors }, { status: 400 });
  }

  const { name, email, topic, message, company } = parsed.data;

  try {
    const [supportEmail, siteName] = await Promise.all([
      getSupportEmail(),
      getSiteName().catch(() => process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME])
    ]);

    if (!supportEmail) {
      Logger.warn('Contact form submission dropped: missing support email');
      return NextResponse.json({ error: 'Support channel not configured.' }, { status: 503 });
    }

    const cleanedMessage = message.trim();
    const ticketSubject = `${topic} from ${name}`;

    const lines = [
      `New contact form submission on ${siteName}`,
      '',
      `Name: ${name}`,
      `Email: ${email}`,
      company ? `Company: ${company}` : null,
      `Topic: ${topic}`,
      '',
      cleanedMessage
    ].filter(Boolean) as string[];

    const html = `<!doctype html>
<html lang="en">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; padding: 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);">
      <tr>
        <td style="padding: 24px 24px 12px;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827;">${escapeHtml(topic)} inquiry</h1>
          <p style="margin: 12px 0 0; font-size: 14px; color: #6b7280;">${escapeHtml(siteName)} contact form submission</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 24px 24px;">
          <div style="border-radius: 10px; background: linear-gradient(135deg, rgba(91, 33, 182, 0.12), rgba(129, 140, 248, 0.14)); padding: 18px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 13px; color: #1f2937;">From</p>
            <p style="margin: 6px 0 0; font-size: 15px; color: #111827; font-weight: 600;">${escapeHtml(name)}</p>
            <p style="margin: 4px 0 0; font-size: 14px; color: #4b5563;">${escapeHtml(email)}${company ? ` · ${escapeHtml(company)}` : ''}</p>
          </div>
          <div style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; background: #f9fafb;">
            <p style="margin: 0 0 12px; font-size: 13px; color: #6b7280;">Message</p>
            <div style="font-size: 15px; line-height: 1.6; color: #111827;">${escapeHtml(cleanedMessage).replace(/\n/g, '<br />')}</div>
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    const emailResult = await sendEmail({
      to: supportEmail,
      subject: `[${siteName}] Contact form: ${ticketSubject}`,
      text: lines.join('\n'),
      html,
      // set reply-to so support can hit Reply in their mail client to reach the sender
      replyTo: email
    });

    if (!emailResult.success) {
      Logger.warn('Failed to dispatch contact form email', { error: emailResult.error });
      return NextResponse.json({ error: 'Unable to send your message right now.' }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = toError(error);
    Logger.error('Contact form submission failed', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Something went wrong. Please try again later.' }, { status: 500 });
  }
}
