import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/prisma';
import { Logger } from '../../../../../lib/logger';
import { renderTemplate, type EmailVariables } from '../../../../../lib/email-templates';
import { sendEmail, getSiteLogo, getSiteName, getSupportEmail } from '../../../../../lib/email';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

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

    let defaultVariables: Record<string, string> = {};
    if (template.variables) {
      try {
        const parsed = JSON.parse(template.variables) as Record<string, unknown>;
        defaultVariables = Object.fromEntries(
          Object.entries(parsed).map(([key, value]) => [
            key,
            value === undefined || value === null ? '' : String(value)
          ])
        );
      } catch (error) {
        Logger.warn('Failed to parse template default variables', {
          templateId: template.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const [siteName, supportEmail, siteLogo] = await Promise.all([
      getSiteName(),
      getSupportEmail(),
      getSiteLogo()
    ]);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    const variables: EmailVariables = {
      ...defaultVariables,
      siteName,
      supportEmail,
      siteLogo,
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
