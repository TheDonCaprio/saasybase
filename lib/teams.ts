import { randomUUID } from 'node:crypto';
import { clerkClient } from '@clerk/nextjs/server';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { Logger } from './logger';
import { toError } from './runtime-guards';

export type OrganizationSnapshot = {
	clerkOrganizationId: string;
	name?: string | null;
	slug?: string | null;
	ownerUserId?: string | null;
	billingEmail?: string | null;
	planId?: string | null;
	seatLimit?: number | null;
	tokenPoolStrategy?: string | null;
	tokenBalance?: number | null;
};

export type OrganizationMembershipSnapshot = {
	userId: string;
	organizationId?: string | null;
	clerkOrganizationId?: string | null;
	organizationSlug?: string | null;
	role?: string | null;
	status?: string | null;
};

export type OrganizationInviteSnapshot = {
	email: string;
	token?: string | null;
	organizationId?: string | null;
	clerkOrganizationId?: string | null;
	organizationSlug?: string | null;
	role?: string | null;
	status?: string | null;
	invitedByUserId?: string | null;
	expiresAt?: Date | string | number | null;
	acceptedAt?: Date | string | number | null;
};

type Identifiers = {
	organizationId?: string | null;
	clerkOrganizationId?: string | null;
	organizationSlug?: string | null;
};

function coerceDate(value?: Date | string | number | null): Date | null {
	if (!value) return null;
	if (value instanceof Date) return value;
	if (typeof value === 'number') return new Date(value);
	if (typeof value === 'string') {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}
	return null;
}

async function getOrganizationId(identifiers: Identifiers): Promise<string | null> {
	const { organizationId, clerkOrganizationId, organizationSlug } = identifiers;
	try {
		if (organizationId) {
			const existing = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
			if (existing) return existing.id;
		}
		if (clerkOrganizationId) {
			const existing = await prisma.organization.findUnique({ where: { clerkOrganizationId }, select: { id: true } });
			if (existing) return existing.id;
		}
		if (organizationSlug) {
			const existing = await prisma.organization.findUnique({ where: { slug: organizationSlug }, select: { id: true } });
			if (existing) return existing.id;
		}
		if (clerkOrganizationId) {
			const ensuredId = await ensureOrganizationFromClerk(clerkOrganizationId);
			if (ensuredId) return ensuredId;
		}
	} catch (err: unknown) {
		Logger.warn('getOrganizationId failed', { error: toError(err).message, identifiers });
	}
	return null;
}

async function ensureOrganizationFromClerk(clerkOrganizationId: string): Promise<string | null> {
	try {
		const client = await clerkClient();
		const clerkOrg = await client.organizations.getOrganization({ organizationId: clerkOrganizationId });
		const anyOrg = clerkOrg as unknown as Record<string, unknown>;
		const ownerUserId = (anyOrg.createdBy as string | undefined) ?? (anyOrg.created_by as string | undefined);
		if (!ownerUserId) {
			Logger.warn('ensureOrganizationFromClerk: missing owner', { clerkOrganizationId });
			return null;
		}
		const publicMetadata = (clerkOrg.publicMetadata || {}) as Record<string, unknown>;
		const planId = typeof publicMetadata.planId === 'string' ? publicMetadata.planId : undefined;
		const tokenPoolStrategy = typeof publicMetadata.tokenPoolStrategy === 'string' ? publicMetadata.tokenPoolStrategy : undefined;
		const seatLimitMeta = publicMetadata.seatLimit;
		const seatLimit = typeof seatLimitMeta === 'number' ? seatLimitMeta : typeof clerkOrg.maxAllowedMemberships === 'number' ? clerkOrg.maxAllowedMemberships : undefined;
		const fallbackSlug = `team-${clerkOrganizationId.slice(-6)}`;
		const saved = await upsertOrganization({
			clerkOrganizationId,
			name: clerkOrg.name ?? 'Team Workspace',
			slug: clerkOrg.slug ?? fallbackSlug,
			ownerUserId,
			planId,
			seatLimit: seatLimit ?? null,
			tokenPoolStrategy,
		});
		return saved?.id ?? null;
	} catch (err: unknown) {
		Logger.warn('ensureOrganizationFromClerk failed', { clerkOrganizationId, error: toError(err).message });
		return null;
	}
}

export async function upsertOrganization(snapshot: OrganizationSnapshot) {
	const { clerkOrganizationId } = snapshot;
	if (!clerkOrganizationId) {
		Logger.warn('upsertOrganization called without clerkOrganizationId');
		return null;
	}

	const createRequires = snapshot.name && snapshot.slug && snapshot.ownerUserId;
	try {
		const existing = await prisma.organization.findUnique({ where: { clerkOrganizationId } });
		if (existing) {
			const updateData: Record<string, unknown> = {};
			if (snapshot.name) updateData.name = snapshot.name;
			if (snapshot.slug) updateData.slug = snapshot.slug;
			if (snapshot.ownerUserId) updateData.ownerUserId = snapshot.ownerUserId;
			if (snapshot.billingEmail !== undefined) updateData.billingEmail = snapshot.billingEmail;
			if (snapshot.planId !== undefined) updateData.planId = snapshot.planId;
			if (snapshot.seatLimit !== undefined && snapshot.seatLimit !== null) updateData.seatLimit = snapshot.seatLimit;
			updateData.tokenPoolStrategy = 'SHARED_FOR_ORG';
			// Set tokenBalance if provided in snapshot
			if (snapshot.tokenBalance !== undefined && snapshot.tokenBalance !== null) {
				updateData.tokenBalance = snapshot.tokenBalance;
			}

			if (Object.keys(updateData).length === 0) return existing;

			return await prisma.organization.update({
				where: { id: existing.id },
				data: updateData,
			});
		}

		if (!createRequires) {
			Logger.warn('Cannot create organization without name, slug, and owner', { clerkOrganizationId });
			return null;
		}

		return await prisma.organization.create({
			data: {
				clerkOrganizationId,
				name: snapshot.name!,
				slug: snapshot.slug!,
				ownerUserId: snapshot.ownerUserId!,
				billingEmail: snapshot.billingEmail ?? null,
				planId: snapshot.planId ?? null,
				seatLimit: snapshot.seatLimit ?? null,
				tokenPoolStrategy: 'SHARED_FOR_ORG',
				// Initialize tokenBalance from snapshot, default to 0 if not provided
				tokenBalance: snapshot.tokenBalance ?? 0,
			},
		});
	} catch (err: unknown) {
		Logger.error('upsertOrganization failed', { error: toError(err).message, clerkOrganizationId });
		return null;
	}
}

export async function syncOrganizationMembership(snapshot: OrganizationMembershipSnapshot) {
	const organizationId = await getOrganizationId({
		organizationId: snapshot.organizationId,
		clerkOrganizationId: snapshot.clerkOrganizationId,
		organizationSlug: snapshot.organizationSlug,
	});

	if (!organizationId) {
		Logger.warn('syncOrganizationMembership: organization missing', {
			identifiers: {
				organizationId: snapshot.organizationId,
				clerkOrganizationId: snapshot.clerkOrganizationId,
				organizationSlug: snapshot.organizationSlug,
			},
		});
		return null;
	}

	if (!snapshot.userId) {
		Logger.warn('syncOrganizationMembership called without userId', { organizationId });
		return null;
	}

	const role = snapshot.role || 'MEMBER';
	const status = snapshot.status || 'ACTIVE';

	try {
		return await prisma.organizationMembership.upsert({
			where: {
				organizationId_userId: {
					organizationId,
					userId: snapshot.userId,
				},
			},
			create: {
				organizationId,
				userId: snapshot.userId,
				role,
				status,
			},
			update: {
				role,
				status,
			},
		});
	} catch (err: unknown) {
		Logger.error('syncOrganizationMembership failed', { error: toError(err).message, organizationId, userId: snapshot.userId });
		return null;
	}
}

export async function removeOrganizationMembership(args: {
	userId: string;
	organizationId?: string | null;
	clerkOrganizationId?: string | null;
	organizationSlug?: string | null;
}) {
	const organizationId = await getOrganizationId(args);
	if (!organizationId) return false;

	try {
		await prisma.organizationMembership.delete({
			where: {
				organizationId_userId: {
					organizationId,
					userId: args.userId,
				},
			},
		});
		return true;
	} catch (err: unknown) {
		const error = toError(err);
		if (error.message.includes('Record to delete does not exist')) return false;
		Logger.error('removeOrganizationMembership failed', { error: error.message, organizationId, userId: args.userId });
		return false;
	}
}

export async function upsertOrganizationInvite(snapshot: OrganizationInviteSnapshot) {
	const organizationId = await getOrganizationId({
		organizationId: snapshot.organizationId,
		clerkOrganizationId: snapshot.clerkOrganizationId,
		organizationSlug: snapshot.organizationSlug,
	});

	if (!organizationId) {
		Logger.warn('upsertOrganizationInvite: organization missing', {
			identifiers: {
				organizationId: snapshot.organizationId,
				clerkOrganizationId: snapshot.clerkOrganizationId,
				organizationSlug: snapshot.organizationSlug,
			},
		});
		return null;
	}

	if (!snapshot.email) {
		Logger.warn('upsertOrganizationInvite called without email', { organizationId });
		return null;
	}

	const token = snapshot.token || undefined;
	const expiresAt = coerceDate(snapshot.expiresAt);
	const acceptedAt = coerceDate(snapshot.acceptedAt);
	const status = snapshot.status || (acceptedAt ? 'ACCEPTED' : 'PENDING');
	const role = snapshot.role || 'MEMBER';

	try {
		if (token) {
			return await prisma.organizationInvite.upsert({
				where: { token },
				update: {
					email: snapshot.email,
					role,
					status,
					invitedByUserId: snapshot.invitedByUserId ?? null,
					organizationId,
					expiresAt,
					acceptedAt,
				},
				create: {
					token,
					email: snapshot.email,
					role,
					status,
					invitedByUserId: snapshot.invitedByUserId ?? null,
					organizationId,
					expiresAt,
					acceptedAt,
				},
			});
		}

		return await prisma.organizationInvite.create({
			data: {
				organizationId,
				email: snapshot.email,
				role,
				status,
				invitedByUserId: snapshot.invitedByUserId ?? null,
				token: randomUUID(),
				expiresAt,
				acceptedAt,
			},
		});
	} catch (err: unknown) {
		Logger.error('upsertOrganizationInvite failed', { error: toError(err).message, organizationId, email: snapshot.email });
		return null;
	}
}

export async function expireOrganizationInvite(token: string) {
	if (!token) return null;
	try {
		return await prisma.organizationInvite.update({
			where: { token },
			data: {
				status: 'EXPIRED',
				expiresAt: new Date(),
			},
		});
	} catch (err: unknown) {
		const error = toError(err);
		if (error.message.includes('Record to update does not exist')) return null;
		Logger.error('expireOrganizationInvite failed', { error: error.message, token });
		return null;
	}
}

export async function markInviteAccepted(token: string, userId?: string) {
	if (!token) return null;
	try {
		return await prisma.organizationInvite.update({
			where: { token },
			data: {
				status: 'ACCEPTED',
				acceptedAt: new Date(),
				// Keep invitedBy reference for auditing; membership creation handles userId linkage
			},
		});
	} catch (err: unknown) {
		Logger.error('markInviteAccepted failed', { error: toError(err).message, token, userId });
		return null;
	}
}

export async function provisionMemberEntitlements(userId: string, organizationId: string | undefined | null) {
	if (!userId || !organizationId) return null;

	// Fixed Pool Strategy: We do NOT add tokens when a member joins.
	// The organization token limit is determined solely by the plan.
	// This function is kept for future entitlements (e.g. per-user feature flags).
	return 'SKIPPED_FIXED_POOL';
}

type TokenCreditClient = Prisma.TransactionClient | typeof prisma;

function getDB(tx?: Prisma.TransactionClient): TokenCreditClient {
	return tx ?? prisma;
}

export async function creditOrganizationSharedTokens(opts: { organizationId: string; amount: number; tx?: Prisma.TransactionClient }) {
	const { organizationId, amount, tx } = opts;
	if (!organizationId || !Number.isFinite(amount) || amount <= 0) {
		return false;
	}
	const db = getDB(tx);
	await db.organization.update({
		where: { id: organizationId },
		data: { tokenBalance: { increment: amount } },
	});
	return true;
}

export async function resetOrganizationSharedTokens(opts: { organizationId: string; tx?: Prisma.TransactionClient }) {
	const { organizationId, tx } = opts;
	if (!organizationId) return false;
	const db = getDB(tx);
	try {
		await db.organization.update({
			where: { id: organizationId },
			data: { tokenBalance: 0 },
		});
		return true;
	} catch (err: unknown) {
		Logger.warn('resetOrganizationSharedTokens failed', { organizationId, error: toError(err).message });
		return false;
	}
}

export async function deleteOrganizationByClerkId(clerkOrganizationId: string) {
	if (!clerkOrganizationId) return false;
	let clerkAttempted = false;
	try {
		clerkAttempted = true;
		try {
			const client = await clerkClient();
			await client.organizations.deleteOrganization(clerkOrganizationId);
			Logger.info('deleteOrganizationByClerkId: deleted Clerk organization', { clerkOrganizationId });
		} catch (err: unknown) {
			const e = toError(err);
			if (e.message && e.message.toLowerCase().includes('not found')) {
				Logger.info('deleteOrganizationByClerkId: Clerk organization not found, continuing', { clerkOrganizationId });
			} else {
				Logger.warn('deleteOrganizationByClerkId: failed to delete Clerk organization, continuing with local delete', { clerkOrganizationId, error: e.message });
			}
		}

		await prisma.organization.delete({ where: { clerkOrganizationId } });
		return true;
	} catch (err: unknown) {
		const error = toError(err);
		if (error.message.includes('Record to delete does not exist')) return false;
		Logger.error('deleteOrganizationByClerkId failed', { error: error.message, clerkOrganizationId, clerkAttempted });
		return false;
	}
}
