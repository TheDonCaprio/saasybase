export type UserSettingRecord = {
  id: string;
  key: string;
  value: string;
};

let cachedSettings: UserSettingRecord[] | null = null;
let inFlightSettingsRequest: Promise<UserSettingRecord[]> | null = null;

function normalizeSettings(payload: unknown): UserSettingRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const settings = (payload as { settings?: unknown[] }).settings;
  if (!Array.isArray(settings)) {
    return [];
  }

  return settings.filter((setting): setting is UserSettingRecord => {
    return Boolean(
      setting
      && typeof setting === 'object'
      && typeof (setting as UserSettingRecord).id === 'string'
      && typeof (setting as UserSettingRecord).key === 'string'
      && typeof (setting as UserSettingRecord).value === 'string'
    );
  });
}

export async function fetchUserSettings(forceRefresh = false): Promise<UserSettingRecord[]> {
  if (!forceRefresh && cachedSettings) {
    return cachedSettings;
  }

  if (!forceRefresh && inFlightSettingsRequest) {
    return inFlightSettingsRequest;
  }

  inFlightSettingsRequest = (async () => {
    try {
      const response = await fetch('/api/user/settings', { method: 'GET' });
      if (!response.ok) {
        return [];
      }

      const payload = await response.json();
      const settings = normalizeSettings(payload);
      cachedSettings = settings;
      return settings;
    } catch {
      return [];
    } finally {
      inFlightSettingsRequest = null;
    }
  })();

  return inFlightSettingsRequest;
}

export function updateCachedUserSetting(nextSetting: UserSettingRecord): void {
  if (!cachedSettings) {
    cachedSettings = [nextSetting];
    return;
  }

  const existingIndex = cachedSettings.findIndex((setting) => setting.key === nextSetting.key);
  if (existingIndex === -1) {
    cachedSettings = [...cachedSettings, nextSetting];
    return;
  }

  cachedSettings = cachedSettings.map((setting, index) => {
    return index === existingIndex ? nextSetting : setting;
  });
}

export function clearUserSettingsCache(): void {
  cachedSettings = null;
  inFlightSettingsRequest = null;
}