'use client';

import { useUserProfile } from '@/components/UserProfileProvider';

type SaaSyAppHeaderTokenStatValueProps = {
	kind: 'personal' | 'workspace';
	initialValue: string;
	isTeamWorkspace: boolean;
	orgTokenName: string;
	hasUnlimitedWorkspaceTokens: boolean;
};

export function SaaSyAppHeaderTokenStatValue({
	kind,
	initialValue,
	isTeamWorkspace,
	orgTokenName,
	hasUnlimitedWorkspaceTokens,
}: SaaSyAppHeaderTokenStatValueProps) {
	const { profile, loaded } = useUserProfile();

	if (!loaded || !profile) {
		return <>{initialValue}</>;
	}

	if (kind === 'personal') {
		if (isTeamWorkspace) {
			return <>Unavailable</>;
		}

		const paidUnlimited = Boolean(profile.subscription?.tokens.isUnlimited || profile.paidTokens?.isUnlimited);
		const paidBalance = Math.max(0, Number(profile.subscription?.tokens.remaining ?? profile.paidTokens?.remaining ?? 0));
		const freeBalance = Math.max(0, Number(profile.freeTokens?.remaining ?? 0));

		return <>{paidUnlimited ? `Unlimited paid · ${freeBalance.toLocaleString()} free` : `${paidBalance.toLocaleString()} paid · ${freeBalance.toLocaleString()} free`}</>;
	}

	if (!isTeamWorkspace) {
		return <>Unavailable</>;
	}

	if (hasUnlimitedWorkspaceTokens) {
		return <>{`Unlimited ${orgTokenName}`}</>;
	}

	const sharedBalance = Math.max(0, Number(profile.sharedTokens?.remaining ?? 0));
	const tokenName = profile.sharedTokens?.tokenName?.trim() || orgTokenName;

	return <>{`${sharedBalance.toLocaleString()} ${tokenName}`}</>;
}