export type FormatMode = 'short' | 'long' | 'datetime' | 'datetime-long' | 'iso' | 'relative' | 'locale';

function toDate(d?: string | Date | null): Date | null {
  if (!d) return null;
  try {
    return typeof d === 'string' ? new Date(d) : d instanceof Date ? d : new Date(String(d));
  } catch (e) {
    void e;
    return null;
  }
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const absDiff = Math.abs(diffMs);
  
  const minute = 60 * 1000;
  const hour = minute * 60;
  const day = hour * 24;
  const week = day * 7;
  const month = day * 30;
  const year = day * 365;

  if (absDiff < minute) {
    return diffMs < 0 ? 'just now' : 'in a moment';
  } else if (absDiff < hour) {
    const minutes = Math.floor(absDiff / minute);
    return diffMs < 0 ? `${minutes} minute${minutes !== 1 ? 's' : ''} ago` : `in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else if (absDiff < day) {
    const hours = Math.floor(absDiff / hour);
    return diffMs < 0 ? `${hours} hour${hours !== 1 ? 's' : ''} ago` : `in ${hours} hour${hours !== 1 ? 's' : ''}`;
  } else if (absDiff < week) {
    const days = Math.floor(absDiff / day);
    return diffMs < 0 ? `${days} day${days !== 1 ? 's' : ''} ago` : `in ${days} day${days !== 1 ? 's' : ''}`;
  } else if (absDiff < month) {
    const weeks = Math.floor(absDiff / week);
    return diffMs < 0 ? `${weeks} week${weeks !== 1 ? 's' : ''} ago` : `in ${weeks} week${weeks !== 1 ? 's' : ''}`;
  } else if (absDiff < year) {
    const months = Math.floor(absDiff / month);
    return diffMs < 0 ? `${months} month${months !== 1 ? 's' : ''} ago` : `in ${months} month${months !== 1 ? 's' : ''}`;
  } else {
    const years = Math.floor(absDiff / year);
    return diffMs < 0 ? `${years} year${years !== 1 ? 's' : ''} ago` : `in ${years} year${years !== 1 ? 's' : ''}`;
  }
}

export function formatDate(d?: string | Date | null, opts?: { mode?: FormatMode; timezone?: string }) {
  const dt = toDate(d);
  if (!dt) return '';

  const mode = opts?.mode || 'short';
  const timezone = opts?.timezone;

  try {
    if (mode === 'iso') return dt.toISOString();

    if (mode === 'relative') {
      return formatRelativeTime(dt);
    }

    if (mode === 'locale') {
      // Let the user agent decide
      return dt.toLocaleString();
    }

    let intlOpts: Intl.DateTimeFormatOptions;

    switch (mode) {
      case 'long':
        intlOpts = { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        };
        break;
      case 'datetime':
        intlOpts = { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric',
          hour: 'numeric', 
          minute: '2-digit' 
        };
        break;
      case 'datetime-long':
        intlOpts = { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          hour: 'numeric', 
          minute: '2-digit' 
        };
        break;
      case 'short':
      default:
        intlOpts = { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        };
        break;
    }

    let result: string;

    if (timezone) {
      // Some runtimes may not support timeZone or the timezone may be invalid; guard it
      try {
        result = new Intl.DateTimeFormat('en-US', { ...intlOpts, timeZone: timezone }).format(dt);
      } catch (e) {
        void e;
        // Fallback to admin locale formatting if timezone invalid
        result = new Intl.DateTimeFormat('en-US', intlOpts).format(dt);
      }
    } else {
      result = new Intl.DateTimeFormat('en-US', intlOpts).format(dt);
    }

    // Normalize cross-platform Intl differences: Safari/iPad uses " at " between
    // date and time (e.g. "Mar 9, 2026 at 11:00 PM") while Node.js uses ", "
    // (e.g. "Mar 9, 2026, 11:00 PM"). Standardise to the comma form to prevent
    // SSR/client hydration mismatches.
    if (mode === 'datetime' || mode === 'datetime-long') {
      result = result.replace(/\b at /, ', ');
    }

    return result;
  } catch (e) {
    void e;
    return String(d);
  }
}

export function formatDateRange(start?: string | Date | null, end?: string | Date | null, opts?: { mode?: FormatMode; timezone?: string }) {
  const s = formatDate(start, opts);
  const e = formatDate(end, opts);
  if (!s && !e) return '';
  return `${s} - ${e}`;
}

// Small helper to validate if a timezone string is likely valid in Intl
export function isValidTimeZone(tz?: string) {
  if (!tz) return false;
  try {
    // if invalid this will throw
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch (e) {
    void e;
    return false;
  }
}
