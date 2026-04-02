#!/usr/bin/env node

/**
 * Test script to verify that new subscriptions properly set stripeCustomerId
 * Run this after creating a new subscription to check if the fix works
 */

const { createPrismaClient } = require('../create-prisma-client.cjs');

async function testCustomerIdSync() {
  const prisma = await createPrismaClient();
  
  try {
    // Find users with recent subscriptions but no stripeCustomerId
    const usersWithMissingCustomerId = await prisma.user.findMany({
      where: {
        stripeCustomerId: null,
        subscriptions: {
          some: {
            stripeSubscriptionId: {
              not: null
            },
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            }
          }
        }
      },
      include: {
        subscriptions: {
          where: {
            stripeSubscriptionId: {
              not: null
            }
          },
          take: 1,
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    console.log(`Found ${usersWithMissingCustomerId.length} users with recent subscriptions but missing stripeCustomerId`);
    
    if (usersWithMissingCustomerId.length > 0) {
      console.log('Users missing customer ID:');
      for (const user of usersWithMissingCustomerId) {
        console.log(`- User ${user.id}: email=${user.email}, subscription=${user.subscriptions[0]?.stripeSubscriptionId}`);
      }
    } else {
      console.log('✅ All recent subscriptions have proper customer ID assignment');
    }

    // Also check for any subscriptions created today
    const recentSubs = await prisma.subscription.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        },
        stripeSubscriptionId: {
          not: null
        }
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            stripeCustomerId: true
          }
        }
      }
    });

    console.log(`\nRecent subscriptions (last 24h): ${recentSubs.length}`);
    for (const sub of recentSubs) {
      const hasCustomerId = !!sub.user.stripeCustomerId;
      const status = hasCustomerId ? '✅' : '❌';
      console.log(`${status} Subscription ${sub.id}: User ${sub.user.email} - Customer ID: ${sub.user.stripeCustomerId || 'MISSING'}`);
    }

  } catch (error) {
    console.error('Error testing customer ID sync:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testCustomerIdSync();