const NON_NEGATIVE_INTEGER_SETTING_KEYS = new Set([
  'RECURRING_DOWNGRADE_IMMEDIATE_LIMIT_PER_CYCLE',
]);

export function isNonNegativeIntegerAdminSetting(key: string): boolean {
  return NON_NEGATIVE_INTEGER_SETTING_KEYS.has(key);
}

export function validateAdminSettingValue(key: string, value: string): string | null {
  if (!isNonNegativeIntegerAdminSetting(key)) {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return `${key} must be a non-negative whole number.`;
  }

  return null;
}

export function normalizeAdminSettingValue(key: string, value: string): string {
  if (!isNonNegativeIntegerAdminSetting(key)) {
    return value;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return value;
  }

  return String(Number.parseInt(trimmed, 10));
}