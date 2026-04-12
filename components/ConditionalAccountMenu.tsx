"use client";

import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser } from '@fortawesome/free-solid-svg-icons';

const AccountMenu = dynamic(() => import('./AccountMenu'), {
  ssr: false,
  loading: () => (
    <button
      type="button"
      disabled
      aria-label="Account menu loading"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
    >
      <FontAwesomeIcon icon={faUser} className="h-5 w-5" />
    </button>
  )
});

export function ConditionalAccountMenu() {
  const pathname = usePathname();
  
  // Show AccountMenu on all pages, but hide on mobile for dashboard/admin
  const isAdminOrDashboard = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');
  
  return (
    <div className={isAdminOrDashboard ? 'hidden lg:block' : ''}>
      <AccountMenu />
    </div>
  );
}
