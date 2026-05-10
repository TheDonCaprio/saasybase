'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const COMPLETE_HIDE_DELAY_MS = 180;
const PROGRESS_INTERVAL_MS = 160;

function clearTimer(timerRef: { current: number | null }) {
	if (timerRef.current !== null) {
		window.clearTimeout(timerRef.current);
		timerRef.current = null;
	}
}

function clearIntervalTimer(timerRef: { current: number | null }) {
	if (timerRef.current !== null) {
		window.clearInterval(timerRef.current);
		timerRef.current = null;
	}
}

function getNavigationTarget(eventTarget: EventTarget | null) {
	if (!(eventTarget instanceof Element)) {
		return null;
	}

	const anchor = eventTarget.closest('a[href]');
	if (!(anchor instanceof HTMLAnchorElement)) {
		return null;
	}

	if (anchor.target && anchor.target !== '_self') {
		return null;
	}

	if (anchor.hasAttribute('download')) {
		return null;
	}

	const href = anchor.getAttribute('href');
	if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
		return null;
	}

	try {
		const url = new URL(anchor.href, window.location.href);
		if (url.origin !== window.location.origin) {
			return null;
		}

		if (url.pathname === window.location.pathname && url.search === window.location.search) {
			return null;
		}

		return url;
	} catch {
		return null;
	}
}

export function NavigationProgress() {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [progress, setProgress] = useState(0);
	const [visible, setVisible] = useState(false);
	const inFlightRef = useRef(false);
	const progressIntervalRef = useRef<number | null>(null);
	const hideTimeoutRef = useRef<number | null>(null);
	const routeKeyRef = useRef<string>('');

	useEffect(() => {
		routeKeyRef.current = `${pathname}?${searchParams.toString()}`;
	}, [pathname, searchParams]);

	useEffect(() => {
		const start = () => {
			clearTimer(hideTimeoutRef);
			if (inFlightRef.current) {
				return;
			}

			inFlightRef.current = true;
			setVisible(true);
			setProgress(14);
			clearIntervalTimer(progressIntervalRef);
			progressIntervalRef.current = window.setInterval(() => {
				setProgress((current) => {
					if (current >= 88) {
						return current;
					}
					const remaining = 92 - current;
					return Math.min(88, current + Math.max(4, remaining * 0.18));
				});
			}, PROGRESS_INTERVAL_MS);
		};

		const handleClick = (event: MouseEvent) => {
			if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
				return;
			}

			const targetUrl = getNavigationTarget(event.target);
			if (!targetUrl) {
				return;
			}

			const nextRouteKey = `${targetUrl.pathname}?${targetUrl.searchParams.toString()}`;
			if (nextRouteKey === routeKeyRef.current) {
				return;
			}

			start();
		};

		const handlePopState = () => {
			start();
		};

		document.addEventListener('click', handleClick, true);
		window.addEventListener('popstate', handlePopState);

		return () => {
			document.removeEventListener('click', handleClick, true);
			window.removeEventListener('popstate', handlePopState);
			clearIntervalTimer(progressIntervalRef);
			clearTimer(hideTimeoutRef);
		};
	}, []);

	useEffect(() => {
		if (!inFlightRef.current) {
			return;
		}

		const frame = window.requestAnimationFrame(() => {
			clearIntervalTimer(progressIntervalRef);
			inFlightRef.current = false;
			setVisible(true);
			setProgress(100);
			clearTimer(hideTimeoutRef);
			hideTimeoutRef.current = window.setTimeout(() => {
				setVisible(false);
				setProgress(0);
				hideTimeoutRef.current = null;
			}, COMPLETE_HIDE_DELAY_MS);
		});

		return () => {
			window.cancelAnimationFrame(frame);
		};
	}, [pathname, searchParams]);

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed inset-x-0 top-0 z-[120]"
		>
			<div
				className="h-[3px] origin-left transition-[opacity,transform] duration-200 ease-out"
				style={{
					opacity: visible ? 1 : 0,
					transform: `scaleX(${progress / 100})`,
					background:
						'linear-gradient(90deg, rgb(var(--accent-primary-rgb) / 0.95), rgb(var(--accent-primary-rgb) / 0.55) 70%, rgb(var(--accent-primary-rgb) / 0.2))',
					boxShadow: '0 0 18px rgb(var(--accent-primary-rgb) / 0.35)',
				}}
			/>
		</div>
	);
}