import { faBell, faFlask, faLifeRing, faPlay, faUserShield } from '@fortawesome/free-solid-svg-icons';
import type { DashboardNavCounts, DashboardNavItem } from './types';

export function buildDashboardNavItems(counts: DashboardNavCounts): DashboardNavItem[] {
  return [
    {
      href: '/dashboard',
      label: 'SaaSyApp',
      icon: faFlask,
    },
    {
      href: '/dashboard/onboarding',
      label: 'Get Started',
      icon: faPlay,
    },
    {
      href: '/dashboard/team',
      label: 'Team',
      icon: faUserShield,
      badge: counts.teamBadge,
    },
    {
      href: '/dashboard/support',
      label: 'Support',
      icon: faLifeRing,
      badge: counts.supportBadge,
    },
    {
      href: '/dashboard/notifications',
      label: 'Notifications',
      icon: faBell,
    },
  ];
}