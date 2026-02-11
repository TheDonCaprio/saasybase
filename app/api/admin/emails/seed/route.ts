import { NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../../lib/auth';
import { seedDefaultTemplates } from '../../../../../lib/email-templates';
import { Logger } from '../../../../../lib/logger';

export async function POST() {
  try {
    await requireAdmin();
    
    Logger.info('Admin initiated email template seeding');
    
    const result = await seedDefaultTemplates();
    
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
