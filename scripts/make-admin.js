#!/usr/bin/env node
/**
 * Script to promote a user to ADMIN role
 * 
 * ⚠️  SECURITY WARNING:
 * This script grants full admin access. Only run it:
 * - On a secure server with restricted access
 * - From a trusted machine with proper authentication
 * - Never expose this as a web endpoint
 * - Never commit credentials or user IDs to git
 * 
 * Usage: node scripts/make-admin.js <userId>
 * or set DEV_ADMIN_ID in .env.local and run: node scripts/make-admin.js
 */

const { createPrismaClient } = require('./create-prisma-client.cjs');

async function makeAdmin() {
  const prisma = await createPrismaClient();
  // SECURITY: Block execution in production unless explicitly allowed
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_ADMIN_SCRIPT) {
    console.error('\n🚨 SECURITY: This script is disabled in production.');
    console.log('\nTo run in production (use with extreme caution):');
    console.log('  ALLOW_ADMIN_SCRIPT=true node scripts/make-admin.js <userId>');
    console.log('\n⚠️  Only do this on a secure server with proper access controls!');
    process.exit(1);
  }

  const userId = process.argv[2] || process.env.DEV_ADMIN_ID;

  if (!userId) {
    console.error('❌ Error: No user ID provided');
    console.log('\nUsage:');
    console.log('  node scripts/make-admin.js <userId>');
    console.log('  or set DEV_ADMIN_ID in .env.local and run: node scripts/make-admin.js');
    process.exit(1);
  }

  try {
    console.log(`\n🔍 Looking for user: ${userId}`);
    
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true }
    });

    if (!user) {
      console.error(`\n❌ User not found: ${userId}`);
      console.log('\nThe user must sign in at least once to be created in the database.');
      process.exit(1);
    }

    if (user.role === 'ADMIN') {
      console.log(`\n✅ User is already an ADMIN`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   Name: ${user.name || 'N/A'}`);
      process.exit(0);
    }

    // Update to ADMIN
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role: 'ADMIN' },
      select: { id: true, email: true, name: true, role: true }
    });

    console.log(`\n✅ Successfully promoted user to ADMIN!`);
    console.log(`   ID: ${updated.id}`);
    console.log(`   Email: ${updated.email || 'N/A'}`);
    console.log(`   Name: ${updated.name || 'N/A'}`);
    console.log(`   Role: ${updated.role}`);
    console.log('\nThe user now has full admin access.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

makeAdmin();
