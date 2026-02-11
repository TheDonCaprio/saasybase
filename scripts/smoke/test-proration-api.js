#!/usr/bin/env node
/**
 * Test the proration API to see if it works now that customer IDs are fixed
 */

require('dotenv').config({ path: '.env.local' });

async function testProrationAPI() {
  try {
    console.log('🧪 Testing proration API...\n');
    
    // Get a test plan ID (different from current plan)
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const currentUser = await prisma.user.findFirst({
      where: { 
        email: 'caprio@capriofiles.com',
        subscriptions: {
          some: {
            status: 'ACTIVE',
            plan: { autoRenew: true }
          }
        }
      },
      include: {
        subscriptions: {
          where: { status: 'ACTIVE' },
          include: { plan: true }
        }
      }
    });
    
    if (!currentUser) {
      console.log('❌ No user with active subscription found');
      return;
    }
    
    const currentPlan = currentUser.subscriptions[0]?.plan;
    console.log(`Current plan: ${currentPlan?.name} (${currentPlan?.id})`);
    
    // Find the specific $29.99 plan to test your exact scenario
    const targetPlan = await prisma.plan.findFirst({
      where: {
        id: 'cmh3iu7df0013efrbwwj0u2xw' // 1 Month Subscription (NEW) - $29.99
      }
    });
    
    if (!targetPlan) {
      console.log('❌ No other recurring plan found to test with');
      return;
    }
    
    console.log(`Target plan: ${targetPlan.name} (${targetPlan.id})\n`);
    
    // Test the proration API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const url = `${baseUrl}/api/subscription/proration?planId=${targetPlan.id}`;
    
    console.log(`Making request to: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer test_token`, // This would normally be handled by Clerk
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    console.log(`\nResponse status: ${response.status}`);
    console.log('Response data:');
    console.log(JSON.stringify(data, null, 2));
    
    if (response.ok && data.prorationEnabled === true) {
      console.log('\n✅ Proration API is working! Customer ID mismatch is fixed.');
    } else if (response.status === 409 && data.prorationEnabled === false) {
      console.log('\n⚠️  Proration fell back (this is expected behavior)');
      console.log(`Reason: ${data.reason}`);
    } else {
      console.log('\n❌ Unexpected response from proration API');
    }
    
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('Error testing proration API:', error.message);
  }
}

testProrationAPI().catch(console.error);