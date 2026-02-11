/*
  ARCHIVED: seed_plans.js

  Reason: CLI wrapper to seed plans and sync stripe price IDs via lib/plans.
  Preserved in archive for ops and initial DB population.

  To restore: copy back to pro-app/scripts/ and remove this header.
*/

const { ensurePlansSeeded, syncPlanStripePriceIds } = require('../../lib/plans');
(async()=>{
  try{
    await ensurePlansSeeded();
    await syncPlanStripePriceIds();
    console.log('Plans seeded and stripePriceIds synced');
  }catch(e){
    console.error(e);
    process.exit(1);
  }
})();
