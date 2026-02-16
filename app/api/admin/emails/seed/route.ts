import { NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../../lib/auth';
import { recordAdminAction } from '../../../../../lib/admin-actions';
import { seedDefaultTemplates } from '../../../../../lib/email-templates';
import { Logger } from '../../../../../lib/logger';

export async function POST() {
  try {
    const actorId = await requireAdmin();
    
    Logger.info('Admin initiated email template seeding');
    
    const result = await seedDefaultTemplates();
    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'email_template.seed',
      targetType: 'email_template',
      details: { created: result.created, skipped: result.skipped },
    });
    
    return NextResponse.json({
      success: true,
      created: result.created,
      skipped: result.skipped,
      message: `Created ${result.created} templates, skipped ${result.skipped} existing templates`
    });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    Logger.error('Failed to seed email templates', { error });
    return NextResponse.json(
      { error: 'Failed to seed templates' },
      { status: 500 }
    );
  }
}
