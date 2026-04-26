import { SETTING_KEYS, SETTING_DEFAULTS, getSetting, setSetting } from './settings';
import { asRecord } from './runtime-guards';

export const MODERATOR_SECTIONS = [
  'users',
  'transactions',
  'purchases',
  'subscriptions',
  'support',
  'notifications',
  'blog',
  'analytics',
  'traffic',
  'organizations'
] as const;

const DEFAULT_ENABLED_SECTIONS: readonly ModeratorSection[] = ['support'];

export type ModeratorSection = typeof MODERATOR_SECTIONS[number];
export type ModeratorPermissions = Record<ModeratorSection, boolean>;

const DEFAULT_PERMISSIONS: ModeratorPermissions = MODERATOR_SECTIONS.reduce<ModeratorPermissions>((acc, section) => {
  acc[section] = DEFAULT_ENABLED_SECTIONS.includes(section) ? true : false;
  return acc;
}, Object.create(null) as ModeratorPermissions);

export function getDefaultModeratorPermissions(): ModeratorPermissions {
  return { ...DEFAULT_PERMISSIONS };
}

export function normalizeModeratorPermissions(input: unknown): ModeratorPermissions {
  const base = getDefaultModeratorPermissions();
  if (!input) return base;
  const record = asRecord(input);
  if (!record) return base;

  for (const section of MODERATOR_SECTIONS) {
    const value = record[section as keyof typeof record];
    base[section] = typeof value === 'boolean' ? value : Boolean(value);
  }

  return base;
}

export async function fetchModeratorPermissions(): Promise<ModeratorPermissions> {
  const raw = await getSetting(
    SETTING_KEYS.MODERATOR_PERMISSIONS,
    SETTING_DEFAULTS[SETTING_KEYS.MODERATOR_PERMISSIONS]
  );

  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return normalizeModeratorPermissions(parsed);
  } catch {
    return getDefaultModeratorPermissions();
  }
}

export async function persistModeratorPermissions(permissions: ModeratorPermissions): Promise<void> {
  const payload: Partial<Record<ModeratorSection, boolean>> = {};
  for (const section of MODERATOR_SECTIONS) {
    payload[section] = Boolean(permissions[section]);
  }
  await setSetting(SETTING_KEYS.MODERATOR_PERMISSIONS, JSON.stringify(payload));
}

export function moderatorHasAccess(
  permissions: ModeratorPermissions,
  section: ModeratorSection
): boolean {
  return Boolean(permissions[section]);
}

export function buildAdminLikePermissions(): ModeratorPermissions {
  const permissions = getDefaultModeratorPermissions();
  for (const section of MODERATOR_SECTIONS) {
    permissions[section] = true;
  }
  return permissions;
}
