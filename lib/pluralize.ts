export function pluralize(count: number, singular: string, plural?: string) {
  if (typeof count !== 'number') return '';
  if (count === 1) return `${count} ${singular}`;
  return `${count} ${plural || singular + 's'}`;
}
