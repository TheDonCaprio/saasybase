/*
  ARCHIVED: confirm_subscription.js

  Reason: debug utility to inspect a Stripe subscription and matching DB record.
  Preserved in archive for occasional ops debugging.

  To restore: copy back to pro-app/scripts/ and remove this header.
*/

const fs = require('fs');
const path = require('path');
(async () => {
  try {
    const envPath = path.resolve(__dirname, '../../.env.local');
    if (!fs.existsSync(envPath)) throw new Error('.env.local not found in pro-app');
    const env = fs.readFileSync(envPath, 'utf8');
    const m = env.match(/STRIPE_SECRET_KEY\s*=\s*\"?([^\"\n]+)\"?/);
    if (!m) throw new Error('STRIPE_SECRET_KEY not found in .env.local');
    const stripeKey = m[1].trim();
    const stripe = require('stripe')(stripeKey);
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const subId = process.argv[2] || 'sub_1S5OKaFMsqy36GdGINNCohjR';
    console.log('Checking subscription:', subId);

    const stripeSub = await stripe.subscriptions.retrieve(subId, { expand: ['latest_invoice'] }).catch(e => { console.error('stripe error', e && e.message); return null; });
    if (!stripeSub) {
      console.log('Stripe subscription not found');
    } else {
      console.log('Stripe subscription: id=%s status=%s current_period_end=%s', stripeSub.id, stripeSub.status, stripeSub.current_period_end);
      console.log('Stripe current_period_end ISO:', new Date((stripeSub.current_period_end || 0) * 1000).toISOString());
    }

    const dbSub = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: subId } });
    if (!dbSub) {
      console.log('DB subscription not found for stripeSubscriptionId=', subId);
    } else {
      console.log('DB subscription: id=%s expiresAt=%s', dbSub.id, dbSub.expiresAt);
      console.log('DB expiresAt ISO:', new Date(dbSub.expiresAt).toISOString());
    }

    await prisma.$disconnect();
  } catch (e) {
    console.error('error', e && e.message);
    process.exit(1);
  }
})();
