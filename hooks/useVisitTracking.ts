"use client";

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

declare global {
	interface Window {
		gtag?: (...args: unknown[]) => void;
		posthog?: {
			capture?: (eventName: string, properties?: Record<string, unknown>) => void;
		};
	}
}

const isTrackablePath = (pathname: string | null) => {
	if (!pathname) {
		return false;
	}

	return !pathname.startsWith('/admin');
};

interface VisitTrackingConfig {
	provider: 'google-analytics' | 'posthog';
	measurementId?: string;
	postHogApiKey?: string;
}

export function useVisitTracking({ provider, measurementId, postHogApiKey }: VisitTrackingConfig) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const lastTrackedUrlRef = useRef<string | null>(null);

	useEffect(() => {
		if (!pathname || !isTrackablePath(pathname)) {
			return;
		}

		if (typeof window === 'undefined') {
			return;
		}

		const query = searchParams?.toString();
		const pagePath = `${pathname}${query ? `?${query}` : ''}`;
		const pageLocation = window.location.href;
		const trackingKey = `${pagePath}::${pageLocation}`;

		if (lastTrackedUrlRef.current === trackingKey) {
			return;
		}

		if (provider === 'google-analytics') {
			if (!measurementId || typeof window.gtag !== 'function') {
				return;
			}

			window.gtag('event', 'page_view', {
				page_title: document.title,
				page_location: pageLocation,
				page_path: pagePath,
				send_to: measurementId,
			});
		} else {
			if (!postHogApiKey || typeof window.posthog?.capture !== 'function') {
				return;
			}

			window.posthog.capture('$pageview', {
				$current_url: pageLocation,
				$pathname: pathname,
			});
		}

		lastTrackedUrlRef.current = trackingKey;
	}, [measurementId, pathname, postHogApiKey, provider, searchParams]);
}
