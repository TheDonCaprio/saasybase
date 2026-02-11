"use client";

import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';

const AccountMenu = dynamic(() => import('./AccountMenu'), {
  ssr: false,
  loading: () => <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800" />
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
