import { NextResponse } from 'next/server';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { Logger } from '../../../../../../lib/logger';
import { toError } from '../../../../../../lib/runtime-guards';
import { recordAdminAction } from '../../../../../../lib/admin-actions';
import { notifyExpiredSubscriptions } from '../../../../../../lib/notifications';
import { shouldClearPaidTokensOnExpiry } from '../../../../../../lib/paidTokens';
import { syncOrganizationEligibilityForUser } from '../../../../../../lib/organization-access';
import { resetOrganizationSharedTokens } from '../../../../../../lib/teams';

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
 	let actorContext;
	try {
		actorContext = await requireAdminOrModerator('subscriptions');
	} catch (error: unknown) {
		const guard = toAuthGuardErrorResponse(error);
		if (guard) return guard;
		throw error;
	}
	const { userId: actorId, role: actorRole } = actorContext;
	const params = await context.params;
	const subscriptionId = params.id;
	// Try to parse an optional clearPaidTokens flag from the request body
	let clearPaidTokens = false;
	try {
		const body = await (_req.json ? _req.json() : Promise.resolve({})).catch(() => ({}));
		clearPaidTokens = body?.clearPaidTokens === true;
	} catch {
		// ignore and default to false
	}

	try {
		// Load full subscription record so we can consult any recorded admin intent
		const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });

		if (!subscription) {
			return NextResponse.json({ ok: false, error: 'Subscription not found' }, { status: 404 });
		}

		if (subscription.status === 'EXPIRED') {
			return NextResponse.json({ ok: true, alreadyExpired: true });
		}

		const subscriptionProviderName = subscription.paymentProvider ?? null;
		const providerSubscriptionId = subscription.externalSubscriptionId ?? null;

		const now = new Date();
		const resolvedExpiresAt = subscription.expiresAt && subscription.expiresAt <= now ? subscription.expiresAt : new Date(now.getTime());
		const resolvedCanceledAt = subscription.canceledAt ?? new Date(now.getTime());

		const updated = await prisma.subscription.update({
			where: { id: subscriptionId },
			data: {
				status: 'EXPIRED',
				clearPaidTokensOnExpiry: clearPaidTokens,
				expiresAt: resolvedExpiresAt,
				canceledAt: resolvedCanceledAt
			},
			select: { id: true, userId: true }
		});

			try {
				// Centralized decision: honor explicit request flag first, then any recorded intent
				// on the subscription, and finally the per-user/global setting.
				const shouldClear = await shouldClearPaidTokensOnExpiry({ userId: subscription.userId, subscription, requestFlag: clearPaidTokens });
				if (shouldClear) {
					await prisma.user.update({ where: { id: subscription.userId }, data: { tokenBalance: 0 } });

					if (subscription.organizationId) {
						const plan = await prisma.plan.findUnique({ where: { id: subscription.planId }, select: { supportsOrganizations: true } });
						if (plan?.supportsOrganizations) {
							await resetOrganizationSharedTokens({ organizationId: subscription.organizationId });
						}
					}
				} else {
					Logger.info('Skipping paid token clear after admin expire (shouldClear=false)', { subscriptionId, userId: subscription.userId });
				}
			} catch (err: unknown) {
				Logger.warn('Failed to reset token balance after expiring subscription', {
					error: toError(err).message,
					subscriptionId,
					userId: subscription.userId
				});
			}

		try {
			await syncOrganizationEligibilityForUser(subscription.userId, { ignoreGrace: true });
		} catch (err: unknown) {
			const error = toError(err);
			Logger.warn('Failed to sync organization eligibility after admin expire', {
				subscriptionId,
				userId: subscription.userId,
				error: error.message
			});
		}

		notifyExpiredSubscriptions([updated.id]).catch((err: unknown) => {
			const error = toError(err);
			Logger.warn('Failed to send expiration notification after admin expire', {
				subscriptionId,
				error: error.message
			});
		});

		Logger.info('Admin expired subscription', { actorId, subscriptionId });

		await recordAdminAction({
			actorId,
			actorRole,
			action: 'subscriptions.expire',
			targetUserId: subscription.userId,
			targetType: 'subscription',
					details: {
									subscriptionId: subscription.id,
									providerSubscriptionId,
									providerName: subscriptionProviderName,
									previousStatus: subscription.status,
									previousExpiresAt: subscription.expiresAt ? subscription.expiresAt.toISOString() : null,
									previousCanceledAt: subscription.canceledAt ? subscription.canceledAt.toISOString() : null,
									planId: subscription.planId,
									clearPaidTokens: clearPaidTokens
								}
		});

		return NextResponse.json({ ok: true });
	} catch (err: unknown) {
		const error = toError(err);
		Logger.error('Admin expire subscription error', {
			subscriptionId,
			error: error.message,
			stack: error.stack
		});
		return NextResponse.json({ ok: false, error: 'Failed to expire subscription' }, { status: 500 });
	}
}
