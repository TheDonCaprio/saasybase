import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.hoisted(() => vi.fn());
const getOrganizationActiveTeamPlansMock = vi.hoisted(() => vi.fn());
const deleteOrganizationByProviderIdMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
	organization: {
		findFirst: vi.fn(),
		delete: vi.fn(),
	},
	subscription: {
		updateMany: vi.fn(),
	},
	payment: {
		updateMany: vi.fn(),
	},
}));

vi.mock('../lib/auth-provider/service', () => ({
	authService: {
		getSession: getSessionMock,
	},
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('../lib/teams', () => ({
	getOrganizationActiveTeamPlans: getOrganizationActiveTeamPlansMock,
	deleteOrganizationByProviderId: deleteOrganizationByProviderIdMock,
}));

vi.mock('../lib/logger', () => ({
	Logger: {
		error: loggerErrorMock,
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	},
}));

import { DELETE } from '../app/api/organization/delete/route';

describe('DELETE /api/organization/delete', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getSessionMock.mockResolvedValue({ userId: 'user_1' });
		getOrganizationActiveTeamPlansMock.mockResolvedValue(null);
		deleteOrganizationByProviderIdMock.mockResolvedValue(true);
		prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
		prismaMock.payment.updateMany.mockResolvedValue({ count: 0 });
		prismaMock.organization.delete.mockResolvedValue({ id: 'org_1' });
	});

	it('blocks deletion when the user is not authenticated', async () => {
		getSessionMock.mockResolvedValueOnce({ userId: null });

		const response = await DELETE(new Request('http://localhost/api/organization/delete', {
			method: 'DELETE',
			body: JSON.stringify({ organizationId: 'org_1' }),
			headers: { 'Content-Type': 'application/json' },
		}) as never);
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toBe('Unauthorized');
	});

	it('blocks deletion when the current user does not own the organization', async () => {
		prismaMock.organization.findFirst.mockResolvedValueOnce(null);

		const response = await DELETE(new Request('http://localhost/api/organization/delete', {
			method: 'DELETE',
			body: JSON.stringify({ organizationId: 'org_1' }),
			headers: { 'Content-Type': 'application/json' },
		}) as never);
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error).toBe('Organization not found');
	});

	it('blocks deletion when an active team plan still exists', async () => {
		prismaMock.organization.findFirst.mockResolvedValueOnce({
			id: 'org_1',
			name: 'Acme',
			slug: 'acme',
			providerOrganizationId: 'provider_org_1',
		});
		getOrganizationActiveTeamPlansMock.mockResolvedValueOnce([
			{ plan: { name: 'Team Pro' } },
		]);

		const response = await DELETE(new Request('http://localhost/api/organization/delete', {
			method: 'DELETE',
			body: JSON.stringify({ organizationId: 'org_1' }),
			headers: { 'Content-Type': 'application/json' },
		}) as never);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.hasActivePlans).toBe(true);
		expect(body.planNames).toEqual(['Team Pro']);
		expect(deleteOrganizationByProviderIdMock).not.toHaveBeenCalled();
	});

	it('deletes the organization through the provider-backed helper when no active plan remains', async () => {
		prismaMock.organization.findFirst.mockResolvedValueOnce({
			id: 'org_1',
			name: 'Acme',
			slug: 'acme',
			providerOrganizationId: 'provider_org_1',
		});

		const response = await DELETE(new Request('http://localhost/api/organization/delete', {
			method: 'DELETE',
			body: JSON.stringify({ organizationId: 'org_1' }),
			headers: { 'Content-Type': 'application/json' },
		}) as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ ok: true, deletedOrganizationId: 'org_1' });
		expect(deleteOrganizationByProviderIdMock).toHaveBeenCalledWith('provider_org_1');
	});

	it('falls back to local deletion when the organization has no provider organization id', async () => {
		prismaMock.organization.findFirst.mockResolvedValueOnce({
			id: 'org_1',
			name: 'Acme',
			slug: 'acme',
			providerOrganizationId: null,
		});

		const response = await DELETE(new Request('http://localhost/api/organization/delete', {
			method: 'DELETE',
			body: JSON.stringify({ organizationId: 'org_1' }),
			headers: { 'Content-Type': 'application/json' },
		}) as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ ok: true, deletedOrganizationId: 'org_1' });
		expect(deleteOrganizationByProviderIdMock).not.toHaveBeenCalled();
		expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
			where: { organizationId: 'org_1' },
			data: { organizationId: null },
		});
		expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
			where: { organizationId: 'org_1' },
			data: { organizationId: null },
		});
		expect(prismaMock.organization.delete).toHaveBeenCalledWith({ where: { id: 'org_1' } });
	});
});