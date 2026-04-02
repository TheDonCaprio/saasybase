#!/usr/bin/env node
/**
 * Backfill script: find coupons that are active but have an endsAt in the past
 * and mark them inactive. Runs as a dry-run by default — pass `--apply` to
 * perform updates. If STRIPE_SECRET_KEY is set, the script will also attempt
 * to deactivate the associated Stripe promotion codes.
 *
 * Usage:
 *   # Dry run (no DB writes)
 *   node scripts/fix-active-expired-coupons.js
 *
 *   # Apply changes
 *   node scripts/fix-active-expired-coupons.js --apply
 */

const { createPrismaClient } = require('./create-prisma-client.cjs');
let Stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    Stripe = require('stripe');
  } catch (err) {
    console.warn('Stripe package not available; skipping Stripe sync even though STRIPE_SECRET_KEY is set');
    Stripe = null;
  }
}

async function main() {
  const prisma = await createPrismaClient();
  try {
    const now = new Date();
    const coupons = await prisma.coupon.findMany({
      where: {
        active: true,
        endsAt: { lt: now },
      },
      select: {
        id: true,
        code: true,
        endsAt: true,
        stripePromotionCodeId: true,
        stripeCouponId: true,
      },
    });

    console.log(`Found ${coupons.length} coupon(s) that are active but expired (endsAt < now)`);
    if (coupons.length === 0) {
      await prisma.$disconnect();
      return;
    }

    const apply = process.argv.includes('--apply');
    if (!apply) {
      console.log('Dry run — no updates will be made. Re-run with --apply to persist changes.');
    } else {
      console.log('Applying changes: will mark found coupons inactive and attempt Stripe sync (if configured).');
    }

    const stripe = Stripe && process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' }) : null;

    for (const c of coupons) {
      console.log(`- ${c.id}  code=${c.code}  endsAt=${c.endsAt ? c.endsAt.toISOString() : 'null'}  stripePromotionCodeId=${c.stripePromotionCodeId || 'n/a'}`);
      if (!apply) continue;

      try {
        await prisma.coupon.update({ where: { id: c.id }, data: { active: false } });
        console.log('  -> marked inactive in DB');
      } catch (err) {
        console.error('  -> failed to update DB:', err && err.message ? err.message : String(err));
        continue;
      }

      if (stripe && c.stripePromotionCodeId) {
        try {
          await stripe.promotionCodes.update(c.stripePromotionCodeId, { active: false });
          console.log('  -> deactivated Stripe promotion code');
        } catch (err) {
          console.error('  -> failed to update Stripe promotion code:', err && err.message ? err.message : String(err));
        }
      }
    }

    if (apply) console.log('Done.');
    else console.log('Dry run complete. No changes were made.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Error running backfill:', err && err.message ? err.message : String(err));
  process.exit(1);
});
