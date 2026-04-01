import { getSetting, SETTING_DEFAULTS, SETTING_KEYS } from './settings';

const EXACT_BYPASS_PATHS = new Set([
  '/maintenance',
  '/sign-in',
  '/sign-up',
  '/access-denied',
]);

const PREFIX_BYPASS_PATHS = [
  '/admin',
  '/auth',
  '/api/admin',
  '/api/auth',
  '/api/webhooks',
  '/api/cron',
  '/api/health',
];

export function isMaintenanceBypassPath(pathname: string): boolean {
  if (!pathname) return false;
  if (EXACT_BYPASS_PATHS.has(pathname)) return true;
  return PREFIX_BYPASS_PATHS.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function isMaintenanceModeEnabled(): Promise<boolean> {
  const raw = await getSetting(
    SETTING_KEYS.MAINTENANCE_MODE,
    SETTING_DEFAULTS[SETTING_KEYS.MAINTENANCE_MODE]
  );
  return raw === 'true';
}
