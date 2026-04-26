import { describe, expect, it } from 'vitest';

import { SETTING_DEFAULTS, SETTING_KEYS } from '../lib/settings';

describe('fresh install setting defaults', () => {
  it('matches the expected operations defaults', () => {
    expect(SETTING_DEFAULTS[SETTING_KEYS.TOKENS_RESET_ON_EXPIRY_ONE_TIME]).toBe('true');
    expect(SETTING_DEFAULTS[SETTING_KEYS.TOKENS_RESET_ON_RENEWAL_ONE_TIME]).toBe('true');
    expect(SETTING_DEFAULTS[SETTING_KEYS.TOKENS_RESET_ON_EXPIRY_RECURRING]).toBe('true');
    expect(SETTING_DEFAULTS[SETTING_KEYS.TOKENS_RESET_ON_RENEWAL_RECURRING]).toBe('true');
    expect(SETTING_DEFAULTS[SETTING_KEYS.ENABLE_RECURRING_PRORATION]).toBe('true');
  });

  it('matches the expected notification defaults', () => {
    expect(SETTING_DEFAULTS[SETTING_KEYS.ADMIN_ACTION_NOTIFICATION_ACTIONS]).toBe('[]');
    expect(SETTING_DEFAULTS[SETTING_KEYS.ADMIN_ALERT_EMAIL_TYPES]).toBe(
      '["refund","new_purchase","renewal","upgrade","downgrade","payment_failed","dispute","other"]'
    );
    expect(SETTING_DEFAULTS[SETTING_KEYS.SUPPORT_EMAIL_NOTIFICATION_TYPES]).toBe(
      '["new_ticket_to_admin","admin_reply_to_user","user_reply_to_admin"]'
    );
    expect(SETTING_DEFAULTS[SETTING_KEYS.MODERATOR_PERMISSIONS]).toBe(
      '{"users":false,"transactions":false,"purchases":false,"subscriptions":false,"support":true,"notifications":false,"blog":false,"analytics":false,"traffic":false,"organizations":false}'
    );
  });

  it('matches the expected free plan and format defaults', () => {
    expect(SETTING_DEFAULTS[SETTING_KEYS.FREE_PLAN_RENEWAL_TYPE]).toBe('monthly');
    expect(SETTING_DEFAULTS[SETTING_KEYS.FREE_PLAN_TOKEN_LIMIT]).toBe('50');
    expect(SETTING_DEFAULTS[SETTING_KEYS.FORMAT_MODE]).toBe('numeric-dmy-24');
    expect(SETTING_DEFAULTS[SETTING_KEYS.TRAFFIC_ANALYTICS_PROVIDER]).toBe('google-analytics');
  });

  it('matches the expected content, header, and pricing defaults', () => {
    expect(SETTING_DEFAULTS[SETTING_KEYS.BLOG_LISTING_STYLE]).toBe('grid');
    expect(SETTING_DEFAULTS[SETTING_KEYS.BLOG_RELATED_POSTS_ENABLED]).toBe('true');
    expect(SETTING_DEFAULTS[SETTING_KEYS.HEADER_HEIGHT]).toBe('60');
    expect(SETTING_DEFAULTS[SETTING_KEYS.HEADER_STICKY_ENABLED]).toBe('true');
    expect(SETTING_DEFAULTS[SETTING_KEYS.HEADER_STICKY_SCROLL_Y]).toBe('60');
    expect(SETTING_DEFAULTS[SETTING_KEYS.HEADER_STICKY_HEIGHT]).toBe('50');
    expect(SETTING_DEFAULTS[SETTING_KEYS.PRICING_MAX_COLUMNS]).toBe('3');
    expect(SETTING_DEFAULTS[SETTING_KEYS.PRICING_CENTER_UNEVEN]).toBe('true');
  });
});