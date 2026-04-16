"use client";

import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faTachometerAlt, faUsers, faFileInvoiceDollar, faListAlt, faLifeRing, faBell, faChartLine, faTrafficLight, faClipboardList, faCogs, faShoppingCart, faTicketAlt, faTriangleExclamation, faEnvelope, faUserShield, faPalette, faFileLines, faNewspaper, faWrench, faSitemap, faServer } from '@fortawesome/free-solid-svg-icons';

const AdminHeaderDrawer = dynamic(
  () => import('./admin/AdminHeaderDrawer').then(mod => ({ default: mod.AdminHeaderDrawer })),
  { 
    ssr: false,
    loading: () => <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800" />
  }
);

// Organized admin nav items with sections
export interface AdminNavGroup {
  title: string;
  items: Array<{
    href: string;
    label: string;
    icon?: IconDefinition;
    badge?: string;
  }>;
}

const adminNavGroups: AdminNavGroup[] = [
  {
    title: 'Overview',
    items: [
      { href: '/admin', label: 'Dashboard', icon: faTachometerAlt },
    ],
  },
  {
    title: 'Users & Access',
    items: [
      { href: '/admin/users', label: 'Users', icon: faUsers },
      { href: '/admin/organizations', label: 'Organizations', icon: faSitemap },
      { href: '/admin/moderation', label: 'Moderation', icon: faUserShield },
    ],
  },
  {
    title: 'Finances',
    items: [
      { href: '/admin/transactions', label: 'Transactions', icon: faFileInvoiceDollar },
      { href: '/admin/purchases', label: 'One-Time Sales', icon: faShoppingCart },
      { href: '/admin/subscriptions', label: 'Subscriptions', icon: faClipboardList },
      { href: '/admin/coupons', label: 'Coupons', icon: faTicketAlt },
    ],
  },
  {
    title: 'Platform',
    items: [
      { href: '/admin/theme', label: 'Theme', icon: faPalette },
      { href: '/admin/pages', label: 'Pages', icon: faFileLines },
      { href: '/admin/blog', label: 'Blog', icon: faNewspaper },
      { href: '/admin/plans', label: 'Plans', icon: faListAlt },
      { href: '/admin/emails', label: 'Email Templates', icon: faEnvelope },
      { href: '/admin/settings', label: 'Settings', icon: faCogs },
    ],
  },
  {
    title: 'Support & Analytics',
    items: [
      { href: '/admin/support', label: 'Support', icon: faLifeRing },
      { href: '/admin/notifications', label: 'Notifications', icon: faBell },
      { href: '/admin/analytics', label: 'Analytics', icon: faChartLine },
      { href: '/admin/traffic', label: 'Traffic', icon: faTrafficLight },
    ],
  },
  {
    title: 'Developer',
    items: [
      { href: '/admin/logs', label: 'Logs', icon: faTriangleExclamation },
      { href: '/admin/maintenance', label: 'Maintenance', icon: faWrench },
      { href: '/admin/system', label: 'System', icon: faServer },
    ],
  },
];

// Flatten groups for the drawer component
const adminNavItems = adminNavGroups.flatMap(group => group.items);

export function ConditionalAdminDrawer() {
  const pathname = usePathname();
  
  // Only show on admin pages
  if (!pathname.startsWith('/admin')) {
    return null;
  }
  
  return (
    <div className="lg:hidden">
      <AdminHeaderDrawer 
        items={adminNavItems} 
        groups={adminNavGroups}
        contextLabel="Admin" 
        signOutLabel="Sign out" 
      />
    </div>
  );
}
