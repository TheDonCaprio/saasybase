#!/usr/bin/env node
// Archived: fix-api-imports.js (2025-10)
// Import path fixer preserved for reference; no longer runs routinely.

const fs = require('fs');
const path = require('path');

// Map of file paths to correct relative import paths
const importFixes = {
  // app/api level (3 levels deep) 
  // removed: app/api/test/route.ts
  'app/api/checkout/route.ts': '../../../lib/',
  'app/api/subscription/route.ts': '../../../lib/',
  
  // app/api/[folder] level (4 levels deep)
  // removed: app/api/dev/whoami/route.ts
  // removed: app/api/dev/sync-user/route.ts
  // removed: app/api/debug/subscriptions/route.ts
  'app/api/stripe/webhook/route.ts': '../../../../lib/',
  'app/api/support/tickets/route.ts': '../../../../lib/',
  'app/api/checkout/confirm/route.ts': '../../../../lib/',
  'app/api/user/settings/route.ts': '../../../../lib/',
  
  // app/api/notifications/[id] level (5 levels deep)
  'app/api/notifications/[id]/read/route.ts': '../../../../../lib/',
  'app/api/notifications/mark-all-read/route.ts': '../../../../lib/',
  
  // app/api/admin level (4 levels deep)
  'app/api/admin/settings/route.ts': '../../../../lib/',
  'app/api/admin/notifications/create/route.ts': '../../../../../lib/',
  
  // app/api/admin/[resource] level (5 levels deep)
  'app/api/admin/plans/[planId]/route.ts': '../../../../../lib/',
  'app/api/admin/users/[userId]/route.ts': '../../../../../lib/',
  'app/api/admin/users/[userId]/role/route.ts': '../../../../../lib/',
  
  // app/api/admin/[nested] level (6-7 levels deep)
  'app/api/admin/support/tickets/[ticketId]/route.ts': '../../../../../../lib/',
  'app/api/admin/support/tickets/[ticketId]/reply/route.ts': '../../../../../../../lib/',
  'app/api/admin/payments/[paymentId]/refund/route.ts': '../../../../../../lib/',
};

console.log('Fixing API route import paths...');

Object.entries(importFixes).forEach(([filePath, correctPath]) => {
  const fullPath = path.join(__dirname, '..', filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`Skipping ${filePath} - file not found`);
    return;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let changed = false;
  
  // Fix auth imports
  if (content.includes("from '../../") && content.includes('/lib/auth')) {
    content = content.replace(/from\s+['\"][\.\/]*lib\/auth['\"]/g, `from '${correctPath}auth'`);
    changed = true;
  }

  // Fix prisma imports
  if (content.includes("from '../../") && content.includes('/lib/prisma')) {
    content = content.replace(/from\s+['\"][\.\/]*lib\/prisma(?:\.js)?['\"]/g, `from '${correctPath}prisma'`);
    changed = true;
  }
  
  if (changed) {
    fs.writeFileSync(fullPath, content);
    console.log(`Fixed: ${filePath}`);
  }
});

console.log('Import path fixes complete!');
