import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOrganizationActiveTeamPlans, deleteOrganizationByProviderId } from '@/lib/teams';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
	prisma: {
		organization: {
			findUnique: vi.fn(),
			delete: vi.fn(),
			updateMany: vi.fn(),
		},
		subscription: {
			findMany: vi.fn(),
			updateMany: vi.fn(),
		},
		payment: {
			updateMany: vi.fn(),
		},
	},
}));

vi.mock('@/lib/workspace-service', () => ({
	workspaceService: {
		deleteProviderOrganization: vi.fn(),
	},
}));

vi.mock('@/lib/logger');

describe('Organization Deletion Guards', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getOrganizationActiveTeamPlans', () => {
		it('should return null if no active subscriptions exist', async () => {
			vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({ ownerUserId: 'user-1' } as any);
			vi.mocked(prisma.subscription.findMany).mockResolvedValueOnce([]);

			const result = await getOrganizationActiveTeamPlans('org-123');

			expect(result).toBeNull();
		});

		it('should return null if subscriptions exist but no team plans', async () => {
			vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({ ownerUserId: 'user-1' } as any);
			vi.mocked(prisma.subscription.findMany).mockResolvedValueOnce([
				{
					id: 'sub-1',
					plan: {
						id: 'plan-1',
						name: 'Personal Plan',
						scope: 'INDIVIDUAL',
						supportsOrganizations: false,
					},
				} as any,
			]);

			const result = await getOrganizationActiveTeamPlans('org-123');

			expect(result).toBeNull();
		});

		it('should return active team plans if they exist', async () => {
			vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({ ownerUserId: 'user-1' } as any);
			const mockSubscription = {
				id: 'sub-1',
				plan: {
					id: 'plan-1',
					name: 'Team Pro',
					scope: 'TEAM',
					supportsOrganizations: true,
				},
			};

			vi.mocked(prisma.subscription.findMany).mockResolvedValueOnce([mockSubscription] as any);

			const result = await getOrganizationActiveTeamPlans('org-123');

			expect(result).toEqual([mockSubscription]);
		});

		it('should filter out non-team plans', async () => {
			vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({ ownerUserId: 'user-1' } as any);
			const teamPlan = {
				id: 'sub-1',
				plan: {
					id: 'plan-1',
					name: 'Team Pro',
					scope: 'TEAM',
					supportsOrganizations: true,
				},
			};

			const individualPlan = {
				id: 'sub-2',
				plan: {
					id: 'plan-2',
					name: 'Individual',
					scope: 'INDIVIDUAL',
					supportsOrganizations: false,
				},
			};

			vi.mocked(prisma.subscription.findMany).mockResolvedValueOnce([teamPlan, individualPlan] as any);

			const result = await getOrganizationActiveTeamPlans('org-123');

			expect(result).toEqual([teamPlan]);
		});

		it('should block deletion when team plan is active for owner even if organizationId link is missing', async () => {
			vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({ ownerUserId: 'user-owner' } as any);
			const ownerTeamPlan = {
				id: 'sub-owner-1',
				organizationId: null,
				plan: {
					id: 'plan-team',
					name: 'Team Pro',
					scope: 'TEAM',
					supportsOrganizations: true,
				},
			};

			vi.mocked(prisma.subscription.findMany).mockResolvedValueOnce([ownerTeamPlan] as any);

			const result = await getOrganizationActiveTeamPlans('org-legacy');

			expect(result).toEqual([ownerTeamPlan]);
		});
	});

	describe('deleteOrganizationByProviderId', () => {
		it('should prevent deletion if organization has active team plans', async () => {
			const mockTeamPlan = {
				id: 'sub-1',
				plan: {
					id: 'plan-1',
					name: 'Team Plan',
					scope: 'TEAM',
					supportsOrganizations: true,
				},
			};

			vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
				id: 'org-123',
				providerOrganizationId: 'clerk-org-123',
			} as any);
			vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({ ownerUserId: 'user-1' } as any);

			vi.mocked(prisma.subscription.findMany).mockResolvedValueOnce([mockTeamPlan] as any);

			const result = await deleteOrganizationByProviderId('clerk-org-123');

			expect(result).toBe(false);
			expect(prisma.organization.delete).not.toHaveBeenCalled();
		});

		it('should allow deletion if organization has no team plans', async () => {
			vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
				id: 'org-123',
				providerOrganizationId: 'clerk-org-123',
			} as any);
			vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({ ownerUserId: 'user-1' } as any);

			vi.mocked(prisma.subscription.findMany).mockResolvedValueOnce([]);

			vi.mocked(prisma.subscription.updateMany).mockResolvedValueOnce({ count: 0 });
			vi.mocked(prisma.payment.updateMany).mockResolvedValueOnce({ count: 0 });
			vi.mocked(prisma.organization.delete).mockResolvedValueOnce({} as any);

			const result = await deleteOrganizationByProviderId('clerk-org-123');

			expect(result).toBe(true);
			expect(prisma.organization.delete).toHaveBeenCalledWith({
				where: { providerOrganizationId: 'clerk-org-123' },
			});
		});

		it('should return false when organization delete throws "Record to delete does not exist"', async () => {
			vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce(null);

			vi.mocked(prisma.organization.delete).mockRejectedValueOnce(
				new Error('Record to delete does not exist')
			);

			const result = await deleteOrganizationByProviderId('clerk-org-123');

			expect(result).toBe(false);
		});
	});
});
