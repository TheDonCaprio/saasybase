"use client";

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

export default function TwitterLoader() {
  const pathname = usePathname();

  useEffect(() => {
    const run = () => {
      try {
        const win = window as Window & { twttr?: { widgets?: { load?: () => void } } };
        const w = win.twttr;
        if (w && w.widgets && typeof w.widgets.load === 'function') {
          w.widgets.load();
        }
      } catch (e) {
        // Non-fatal; just log for debugging
        console.warn('twttr.widgets.load error', e);
      }
    };

    // Run immediately and again after a short delay to cover race conditions
    run();
    const t = window.setTimeout(run, 350);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return (
    <Script
      src="https://platform.twitter.com/widgets.js"
      strategy="afterInteractive"
      onLoad={() => {
          try {
          const win = window as Window & { twttr?: { widgets?: { load?: () => void } } };
          const w = win.twttr;
          if (w && w.widgets && typeof w.widgets.load === 'function') {
            w.widgets.load();
          }
        } catch (e) {
          console.warn('twttr.widgets.load onLoad error', e);
        }
      }}
    />
  );
}
