"use client";

import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { faFlask, faPlay, faBell, faLifeRing, faUserShield } from '@fortawesome/free-solid-svg-icons';

const DashboardHeaderDrawer = dynamic(
  () => import('./dashboard/DashboardHeaderDrawer').then(mod => ({ default: mod.DashboardHeaderDrawer })),
  { 
    ssr: false,
    loading: () => <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800" />
  }
);

// Static dashboard nav items (badges will be fetched client-side if needed)
const dashboardNavItems = [
  { href: '/dashboard', label: 'SaaSyApp', icon: faFlask },
  { href: '/dashboard/onboarding', label: 'Get Started', icon: faPlay },
  { href: '/dashboard/team', label: 'Team', icon: faUserShield },
  { href: '/dashboard/support', label: 'Support', icon: faLifeRing },
  { href: '/dashboard/notifications', label: 'Notifications', icon: faBell },
];

export function ConditionalDashboardDrawer() {
  const pathname = usePathname();
  
  // Only show on dashboard pages
  if (!pathname.startsWith('/dashboard')) {
    return null;
  }
  
  return (
    <div className="lg:hidden">
      <DashboardHeaderDrawer items={dashboardNavItems} contextLabel="Dashboard" />
    </div>
  );
}
