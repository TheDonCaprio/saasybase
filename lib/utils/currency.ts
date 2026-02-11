/**
 * Centralized currency utilities for consistent formatting across the app.
 */

/**
 * Currency configuration - symbols and formatting rules.
 */
const CURRENCY_CONFIG: Record<string, { symbol: string; position: 'before' | 'after'; decimals: number }> = {
  usd: { symbol: '$', position: 'before', decimals: 2 },
  eur: { symbol: '€', position: 'before', decimals: 2 },
  gbp: { symbol: '£', position: 'before', decimals: 2 },
  ngn: { symbol: '₦', position: 'before', decimals: 2 },
  ghs: { symbol: 'GH₵', position: 'before', decimals: 2 },
  zar: { symbol: 'R', position: 'before', decimals: 2 },
  kes: { symbol: 'KSh', position: 'before', decimals: 2 },
  jpy: { symbol: '¥', position: 'before', decimals: 0 }, // No decimals for Yen
  cny: { symbol: '¥', position: 'before', decimals: 2 },
  inr: { symbol: '₹', position: 'before', decimals: 2 },
  brl: { symbol: 'R$', position: 'before', decimals: 2 },
  cad: { symbol: 'CA$', position: 'before', decimals: 2 },
  aud: { symbol: 'A$', position: 'before', decimals: 2 },
  mxn: { symbol: 'MX$', position: 'before', decimals: 2 },
};

/**
 * Zero-decimal currencies (amount is in whole units, not cents).
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'
]);

/**
 * Check if a currency is zero-decimal (no cents/subunits).
 */
export function isZeroDecimalCurrency(currency: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase());
}

/**
 * Get the smallest unit multiplier for a currency.
 * For most currencies this is 100 (cents). For zero-decimal currencies it's 1.
 */
export function getCurrencyMultiplier(currency: string): number {
  return isZeroDecimalCurrency(currency) ? 1 : 100;
}

/**
 * Convert an amount from cents (smallest unit) to the display amount.
 */
export function centsToAmount(cents: number, currency: string): number {
  const multiplier = getCurrencyMultiplier(currency);
  return cents / multiplier;
}

/**
 * Convert a display amount to cents (smallest unit).
 */
export function amountToCents(amount: number, currency: string): number {
  const multiplier = getCurrencyMultiplier(currency);
  return Math.round(amount * multiplier);
}

/**
 * Format an amount in cents as a currency string.
 * 
 * @param amountCents - Amount in smallest currency unit (cents for USD)
 * @param currency - Currency code (e.g., 'usd', 'ngn')
 * @param options - Formatting options
 * @returns Formatted currency string (e.g., "$19.99", "₦5,000.00")
 */
export function formatCurrency(
  amountCents: number,
  currency: string,
  options?: {
    /** Include currency code after the amount (e.g., "$19.99 USD") */
    showCode?: boolean;
    /** Use compact notation for large numbers (e.g., "$1.2K") */
    compact?: boolean;
    /** Custom locale for number formatting */
    locale?: string;
  }
): string {
  const currencyLower = currency.toLowerCase();
  const config = CURRENCY_CONFIG[currencyLower] || { symbol: currency.toUpperCase(), position: 'before', decimals: 2 };
  
  // Convert from cents to display amount
  const amount = centsToAmount(amountCents, currency);
  
  // Format the number
  const locale = options?.locale || 'en-US';
  let formattedNumber: string;
  
  if (options?.compact && Math.abs(amount) >= 1000) {
    formattedNumber = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  } else {
    formattedNumber = new Intl.NumberFormat(locale, {
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }).format(amount);
  }
  
  // Apply currency symbol
  let result: string;
  if (config.position === 'before') {
    result = `${config.symbol}${formattedNumber}`;
  } else {
    result = `${formattedNumber}${config.symbol}`;
  }
  
  // Add currency code if requested
  if (options?.showCode) {
    result = `${result} ${currency.toUpperCase()}`;
  }
  
  return result;
}

/**
 * Format currency using Intl.NumberFormat with the 'currency' style.
 * This provides locale-aware formatting but requires a valid ISO currency code.
 */
export function formatCurrencyIntl(
  amountCents: number,
  currency: string,
  locale: string = 'en-US'
): string {
  const amount = centsToAmount(amountCents, currency);
  
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    // Fallback if currency code is not recognized
    return formatCurrency(amountCents, currency);
  }
}

/**
 * Parse a currency string back to cents.
 * Handles various formats like "$19.99", "₦5,000.00", "19.99 USD".
 */
export function parseCurrencyToCents(value: string, defaultCurrency: string = 'usd'): number | null {
  if (!value || typeof value !== 'string') return null;
  
  // Remove currency symbols and whitespace, keeping numbers, dots, commas, and minus
  const cleaned = value.replace(/[^\d.,-]/g, '');
  
  // Handle comma as thousands separator (most common case)
  const normalized = cleaned.replace(/,/g, '');
  
  const amount = parseFloat(normalized);
  if (isNaN(amount)) return null;
  
  return amountToCents(amount, defaultCurrency);
}

/**
 * Get the currency symbol for a currency code.
 */
export function getCurrencySymbol(currency: string): string {
  const currencyLower = currency.toLowerCase();
  return CURRENCY_CONFIG[currencyLower]?.symbol || currency.toUpperCase();
}

/**
 * Validate if a string is a known/supported currency code.
 */
export function isKnownCurrency(currency: string): boolean {
  return currency.toLowerCase() in CURRENCY_CONFIG;
}
