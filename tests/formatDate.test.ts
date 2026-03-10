import { describe, it, expect } from 'vitest';
import { formatDate } from '../lib/formatDate';

const DT = new Date('2026-03-10T23:59:00Z');

describe('formatDate - custom modes', () => {
  it('short-time-24 produces "Mar 10 (23:59)" in UTC', () => {
    const out = formatDate(DT, { mode: 'short-time-24', timezone: 'UTC' });
    expect(out).toBe('Mar 10 (23:59)');
  });

  it('short-year-time-24 produces "Mar 10, 2026 (23:59)" in UTC', () => {
    const out = formatDate(DT, { mode: 'short-year-time-24', timezone: 'UTC' });
    expect(out).toBe('Mar 10, 2026 (23:59)');
  });

  it('numeric-dmy-12 produces "10/03/2026 (11:59 PM)" in UTC', () => {
    const out = formatDate(DT, { mode: 'numeric-dmy-12', timezone: 'UTC' });
    expect(out).toBe('10/03/2026 (11:59 PM)');
  });

  it('numeric-dmy-24 produces "10/03/2026 (23:59)" in UTC', () => {
    const out = formatDate(DT, { mode: 'numeric-dmy-24', timezone: 'UTC' });
    expect(out).toBe('10/03/2026 (23:59)');
  });
});
