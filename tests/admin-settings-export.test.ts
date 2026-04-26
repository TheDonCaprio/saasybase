import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { SETTING_DEFAULTS, SETTING_KEYS } from '../lib/settings';

const requireAdminMock = vi.hoisted(() => vi.fn(async () => 'admin_1'));
const toAuthGuardErrorResponseMock = vi.hoisted(() => vi.fn(() => null));
const adminRateLimitMock = vi.hoisted(() =>
  vi.fn(async () => ({ success: true, allowed: true, remaining: 9, reset: Date.now() + 60_000 }))
);
const recordAdminActionMock = vi.hoisted(() => vi.fn(async () => undefined));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (operations: unknown[]) => Promise.all(operations as Promise<unknown>[])),
  setting: {
    findMany: vi.fn(),
    upsert: vi.fn(async ({ where, update, create }: { where: { key: string }; update: { value: string }; create: { value: string } }) => ({
      key: where.key,
      value: update.value ?? create.value,
    })),
  },
}));
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/auth', () => ({
  requireAdmin: requireAdminMock,
  toAuthGuardErrorResponse: toAuthGuardErrorResponseMock,
}));
vi.mock('../lib/rateLimit', () => ({ adminRateLimit: adminRateLimitMock }));
vi.mock('../lib/admin-actions', () => ({ recordAdminAction: recordAdminActionMock }));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { GET } from '../app/api/admin/settings/export/route';
import { POST } from '../app/api/admin/settings/import/route';

describe('admin settings export route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue('admin_1');
    toAuthGuardErrorResponseMock.mockReturnValue(null);
    adminRateLimitMock.mockResolvedValue({ success: true, allowed: true, remaining: 9, reset: Date.now() + 60_000 });
    prismaMock.setting.findMany.mockResolvedValue([
      { key: SETTING_KEYS.MODERATOR_PERMISSIONS, value: '{"support":true}' },
      { key: SETTING_KEYS.TRAFFIC_ANALYTICS_PROVIDER, value: 'posthog' },
      { key: SETTING_KEYS.THEME_COLOR_PALETTE, value: '{"light":{},"dark":{}}' },
    ]);
  });

  it('exports newer non-theme admin settings and keeps theme-managed keys excluded', async () => {
    const response = await GET(new NextRequest('http://localhost/api/admin/settings/export'));
    const body = JSON.parse(await response.text()) as {
      _meta: Record<string, unknown>;
      settings: Record<string, string>;
    };

    expect(response.status).toBe(200);
    expect(Object.keys(body.settings)).not.toContain(SETTING_KEYS.THEME_COLOR_PALETTE);
    expect(body.settings[SETTING_KEYS.TRAFFIC_ANALYTICS_PROVIDER]).toBe('posthog');
    expect(body.settings[SETTING_KEYS.MODERATOR_PERMISSIONS]).toBe('{"support":true}');

    const snapshot = {
      meta: {
        type: body._meta.type,
        includesDefaults: body._meta.includesDefaults,
        excludesTheme: body._meta.excludesTheme,
      },
      newerKeys: {
        [SETTING_KEYS.ADMIN_ACTION_NOTIFICATION_ACTIONS]: body.settings[SETTING_KEYS.ADMIN_ACTION_NOTIFICATION_ACTIONS],
        [SETTING_KEYS.ADMIN_ALERT_EMAIL_TYPES]: body.settings[SETTING_KEYS.ADMIN_ALERT_EMAIL_TYPES],
        [SETTING_KEYS.SUPPORT_EMAIL_NOTIFICATION_TYPES]: body.settings[SETTING_KEYS.SUPPORT_EMAIL_NOTIFICATION_TYPES],
        [SETTING_KEYS.MODERATOR_PERMISSIONS]: body.settings[SETTING_KEYS.MODERATOR_PERMISSIONS],
        [SETTING_KEYS.TRAFFIC_ANALYTICS_PROVIDER]: body.settings[SETTING_KEYS.TRAFFIC_ANALYTICS_PROVIDER],
      },
      themeManagedExcluded: SETTING_KEYS.THEME_COLOR_PALETTE in body.settings,
      themeManagedDefaultStillPresentInRegistry: SETTING_DEFAULTS[SETTING_KEYS.THEME_COLOR_PALETTE] !== undefined,
    };

    expect(snapshot).toMatchInlineSnapshot(`
      {
        "meta": {
          "excludesTheme": true,
          "includesDefaults": true,
          "type": "saasybase-settings",
        },
        "newerKeys": {
          "ADMIN_ACTION_NOTIFICATION_ACTIONS": "[]",
          "ADMIN_ALERT_EMAIL_TYPES": "[\"refund\",\"new_purchase\",\"renewal\",\"upgrade\",\"downgrade\",\"payment_failed\",\"dispute\",\"other\"]",
          "MODERATOR_PERMISSIONS": "{\"support\":true}",
          "SUPPORT_EMAIL_NOTIFICATION_TYPES": "[\"new_ticket_to_admin\",\"admin_reply_to_user\",\"user_reply_to_admin\"]",
          "TRAFFIC_ANALYTICS_PROVIDER": "posthog",
        },
        "themeManagedDefaultStillPresentInRegistry": true,
        "themeManagedExcluded": false,
      }
    `);
  });

  it('round-trips a settings export back through the import route', async () => {
    const exportResponse = await GET(new NextRequest('http://localhost/api/admin/settings/export'));
    const payload = JSON.parse(await exportResponse.text()) as Record<string, unknown>;

    const importResponse = await POST(
      new NextRequest('http://localhost/api/admin/settings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
    const body = await importResponse.json();

    expect(importResponse.status).toBe(200);
    expect(body).toEqual({ imported: payload && typeof payload === 'object' && payload !== null && 'settings' in payload ? Object.keys((payload as { settings: Record<string, string> }).settings).length : 0, skippedTheme: 0 });
    expect(prismaMock.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: SETTING_KEYS.TRAFFIC_ANALYTICS_PROVIDER },
        update: { value: 'posthog' },
      })
    );
    expect(prismaMock.setting.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: SETTING_KEYS.THEME_COLOR_PALETTE } })
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
    expect(recordAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings.import',
        details: expect.objectContaining({ skippedTheme: 0 }),
      })
    );
  });
});