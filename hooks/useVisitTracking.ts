"use client";

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

declare global {
	interface Window {
		gtag?: (...args: unknown[]) => void;
	}
}

const isTrackablePath = (pathname: string | null) => {
	if (!pathname) {
		return false;
	}

	return !pathname.startsWith('/admin');
};

export function useVisitTracking(measurementId?: string) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const lastTrackedUrlRef = useRef<string | null>(null);

	useEffect(() => {
		if (!measurementId || !pathname || !isTrackablePath(pathname)) {
			return;
		}

		if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
			return;
		}

		const query = searchParams?.toString();
		const pagePath = `${pathname}${query ? `?${query}` : ''}`;
		const pageLocation = window.location.href;
		const trackingKey = `${pagePath}::${pageLocation}`;

		if (lastTrackedUrlRef.current === trackingKey) {
			return;
		}

		window.gtag('event', 'page_view', {
			page_title: document.title,
			page_location: pageLocation,
			page_path: pagePath,
			send_to: measurementId,
		});

		lastTrackedUrlRef.current = trackingKey;
	}, [measurementId, pathname, searchParams]);
}
