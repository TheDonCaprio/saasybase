/**
 * Warning notice shown when user is in a team workspace with active plans.
 * Informs them they should cancel the plan before attempting to delete the organization.
 */
'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import Link from 'next/link';

export function TeamPlanDeletionWarning() {
	const [hasActivePlans, setHasActivePlans] = useState(false);
	const [inTeamWorkspace, setInTeamWorkspace] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const checkEligibility = async () => {
			try {
				const res = await fetch('/api/organization/check-deletion-eligibility');
				if (!res.ok) throw new Error('Failed to check deletion eligibility');
				const data = await res.json();
				setHasActivePlans(data.hasActivePlans);
				setInTeamWorkspace(data.canDelete !== undefined); // If we got a response, user is in a workspace
			} catch (err) {
				console.error('Failed to check team plan status:', err);
			} finally {
				setLoading(false);
			}
		};

		checkEligibility();
	}, []);

	if (loading || !inTeamWorkspace || !hasActivePlans) {
		return null;
	}

	return (
		<div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
			<FontAwesomeIcon
				icon={faTriangleExclamation}
				className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-500"
			/>
			<div className="flex-1 space-y-1">
				<p className="text-sm font-medium text-amber-900 dark:text-amber-100">
					This workspace has an active team plan
				</p>
				<p className="text-xs text-amber-800 dark:text-amber-200">
					To delete this organization, you must first{' '}
					<Link
						href="/dashboard/billing"
						className="underline hover:opacity-80 font-semibold"
					>
						cancel the team plan
					</Link>
					.
				</p>
			</div>
		</div>
	);
}
