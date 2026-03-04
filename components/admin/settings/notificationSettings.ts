export const ADMIN_ACTION_NOTIFICATION_ACTIONS_KEY = 'ADMIN_ACTION_NOTIFICATION_ACTIONS';
export const ADMIN_ALERT_EMAIL_TYPES_KEY = 'ADMIN_ALERT_EMAIL_TYPES';
export const SUPPORT_EMAIL_NOTIFICATION_TYPES_KEY = 'SUPPORT_EMAIL_NOTIFICATION_TYPES';

export const ADMIN_ACTION_NOTIFICATION_OPTIONS = [
  {
    pattern: 'user.*',
    label: 'User management actions',
    description: 'Role changes, profile updates, token adjustments, and organization management.'
  },
  {
    pattern: 'plan.*',
    label: 'Plan actions',
    description: 'Plan create/update/activate/deactivate/delete events.'
  },
  {
    pattern: 'coupon.*',
    label: 'Coupon actions',
    description: 'Coupon create, edit, and delete operations.'
  },
  {
    pattern: 'payment.*',
    label: 'Payment actions',
    description: 'Refunds and other payment-level admin operations.'
  },
  {
    pattern: 'subscription.*',
    label: 'Subscription actions',
    description: 'Force-cancel, schedule-cancel, and other subscription management.'
  },
  {
    pattern: 'support.*',
    label: 'Support actions',
    description: 'Ticket status changes, replies, and admin-created tickets.'
  },
  {
    pattern: 'settings.*',
    label: 'Settings actions',
    description: 'Configuration and platform setting updates.'
  },
  {
    pattern: 'billing.*',
    label: 'Billing sync actions',
    description: 'Provider sync and billing management operations.'
  },
  {
    pattern: 'maintenance.*',
    label: 'Maintenance actions',
    description: 'Backfills and maintenance cleanup operations.'
  },
  {
    pattern: 'notification.*',
    label: 'Admin notification actions',
    description: 'Manual sends and broadcasts triggered by admins.'
  }
] as const;

export const ADMIN_ALERT_EMAIL_OPTIONS = [
  { value: 'refund', label: 'Refund alerts', description: 'Emails when refunds are processed.' },
  { value: 'new_purchase', label: 'New purchase alerts', description: 'Emails for new one-time or subscription purchases.' },
  { value: 'renewal', label: 'Renewal alerts', description: 'Emails for subscription renewal events.' },
  { value: 'upgrade', label: 'Upgrade alerts', description: 'Emails when subscriptions are upgraded.' },
  { value: 'downgrade', label: 'Downgrade alerts', description: 'Emails when subscriptions are downgraded.' },
  { value: 'payment_failed', label: 'Payment failure alerts', description: 'Emails when a payment or invoice fails.' },
  { value: 'dispute', label: 'Dispute alerts', description: 'Emails when payment disputes are filed/updated.' },
  { value: 'other', label: 'Other admin alerts', description: 'Emails for uncategorized admin notification events.' }
] as const;

export const SUPPORT_EMAIL_OPTIONS = [
  {
    value: 'new_ticket_to_admin',
    label: 'New support ticket to support inbox',
    description: 'Send support inbox email when a user opens a new support ticket.'
  },
  {
    value: 'admin_reply_to_user',
    label: 'Admin reply to user',
    description:
      'Send email to user when admin/moderator replies to a support ticket. Users who have opted out of emails will not receive them regardless.'
  },
  {
    value: 'user_reply_to_admin',
    label: 'User reply to support inbox',
    description: 'Send email to the support inbox when a user replies to an existing support ticket.'
  }
] as const;

export function parseActionPatternList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    const patterns = parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return Array.from(new Set(patterns));
  } catch {
    return [];
  }
}
