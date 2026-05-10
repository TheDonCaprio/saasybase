export const TOKEN_BALANCES_UPDATED_EVENT = 'saasybase:token-balances-updated';

export type TokenBalancesUpdatedDetail = {
	bucket: 'paid' | 'free' | 'shared';
	organizationId?: string | null;
	balances?: {
		paid?: number | null;
		free?: number | null;
		shared?: number | null;
		sharedPool?: number | null;
	} | null;
};

export function emitTokenBalancesUpdated(detail: TokenBalancesUpdatedDetail) {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(new CustomEvent<TokenBalancesUpdatedDetail>(TOKEN_BALANCES_UPDATED_EVENT, { detail }));
}