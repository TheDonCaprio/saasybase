export const SUPPORT_TICKET_CATEGORIES = [
  'GENERAL',
  'TECHNICAL_SUPPORT',
  'BILLING',
  'PRE_SALE',
  'ACCOUNT',
  'FEATURE_REQUEST',
] as const;

export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];

export const DEFAULT_SUPPORT_TICKET_CATEGORY: SupportTicketCategory = 'GENERAL';

export const SUPPORT_TICKET_CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  GENERAL: 'General',
  TECHNICAL_SUPPORT: 'Technical support',
  BILLING: 'Billing',
  PRE_SALE: 'Pre-sale',
  ACCOUNT: 'Account',
  FEATURE_REQUEST: 'Feature request',
};

export const SUPPORT_TICKET_CATEGORY_FILTER_OPTIONS = [
  'ALL',
  ...SUPPORT_TICKET_CATEGORIES,
] as const;

export function isSupportTicketCategory(value: unknown): value is SupportTicketCategory {
  return typeof value === 'string' && SUPPORT_TICKET_CATEGORIES.includes(value as SupportTicketCategory);
}

export function normalizeSupportTicketCategory(value: unknown): SupportTicketCategory {
  if (!isSupportTicketCategory(value)) return DEFAULT_SUPPORT_TICKET_CATEGORY;
  return value;
}

export function getSupportTicketCategoryLabel(value: unknown): string {
  const category = normalizeSupportTicketCategory(value);
  return SUPPORT_TICKET_CATEGORY_LABELS[category];
}