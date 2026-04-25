"use client";

import { useVisitTracking } from '../hooks/useVisitTracking';

interface VisitTrackerProps {
	provider: 'google-analytics' | 'posthog';
	measurementId?: string;
	postHogApiKey?: string;
}

export default function VisitTracker({ provider, measurementId, postHogApiKey }: VisitTrackerProps) {
	useVisitTracking({ provider, measurementId, postHogApiKey });
	return null;
}
