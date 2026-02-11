export function formatDisplayYMD(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  // Expecting YYYY-MM-DD
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  const [y, m, d] = parts;
  const yy = y.slice(-2);
  const dd = d.padStart(2, '0');
  const mm = m.padStart(2, '0');
  return `${dd}/${mm}/${yy}`;
}

export default formatDisplayYMD;
