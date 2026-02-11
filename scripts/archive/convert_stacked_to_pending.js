#!/usr/bin/env node
// Archived: convert_stacked_to_pending.js (2025-10)
// Legacy migration helper preserved for reference.

/**
 * Legacy migration helper: convert historical subscription rows that used the
 * 'STACKED' status into the consolidated 'PENDING' status.
 *
 * This script is idempotent and safe to run multiple times. It intentionally
 * targets rows with status === 'STACKED' and flips them to 'PENDING'. Keep it
 * in the repo until you run it in production (or decide to remove it after
 * the migration completes).
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function convert() {
	try {
		const res = await prisma.subscription.updateMany({
			where: { status: 'STACKED' },
			data: { status: 'PENDING' }
		});
		console.log('Converted', res.count, 'STACKED -> PENDING');
	} catch (e) {
		console.error('Error converting stacked subscriptions', e);
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
}

convert();
