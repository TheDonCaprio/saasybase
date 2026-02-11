import 'server-only';

import { formatDate } from './formatDate';
import { getFormatSetting, getUserFormatSetting } from './settings';

/**
 * Server helper that reads DB-backed format settings and formats accordingly.
 * If a userId is provided, try to use the user's timezone preference; otherwise fall back to admin.
 */
export async function formatDateServer(d?: string | Date | null, userId?: string) {
  const settings = userId ? await getUserFormatSetting(userId) : await getFormatSetting();
  return formatDate(d, { mode: settings.mode, timezone: settings.timezone });
}
