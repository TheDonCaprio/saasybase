"use client";

import { useVisitTracking } from '../hooks/useVisitTracking';

interface VisitTrackerProps {
	measurementId?: string;
}

export default function VisitTracker({ measurementId }: VisitTrackerProps) {
	useVisitTracking(measurementId);
	return null;
}
