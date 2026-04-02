#!/usr/bin/env node
const { createBillingNotification } = require('../../lib/notifications');
const { sendEmail, shouldEmailUser, getSupportEmail, getSiteName } = require('../../lib/email');
const { createPrismaClient } = require('../create-prisma-client.cjs');

(async () => {
  const prisma = await createPrismaClient();
  try {
    // Use the first user and plan from our database
    const user = await prisma.user.findFirst({
      select: { id: true, email: true, name: true }
    });
    
    const plan = await prisma.plan.findFirst({
      where: { name: '1 Hour Trial' },
      select: { id: true, name: true, stripePriceId: true }
    });

    if (!user || !plan) {
      console.error('Missing user or plan data');
      return;
    }

    console.log(`Testing notification/email flow for user ${user.id} (${user.email}) with plan ${plan.name}`);

    // Test notification creation
    console.log('\n1. Creating notification...');
    await createBillingNotification(user.id, `Payment succeeded for ${plan.name}. Your subscription is active.`);
    console.log('✓ Notification created');

    // Test email sending
    console.log('\n2. Checking if user should receive emails...');
    const emailOk = await shouldEmailUser(user.id);
    console.log(`Email OK: ${emailOk}`);

    if (emailOk && user.email) {
      console.log('\n3. Sending user email...');
      const siteName = await getSiteName();
      await sendEmail({
        to: user.email,
        userId: user.id,
        subject: `${siteName}: Subscription active (TEST)`,
        text: `Your payment for ${plan.name} was successful. Your subscription is now active. (This is a test email)`
      });
      console.log('✓ User email sent');
    }

    // Test admin email
    if (process.env.SEND_ADMIN_BILLING_EMAILS === 'true') {
      console.log('\n4. Sending admin email...');
      const adminEmail = await getSupportEmail();
      const siteName = await getSiteName();
      if (adminEmail) {
        await sendEmail({
          to: adminEmail,
          subject: `${siteName}: New purchase (TEST)`,
          text: `A user (${user.id}) purchased ${plan.name}. (This is a test email)`
        });
        console.log('✓ Admin email sent');
      } else {
        console.log('No admin email configured');
      }
    } else {
      console.log('\n4. Admin emails disabled (SEND_ADMIN_BILLING_EMAILS != "true")');
    }

    console.log('\n✅ Manual test completed successfully!');

  } catch (error) {
    console.error('❌ Manual test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
})();