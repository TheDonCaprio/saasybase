import { formatCurrency } from './utils/currency';

/**
 * Client-safe price formatter.
 *
 * In client components you must pass the currency explicitly.
 */
export function formatPrice(cents: number, currency: string): string {
  return formatCurrency(cents, currency);
}
