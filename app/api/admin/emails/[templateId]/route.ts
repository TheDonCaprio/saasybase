import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/prisma';
import { Logger } from '../../../../../lib/logger';
import { recordAdminAction } from '../../../../../lib/admin-actions';

// GET - Get single email template
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  try {
    await requireAdmin();
    const params = await context.params;
    
    const template = await prisma.emailTemplate.findUnique({
      where: { id: params.templateId }
    });
    
    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ template });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to fetch email template', { error });
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

// PATCH - Update email template
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  try {
    const actorId = await requireAdmin();
    const params = await context.params;
    
    const body = await req.json();
    
    const template = await prisma.emailTemplate.update({
      where: { id: params.templateId },
      data: {
        name: body.name,
        description: body.description,
        subject: body.subject,
        htmlBody: body.htmlBody,
        textBody: body.textBody,
        variables: body.variables,
        active: body.active
      }
    });
    
    Logger.info('Updated email template', { templateId: template.id, key: template.key });
    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'email_template.update',
      targetType: 'email_template',
      details: { templateId: template.id, key: template.key, active: template.active },
    });
    
    return NextResponse.json({ template });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to update email template', { error });
    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    );
  }
}

// DELETE - Delete email template
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  try {
    const actorId = await requireAdmin();
    const params = await context.params;
    
    await prisma.emailTemplate.delete({
      where: { id: params.templateId }
    });
    
    Logger.info('Deleted email template', { templateId: params.templateId });
    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'email_template.delete',
      targetType: 'email_template',
      details: { templateId: params.templateId },
    });
    
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to delete email template', { error });
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}
