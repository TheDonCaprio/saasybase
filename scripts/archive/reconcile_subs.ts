/*
  ARCHIVED: reconcile_subs.ts

  Reason: TypeScript ops script that runs the subscription reconciliation routine
  against Stripe. Preserved for ops use; run via ts-node or after compilation.

  To restore: copy back to pro-app/scripts/ and remove this header.
*/

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

(async () => {
  try {
    const { paymentService } = await import('../../lib/payment/service');

    console.log('Starting subscription reconciliation...');
    const res = await paymentService.reconcileSubscriptions();
    console.log('Reconciliation result:', res);
    process.exit(0);
  } catch (e) {
    console.error('Reconciliation failed', e);
    process.exit(1);
  }
})();
