import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	subscription: {
		findFirst: vi.fn(),
	},
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../lib/settings', () => ({ getPaidTokensNaturalExpiryGraceHours: vi.fn(async () => 24) }));
vi.mock('../lib/teams', () => ({ upsertOrganization: vi.fn(), syncOrganizationMembership: vi.fn() }));
vi.mock('../lib/workspace-service', () => ({ workspaceService: {} }));

import { getActiveTeamSubscription } from '../lib/organization-access';

describe('Organization access excludes provisional switch-now subscriptions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.subscription.findFirst.mockResolvedValue(null);
	});

	it('filters out pending subscriptions that are still awaiting Paystack switch-now confirmation', async () => {
		await getActiveTeamSubscription('user_1', { includeGrace: false });

		expect(prismaMock.subscription.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					NOT: {
						status: 'PENDING',
						prorationPendingSince: { not: null },
					},
				}),
			}),
		);
	});
});