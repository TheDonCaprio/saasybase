// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const replaceMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const useAuthSessionMock = vi.hoisted(() => vi.fn());
const refreshVisibleRouteMock = vi.hoisted(() => vi.fn());

vi.mock('next/link', () => ({
	default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
		<a href={href} {...rest}>{children}</a>
	),
}));

vi.mock('next/navigation', () => ({
	useRouter: () => ({
		replace: replaceMock,
		refresh: refreshMock,
	}),
}));

vi.mock('../lib/auth-provider/client', () => ({
	useAuthSession: useAuthSessionMock,
}));

vi.mock('../lib/client-route-revalidation', () => ({
	refreshVisibleRoute: refreshVisibleRouteMock,
}));

vi.mock('../components/team/TeamMembersList', () => ({
	TeamMembersList: () => <div data-testid="team-members-list" />,
}));

vi.mock('../components/team/InviteAcceptanceClient', () => ({
	InviteAcceptanceClient: () => <div data-testid="invite-acceptance" />,
}));

vi.mock('../components/team/SharedTokenCapsModal', () => ({
	SharedTokenCapsModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="shared-token-caps-modal" /> : null,
}));

vi.mock('../components/team/InviteTeammatesModal', () => ({
	InviteTeammatesModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="invite-teammates-modal" /> : null,
}));

import { TeamManagementClient } from '../components/team/TeamManagementClient';

describe('TeamManagementClient delete organization modal', () => {
	let root: Root | null = null;

	beforeEach(() => {
		vi.clearAllMocks();
		useAuthSessionMock.mockReturnValue({ orgId: 'org_1' });
		replaceMock.mockReset();
		refreshMock.mockReset();
		refreshVisibleRouteMock.mockReset();
		window.history.replaceState({}, '', '/dashboard/team');
	});

	afterEach(async () => {
		if (root) {
			await act(async () => {
				root?.unmount();
			});
			root = null;
		}

		vi.unstubAllGlobals();
		document.body.innerHTML = '';
	});

	async function render(ui: React.ReactElement) {
		const container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(ui);
		});

		await act(async () => {
			await Promise.resolve();
		});

		return container;
	}

	function buildState() {
		return {
			access: {
				allowed: true,
				kind: 'OWNER',
				subscription: {
					id: 'sub_1',
					status: 'ACTIVE',
					expiresAt: '2999-01-01T00:00:00.000Z',
				},
				plan: { id: 'plan_team' },
			},
			organization: {
				id: 'org_1',
				providerOrganizationId: 'provider_org_1',
				name: 'Acme Workspace',
				slug: 'acme-workspace',
				ownerUserId: 'user_1',
				planId: 'plan_team',
				planName: 'Team',
				planTokenName: 'tokens',
				seatLimit: 5,
				tokenPoolStrategy: 'SHARED_FOR_ORG',
				memberTokenCap: null,
				memberCapStrategy: 'SOFT',
				memberCapResetIntervalHours: null,
				ownerExemptFromCaps: false,
				createdAt: '2024-01-01T00:00:00.000Z',
				members: [],
				invites: [],
				stats: {
					memberCount: 1,
					inviteCount: 0,
					seatsRemaining: 4,
				},
			},
		} as const;
	}

	function installFetchMock(eligibilityResponses: Array<{ canDelete: boolean; hasActivePlans: boolean; planNames?: string[] }>) {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);

			if (url.startsWith('/api/team/summary')) {
				return new Response(JSON.stringify({ ok: true, ...buildState() }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			if (url.startsWith('/api/organization/check-deletion-eligibility')) {
				const nextResponse = eligibilityResponses.shift() ?? { canDelete: true, hasActivePlans: false, planNames: [] };
				return new Response(JSON.stringify(nextResponse), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			if (url === '/api/organization/delete') {
				return new Response(JSON.stringify({ ok: true, deletedOrganizationId: 'org_1' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			if (url === '/api/user/active-org') {
				return new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			throw new Error(`Unexpected fetch: ${url} ${init?.method ?? 'GET'}`);
		});

		vi.stubGlobal('fetch', fetchMock);
		return fetchMock;
	}

	async function click(element: Element | null | undefined) {
		await act(async () => {
			element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		});
	}

	it('disables confirm while an active team plan blocks deletion, then redirects after a valid delete', async () => {
		const fetchMock = installFetchMock([
			{ canDelete: false, hasActivePlans: true, planNames: ['Team Pro'] },
			{ canDelete: true, hasActivePlans: false, planNames: [] },
		]);

		const container = await render(
			<TeamManagementClient
				initialState={buildState()}
				viewer={{ id: 'user_1', name: 'Owner', email: 'owner@example.com' }}
				pendingInvitesForViewer={[]}
			/>,
		);

		const deleteTrigger = Array.from(container.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Delete organization');
		expect(deleteTrigger).toBeTruthy();

		await click(deleteTrigger);

		const blockedConfirm = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent?.includes('Delete organization')) as HTMLButtonElement | undefined;
		expect(document.body.textContent).toContain('This workspace has an active team plan.');
		expect(blockedConfirm?.disabled).toBe(true);

		const closeButton = Array.from(document.body.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Close');
		await click(closeButton);

		await click(deleteTrigger);

		const enabledConfirm = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent?.includes('Delete organization')) as HTMLButtonElement | undefined;
		expect(document.body.textContent).toContain('The confirm button is enabled because this workspace no longer has an active team plan attached.');
		expect(enabledConfirm?.disabled).toBe(false);

		await click(enabledConfirm);

		expect(fetchMock).toHaveBeenCalledWith('/api/organization/delete', expect.objectContaining({ method: 'DELETE' }));
		expect(fetchMock).toHaveBeenCalledWith('/api/user/active-org', expect.objectContaining({ method: 'POST' }));
		expect(replaceMock).toHaveBeenCalledWith('/dashboard/team?orgDeleted=1');
		expect(refreshMock).toHaveBeenCalled();
	});
});