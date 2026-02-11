#!/usr/bin/env node

/*
  ARCHIVE: seed-email-templates.ts

  This file is an archived copy of the top-level seeding helper that called
  `seedDefaultTemplates()` from `pro-app/lib/email-templates.ts`.

  Rationale for archiving:
  - The admin UI calls the same library function via `/api/admin/emails/seed`.
  - Keeping an archived copy preserves history and allows CLI reruns if desired.

  If you need to run this from the CLI, either restore it to `pro-app/scripts/`
  or run the seeding API from the running app.
*/

/* Original script (archived) */
import { seedDefaultTemplates } from '../lib/email-templates';

async function main() {
  console.log('🌱 Seeding default email templates...\n');
  try {
    const result = await seedDefaultTemplates();
    console.log('\n✅ Seeding complete!');
    console.log(`   Created: ${result.created} templates`);
    console.log(`   Skipped: ${result.skipped} templates (already exist)`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  }
}

main();
