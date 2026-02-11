import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { Logger } from '../../../../lib/logger';

// GET - List all email templates
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    
    const searchParams = req.nextUrl.searchParams;
    const activeOnly = searchParams.get('active') === 'true';
    
    const templates = await prisma.emailTemplate.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: { name: 'asc' }
    });
    
    return NextResponse.json({ templates });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to fetch email templates', { error });
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

// POST - Create new email template
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    
    const body = await req.json();
    
    const template = await prisma.emailTemplate.create({
      data: {
        name: body.name,
        key: body.key,
        description: body.description || null,
        subject: body.subject,
        htmlBody: body.htmlBody,
        textBody: body.textBody || null,
        variables: body.variables || null,
        active: body.active ?? true
      }
    });
    
    Logger.info('Created email template', { templateId: template.id, key: template.key });
    
    return NextResponse.json({ template }, { status: 201 });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to create email template', { error });
    return NextResponse.json(
      { error: 'Failed to create template' },
      { status: 500 }
    );
  }
}
