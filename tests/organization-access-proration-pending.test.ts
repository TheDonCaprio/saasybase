import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	subscription: {
		findFirst: vi.fn(),
	},
	organization: {
		findFirst: vi.fn(),
	},
	organizationMembership: {
		findFirst: vi.fn(),
	},
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../lib/settings', () => ({ getPaidTokensNaturalExpiryGraceHours: vi.fn(async () => 24) }));
vi.mock('../lib/teams', () => ({ upsertOrganization: vi.fn(), syncOrganizationMembership: vi.fn() }));
vi.mock('../lib/workspace-service', () => ({ workspaceService: {} }));

import { getActiveTeamSubscription, getOrganizationAccessSummary } from '../lib/organization-access';

describe('Organization access excludes provisional switch-now subscriptions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.subscription.findFirst.mockResolvedValue(null);
		prismaMock.organization.findFirst.mockResolvedValue(null);
		prismaMock.organizationMembership.findFirst.mockResolvedValue(null);
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

	it('returns providerOrganizationId for member access summaries', async () => {
		prismaMock.subscription.findFirst
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({
				id: 'sub_owner_1',
				plan: { id: 'plan_team' },
			});
		prismaMock.organizationMembership.findFirst.mockResolvedValue({
			organizationId: 'org_1',
			role: 'MEMBER',
			status: 'ACTIVE',
			organization: {
				id: 'org_1',
				name: 'Acme Team',
				ownerUserId: 'owner_1',
				providerOrganizationId: 'provider_org_1',
			},
		});

		const access = await getOrganizationAccessSummary('user_2');

		expect(access).toMatchObject({
			allowed: true,
			kind: 'MEMBER',
			membership: {
				organizationId: 'org_1',
				providerOrganizationId: 'provider_org_1',
				ownerUserId: 'owner_1',
				role: 'MEMBER',
				status: 'ACTIVE',
			},
		});
	});
});