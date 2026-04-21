import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/lib/prisma-client';
import { prisma } from './prisma';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import { workspaceService } from './workspace-service';

export type OrganizationSnapshot = {
	providerOrganizationId?: string | null;
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
	providerOrganizationId?: string | null;
	organizationSlug?: string | null;
	role?: string | null;
	status?: string | null;
};

export type OrganizationInviteSnapshot = {
	email: string;
	token?: string | null;
	organizationId?: string | null;
	providerOrganizationId?: string | null;
	organizationSlug?: string | null;
	role?: string | null;
	status?: string | null;
	invitedByUserId?: string | null;
	expiresAt?: Date | string | number | null;
	acceptedAt?: Date | string | number | null;
};

type Identifiers = {
	organizationId?: string | null;
	providerOrganizationId?: string | null;
	organizationSlug?: string | null;
};

function getProviderOrganizationId(value: { providerOrganizationId?: string | null }) {
	return value.providerOrganizationId ?? null;
}

const VALID_TOKEN_POOL_STRATEGIES = new Set(['SHARED_FOR_ORG', 'ALLOCATED_PER_MEMBER']);

function normalizeTokenPoolStrategy(strategy?: string | null) {
	const normalized = strategy?.trim().toUpperCase();
	if (!normalized || !VALID_TOKEN_POOL_STRATEGIES.has(normalized)) {
		return null;
	}
	return normalized as 'SHARED_FOR_ORG' | 'ALLOCATED_PER_MEMBER';
}

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
	const { organizationId, organizationSlug } = identifiers;
	const normalizedProviderOrganizationId = getProviderOrganizationId(identifiers);
	try {
		if (organizationId) {
			const existing = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
			if (existing) return existing.id;
		}
		if (normalizedProviderOrganizationId) {
			const existing = await prisma.organization.findUnique({ where: { providerOrganizationId: normalizedProviderOrganizationId }, select: { id: true } });
			if (existing) return existing.id;
		}
		if (organizationSlug) {
			const existing = await prisma.organization.findUnique({ where: { slug: organizationSlug }, select: { id: true } });
			if (existing) return existing.id;
		}
		if (normalizedProviderOrganizationId) {
			const ensuredId = await ensureOrganizationFromProvider(normalizedProviderOrganizationId);
			if (ensuredId) return ensuredId;
		}
	} catch (err: unknown) {
		Logger.warn('getOrganizationId failed', { error: toError(err).message, identifiers });
	}
	return null;
}

async function ensureOrganizationFromProvider(providerOrganizationId: string): Promise<string | null> {
	try {
		const authOrg = await workspaceService.getProviderOrganization(providerOrganizationId);
		if (!authOrg) {
			Logger.warn('ensureOrganizationFromProvider: org not found via auth provider', { providerOrganizationId });
			return null;
		}
		const ownerUserId = authOrg.createdBy;
		if (!ownerUserId) {
			Logger.warn('ensureOrganizationFromProvider: missing owner', { providerOrganizationId });
			return null;
		}
		const publicMetadata = (authOrg.publicMetadata || {}) as Record<string, unknown>;
		const planId = typeof publicMetadata.planId === 'string' ? publicMetadata.planId : undefined;
		const tokenPoolStrategy = typeof publicMetadata.tokenPoolStrategy === 'string' ? publicMetadata.tokenPoolStrategy : undefined;
		const seatLimitMeta = publicMetadata.seatLimit;
		const seatLimit = typeof seatLimitMeta === 'number' ? seatLimitMeta : typeof authOrg.maxAllowedMemberships === 'number' ? authOrg.maxAllowedMemberships : undefined;
		const fallbackSlug = `team-${providerOrganizationId.slice(-6)}`;
		const saved = await upsertOrganization({
			providerOrganizationId,
			name: authOrg.name ?? 'Team Workspace',
			slug: authOrg.slug ?? fallbackSlug,
			ownerUserId,
			planId,
			seatLimit: seatLimit ?? null,
			tokenPoolStrategy,
		});
		return saved?.id ?? null;
	} catch (err: unknown) {
		Logger.warn('ensureOrganizationFromProvider failed', { providerOrganizationId, error: toError(err).message });
		return null;
	}
}

export async function upsertOrganization(snapshot: OrganizationSnapshot) {
	const providerOrganizationId = getProviderOrganizationId(snapshot);
	if (!providerOrganizationId) {
		Logger.warn('upsertOrganization called without providerOrganizationId');
		return null;
	}

	const createRequires = snapshot.name && snapshot.slug && snapshot.ownerUserId;
	try {
		const existing = await prisma.organization.findUnique({ where: { providerOrganizationId: providerOrganizationId } });
		if (existing) {
			const updateData: Record<string, unknown> = {};
			const normalizedTokenPoolStrategy = normalizeTokenPoolStrategy(snapshot.tokenPoolStrategy);
			if (snapshot.name) updateData.name = snapshot.name;
			if (snapshot.slug) updateData.slug = snapshot.slug;
			if (snapshot.ownerUserId) updateData.ownerUserId = snapshot.ownerUserId;
			if (snapshot.billingEmail !== undefined) updateData.billingEmail = snapshot.billingEmail;
			if (snapshot.planId !== undefined) updateData.planId = snapshot.planId;
			if (snapshot.seatLimit !== undefined && snapshot.seatLimit !== null) updateData.seatLimit = snapshot.seatLimit;
			if (normalizedTokenPoolStrategy) updateData.tokenPoolStrategy = normalizedTokenPoolStrategy;
			updateData.suspendedAt = null;
			updateData.suspensionReason = null;
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
			Logger.warn('Cannot create organization without name, slug, and owner', { providerOrganizationId });
			return null;
		}

		return await prisma.organization.create({
			data: {
				providerOrganizationId: providerOrganizationId,
				name: snapshot.name!,
				slug: snapshot.slug!,
				ownerUserId: snapshot.ownerUserId!,
				billingEmail: snapshot.billingEmail ?? null,
				suspendedAt: null,
				suspensionReason: null,
				planId: snapshot.planId ?? null,
				seatLimit: snapshot.seatLimit ?? null,
				tokenPoolStrategy: normalizeTokenPoolStrategy(snapshot.tokenPoolStrategy) ?? 'SHARED_FOR_ORG',
				// Initialize tokenBalance from snapshot, default to 0 if not provided
				tokenBalance: snapshot.tokenBalance ?? 0,
			},
		});
	} catch (err: unknown) {
		Logger.error('upsertOrganization failed', { error: toError(err).message, providerOrganizationId });
		return null;
	}
}

export async function syncOrganizationMembership(snapshot: OrganizationMembershipSnapshot) {
	const organizationId = await getOrganizationId({
		organizationId: snapshot.organizationId,
		providerOrganizationId: snapshot.providerOrganizationId,
		organizationSlug: snapshot.organizationSlug,
	});

	if (!organizationId) {
		Logger.warn('syncOrganizationMembership: organization missing', {
			identifiers: {
				organizationId: snapshot.organizationId,
				providerOrganizationId: snapshot.providerOrganizationId,
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
	providerOrganizationId?: string | null;
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
		providerOrganizationId: snapshot.providerOrganizationId,
		organizationSlug: snapshot.organizationSlug,
	});

	if (!organizationId) {
		Logger.warn('upsertOrganizationInvite: organization missing', {
			identifiers: {
				organizationId: snapshot.organizationId,
				providerOrganizationId: snapshot.providerOrganizationId,
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
	const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
	const expiresAt = coerceDate(snapshot.expiresAt) ?? new Date(Date.now() + INVITE_TTL_MS);
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

	const db = getDB();
	const org = await db.organization.findUnique({
		where: { id: organizationId },
		select: {
			tokenPoolStrategy: true,
			plan: { select: { tokenLimit: true } },
		},
	});

	if (!org) return null;

	const strategy = (org.tokenPoolStrategy || 'SHARED_FOR_ORG').toUpperCase();
	if (strategy === 'ALLOCATED_PER_MEMBER') {
		const tokenLimit = typeof org.plan?.tokenLimit === 'number' ? org.plan.tokenLimit : 0;
		if (tokenLimit > 0) {
			await db.organizationMembership.updateMany({
				where: { userId, organizationId, status: 'ACTIVE' },
				data: { sharedTokenBalance: tokenLimit },
			});
			return 'ALLOCATED_PER_MEMBER';
		}
	}

	// SHARED_FOR_ORG (default): We do NOT add tokens when a member joins.
	// The organization token limit is determined solely by the plan.
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
		// Also reset per-member balances for ALLOCATED_PER_MEMBER strategy
		await db.organizationMembership.updateMany({
			where: { organizationId, status: 'ACTIVE' },
			data: { sharedTokenBalance: 0 },
		});
		return true;
	} catch (err: unknown) {
		Logger.warn('resetOrganizationSharedTokens failed', { organizationId, error: toError(err).message });
		return false;
	}
}

/**
 * Credit tokens to all active members for ALLOCATED_PER_MEMBER strategy.
 * Each active member receives `amount` tokens added to their sharedTokenBalance.
 */
export async function creditAllocatedPerMemberTokens(opts: { organizationId: string; amount: number; tx?: Prisma.TransactionClient }) {
	const { organizationId, amount, tx } = opts;
	if (!organizationId || !Number.isFinite(amount) || amount <= 0) {
		return false;
	}
	const db = getDB(tx);
	const result = await db.organizationMembership.updateMany({
		where: { organizationId, status: 'ACTIVE' },
		data: { sharedTokenBalance: { increment: amount } },
	});
	Logger.info('creditAllocatedPerMemberTokens', { organizationId, amount, membersUpdated: result.count });
	return true;
}

/**
 * Reset per-member balances and re-credit for ALLOCATED_PER_MEMBER strategy (renewal).
 */
export async function resetAllocatedPerMemberTokens(opts: { organizationId: string; amount: number; tx?: Prisma.TransactionClient }) {
	const { organizationId, amount, tx } = opts;
	if (!organizationId) return false;
	const db = getDB(tx);
	try {
		await db.organizationMembership.updateMany({
			where: { organizationId, status: 'ACTIVE' },
			data: { sharedTokenBalance: amount },
		});
		Logger.info('resetAllocatedPerMemberTokens', { organizationId, newBalance: amount });
		return true;
	} catch (err: unknown) {
		Logger.warn('resetAllocatedPerMemberTokens failed', { organizationId, error: toError(err).message });
		return false;
	}
}

export async function deleteOrganizationByProviderId(providerOrganizationId: string) {
	if (!providerOrganizationId) return false;
	let providerDeletionAttempted = false;
	try {
		// Detach any historical references before deletion; otherwise FK constraints can
		// prevent local deletion (payments/subscriptions may outlive the org).
		const existing = await prisma.organization.findUnique({
			where: { providerOrganizationId: providerOrganizationId },
			select: { id: true },
		});
		if (existing?.id) {
			try {
				await prisma.subscription.updateMany({
					where: { organizationId: existing.id },
					data: { organizationId: null },
				});
			} catch (err: unknown) {
				Logger.warn('deleteOrganizationByProviderId: failed to detach subscriptions', {
					providerOrganizationId,
					error: toError(err).message,
				});
			}

			try {
				await prisma.payment.updateMany({
					where: { organizationId: existing.id },
					data: { organizationId: null },
				});
			} catch (err: unknown) {
				Logger.warn('deleteOrganizationByProviderId: failed to detach payments', {
					providerOrganizationId,
					error: toError(err).message,
				});
			}
		}

		providerDeletionAttempted = true;
		try {
			await workspaceService.deleteProviderOrganization(providerOrganizationId);
			Logger.info('deleteOrganizationByProviderId: deleted auth provider organization', { providerOrganizationId });
		} catch (err: unknown) {
			const e = toError(err);
			if (e.message && e.message.toLowerCase().includes('not found')) {
				Logger.info('deleteOrganizationByProviderId: provider organization not found, continuing', { providerOrganizationId });
			} else {
				Logger.warn('deleteOrganizationByProviderId: failed to delete provider organization, continuing with local delete', { providerOrganizationId, error: e.message });
			}
		}

		await prisma.organization.delete({ where: { providerOrganizationId: providerOrganizationId } });
		return true;
	} catch (err: unknown) {
		const error = toError(err);
		if (error.message.includes('Record to delete does not exist')) return false;
		Logger.error('deleteOrganizationByProviderId failed', { error: error.message, providerOrganizationId, providerDeletionAttempted });
		return false;
	}
}

