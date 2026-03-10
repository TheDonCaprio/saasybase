import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../../lib/auth';
import { recordAdminAction } from '../../../../../lib/admin-actions';
import { prisma } from '../../../../../lib/prisma';
import { Logger } from '../../../../../lib/logger';
import { renderTemplate, type EmailVariables } from '../../../../../lib/email-templates';
import { sendEmail, getSiteLogo, getSiteName, getSupportEmail, getSiteBrandHtml, getAccentColors } from '../../../../../lib/email';

function extractTemplateVariableKeys(template: { variables: string | null; subject: string; htmlBody: string; textBody: string | null }): string[] {
  const keys = new Set<string>();

  if (template.variables) {
    try {
      const parsed = JSON.parse(template.variables) as Record<string, unknown>;
      Object.keys(parsed).forEach((key) => keys.add(key));
    } catch {
      // Ignore malformed variable metadata.
    }
  }

  const combined = [template.subject, template.htmlBody, template.textBody || ''].join('\n');
  const matches = combined.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) ?? [];

  for (const match of matches) {
    const key = match.replace(/[{}\s]/g, '');
    if (key) {
      keys.add(key);
    }
  }

  return Array.from(keys);
}

function buildSampleVariables(keys: string[], context: { to: string; siteName: string; supportEmail: string; siteLogo: string; siteBrandHtml: string; accentColor: string; accentHoverColor: string; baseUrl: string }): EmailVariables {
  const samples: EmailVariables = {
    firstName: 'John',
    lastName: 'Doe',
    fullName: 'John Doe',
    userEmail: context.to,
    transactionId: 'txn_test_12345',
    amount: '$29.00',
    currency: 'USD',
    planName: 'Pro Plan',
    planDescription: 'Unlimited access for growing teams',
    expiresAt: 'March 31, 2026',
    startedAt: 'March 1, 2026',
    tokenAmount: '1,000',
    tokenName: 'credits',
    tokenDelta: '250',
    tokenBalance: '1,250',
    reason: 'Requested for testing',
    siteName: context.siteName,
    supportEmail: context.supportEmail,
    siteUrl: context.baseUrl,
    siteLogo: context.siteLogo,
    siteBrandHtml: context.siteBrandHtml,
    accentColor: context.accentColor,
    accentHoverColor: context.accentHoverColor,
    dashboardUrl: `${context.baseUrl}/dashboard`,
    billingUrl: `${context.baseUrl}/pricing`,
    eventTitle: 'Example admin event',
    eventSummary: 'A sample notification generated for template previewing.',
    detailsHtml: '<ul><li>Sample detail one</li><li>Sample detail two</li></ul>',
    detailsText: '- Sample detail one\n- Sample detail two',
    actionButtonHtml: '<a href="#" style="color:#2563eb;">Review event</a>',
    actionUrl: `${context.baseUrl}/dashboard`,
    actionText: 'Review event',
    detailsJson: '{"status":"ok"}',
    actorId: 'admin_test_user',
    actorName: 'Admin Tester',
    actorEmail: context.supportEmail,
    actorRole: 'ADMIN',
    inviterName: 'John Doe',
    organizationName: 'Acme Workspace',
    acceptUrl: `${context.baseUrl}/invite/accept/test-token`,
    declineUrl: `${context.baseUrl}/invite/decline/test-token`,
    joinUrl: `${context.baseUrl}/sign-up`,
    signInUrl: `${context.baseUrl}/sign-in`,
    currentEmail: 'john.old@example.com',
    newEmail: context.to,
  };

  const filtered: EmailVariables = {};
  for (const key of keys) {
    if (samples[key] !== undefined) {
      filtered[key] = samples[key];
    }
  }

  return filtered;
}

export async function POST(req: NextRequest) {
  try {
    const actorId = await requireAdmin();

    const body = await req.json();
    const to = typeof body.to === 'string' ? body.to.trim() : '';
    const templateId = typeof body.templateId === 'string' ? body.templateId : null;
    const templateKey = typeof body.templateKey === 'string' ? body.templateKey : null;

    if (!to) {
      return NextResponse.json({ error: 'Recipient email is required' }, { status: 400 });
    }

    if (!templateId && !templateKey) {
      return NextResponse.json({ error: 'Template identifier is required' }, { status: 400 });
    }

    const template = await prisma.emailTemplate.findUnique({
      where: templateId ? { id: templateId } : { key: templateKey as string }
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    let overrideVariables: Record<string, string> = {};
    if (body.variables && typeof body.variables === 'object' && !Array.isArray(body.variables)) {
      overrideVariables = Object.fromEntries(
        Object.entries(body.variables as Record<string, unknown>).map(([key, value]) => [
          key,
          value === undefined || value === null ? '' : String(value)
        ])
      );
    }

    const [siteName, supportEmail, siteLogo, siteBrandHtml, { accentColor, accentHoverColor }] = await Promise.all([
      getSiteName(),
      getSupportEmail(),
      getSiteLogo(),
      getSiteBrandHtml(),
      getAccentColors()
    ]);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const templateKeys = extractTemplateVariableKeys(template);
    const sampleVariables = buildSampleVariables(templateKeys, {
      to,
      siteName,
      supportEmail,
      siteLogo,
      siteBrandHtml,
      accentColor,
      accentHoverColor,
      baseUrl,
    });

    const variables: EmailVariables = {
      ...sampleVariables,
      siteName,
      supportEmail,
      siteLogo,
      siteBrandHtml,
      accentColor,
      accentHoverColor,
      ...overrideVariables
    };

    if (!variables.dashboardUrl) {
      variables.dashboardUrl = `${baseUrl}/dashboard`;
    }

    if (!variables.billingUrl) {
      variables.billingUrl = `${baseUrl}/pricing`;
    }

    const subject = renderTemplate(template.subject, variables);
    const html = renderTemplate(template.htmlBody, variables);
    const text = template.textBody ? renderTemplate(template.textBody, variables) : undefined;

    const result = await sendEmail({
      to,
      subject,
      html,
      text,
      template: template.key,
      variables
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send test email' },
        { status: 500 }
      );
    }

    Logger.info('Sent email template test', { templateId: template.id, to });
    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'email_template.test',
      targetType: 'email_template',
      details: { templateId: template.id, to },
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to send email template test', {
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: 'Failed to send test email' }, { status: 500 });
  }
}
