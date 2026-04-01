import { getEnv } from '../env';

export type SupportEmailActor = {
  role: 'USER' | 'ADMIN';
  name?: string | null;
  email?: string | null;
};

export type SupportEmailContext = {
  ticketId: string;
  ticketSubject: string;
  ticketCategory?: string | null;
  ticketStatus?: string | null;
  message: string;
  actor: SupportEmailActor;
  siteName: string;
  audience: 'ADMIN' | 'USER';
};

export type SupportEmailPayload = {
  subject: string;
  text: string;
  html: string;
  dashboardUrl: string;
  adminUrl: string;
};

const sanitizeMultiline = (value: string) => value.replace(/\r\n|\r/g, '\n');

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatActorLabel = ({ role, name, email }: SupportEmailActor) => {
  const parts = [name?.trim(), email?.trim()].filter(Boolean) as string[];
  if (parts.length === 0) {
    return role === 'ADMIN' ? 'Support Staff' : 'Customer';
  }
  return parts.join(' · ');
};

const buildTicketUrls = (ticketId: string) => {
  const { NEXT_PUBLIC_APP_URL } = getEnv();
  const url = NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const encodedId = encodeURIComponent(ticketId);
  return {
    adminUrl: `${url}/admin/support?ticket=${encodedId}`,
    dashboardUrl: `${url}/dashboard/support?ticket=${encodedId}`
  };
};

export function buildSupportEmail({
  ticketId,
  ticketSubject,
  ticketCategory,
  ticketStatus,
  message,
  actor,
  siteName,
  audience
}: SupportEmailContext): SupportEmailPayload {
  const cleanedMessage = sanitizeMultiline(message ?? '').trim();
  const messageForText = cleanedMessage || '(no message provided)';
  const messageForHtml = cleanedMessage ? escapeHtml(cleanedMessage).replace(/\n/g, '<br />') : '(no message provided)';

  const shortTicketId = ticketId.slice(0, 12);
  const ticketLabel = `#${shortTicketId}`;
  const actorLabel = formatActorLabel(actor);

  const subjectPrefix = `[${siteName} Support]`;
  const actionLabel = actor.role === 'ADMIN' ? 'Support response' : 'New customer message';
  const subject = `${subjectPrefix} ${actionLabel}: ${ticketSubject} (${ticketLabel})`;

  const { adminUrl, dashboardUrl } = buildTicketUrls(ticketId);
  const categoryLine = ticketCategory ? `Category: ${ticketCategory}` : null;
  const statusLine = ticketStatus ? `Current status: ${ticketStatus}` : null;

  const replyInstructionText = audience === 'USER'
    ? 'To reply, open your support dashboard. Replies to this email are not monitored.'
    : null;

  const textCtas = audience === 'ADMIN'
    ? [`View in admin: ${adminUrl}`, `View as customer: ${dashboardUrl}`]
    : [`View conversation: ${dashboardUrl}`];

  const textLines = [
    `${actionLabel} on ticket ${ticketLabel}`,
    `Subject: ${ticketSubject}`,
    categoryLine ? categoryLine : null,
    statusLine ? statusLine : null,
    `From: ${actorLabel}`,
    '',
    'Message:',
    messageForText,
    '',
    replyInstructionText,
    ...textCtas
  ].filter(Boolean) as string[];

  const primaryCtaHtml = audience === 'ADMIN'
    ? `<a href="${adminUrl}" style="display: inline-block; padding: 12px 20px; border-radius: 999px; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; text-align: center;">Open in Admin</a>`
    : `<a href="${dashboardUrl}" style="display: inline-block; padding: 12px 20px; border-radius: 999px; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; text-align: center;">Open your support thread</a>`;

  const secondaryCtaHtml = audience === 'ADMIN'
    ? `<a href="${dashboardUrl}" style="display: inline-block; padding: 10px 18px; border-radius: 999px; border: 1px solid #d1d5db; color: #2563eb; text-decoration: none; font-weight: 500; text-align: center;">Open as Customer</a>`
    : '';

  const replyInstructionHtml = audience === 'USER'
    ? `<p style="margin: 20px 0 0; font-size: 13px; color: #6b7280; text-align: center;">To respond, click the button above and reply inside your ${escapeHtml(siteName)} dashboard. Replies to this email won’t reach support.</p>`
    : '';

  const html = `<!doctype html>
  <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f9fb; color: #111827; padding: 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);">
        <tr>
          <td style="padding: 24px 24px 12px;">
            <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827;">${escapeHtml(actionLabel)} on ${escapeHtml(ticketLabel)}</h1>
            <p style="margin: 12px 0 0; font-size: 14px; color: #6b7280;">${escapeHtml(ticketSubject)}</p>
            ${categoryLine ? `<p style="margin: 8px 0 0; font-size: 13px; color: #6b7280; font-weight: 500;">${escapeHtml(categoryLine)}</p>` : ''}
            ${statusLine ? `<p style="margin: 8px 0 0; font-size: 13px; color: #22c55e; font-weight: 500;">${escapeHtml(statusLine)}</p>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding: 0 24px 24px;">
            <div style="border-radius: 10px; background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(14, 165, 233, 0.1)); padding: 16px 18px; margin-bottom: 18px;">
              <p style="margin: 0; font-size: 13px; color: #1f2937;">From:</p>
              <p style="margin: 4px 0 0; font-size: 15px; color: #111827; font-weight: 600;">${escapeHtml(actorLabel)}</p>
            </div>
            <div style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; background: #f9fafb;">
              <p style="margin: 0 0 12px; font-size: 13px; color: #6b7280;">Message</p>
              <div style="font-size: 15px; line-height: 1.6; color: #111827;">${messageForHtml}</div>
            </div>
            <div style="margin-top: 24px; display: flex; flex-direction: column; gap: 10px;">
              ${primaryCtaHtml}
              ${secondaryCtaHtml}
            </div>
            ${replyInstructionHtml}
            <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af; text-align: center;">You are receiving this notification because of your support preferences in ${escapeHtml(siteName)}.</p>
          </td>
        </tr>
      </table>
    </body>
  </html>`;

  return {
    subject,
    text: textLines.join('\n'),
    html,
    adminUrl,
    dashboardUrl
  };
}
