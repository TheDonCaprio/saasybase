import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { SETTING_KEYS, THEME_SETTING_KEYS } from '../lib/settings';

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

import { GET } from '../app/api/admin/theme/export/route';
import { POST } from '../app/api/admin/theme/import/route';

describe('admin theme export route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue('admin_1');
    toAuthGuardErrorResponseMock.mockReturnValue(null);
    adminRateLimitMock.mockResolvedValue({ success: true, allowed: true, remaining: 9, reset: Date.now() + 60_000 });
    prismaMock.setting.findMany.mockResolvedValue([
      { key: SETTING_KEYS.THEME_FOOTER_TEXT, value: 'Custom footer copy' },
      { key: SETTING_KEYS.HEADER_HEIGHT, value: '72' },
      { key: SETTING_KEYS.BLOG_LISTING_STYLE, value: 'magazine' },
    ]);
  });

  it('exports exactly the current theme registry keys so coverage drifts fail fast', async () => {
    const response = await GET(new NextRequest('http://localhost/api/admin/theme/export'));
    const body = JSON.parse(await response.text()) as {
      _meta: Record<string, unknown>;
      settings: Record<string, string>;
    };

    expect(response.status).toBe(200);
    expect(Object.keys(body.settings).sort()).toEqual([...THEME_SETTING_KEYS].sort());
    expect(body._meta.count).toBe(THEME_SETTING_KEYS.length);
    expect(body.settings[SETTING_KEYS.THEME_FOOTER_TEXT]).toBe('Custom footer copy');
    expect(body.settings[SETTING_KEYS.HEADER_HEIGHT]).toBe('72');
    expect(body.settings[SETTING_KEYS.BLOG_LISTING_STYLE]).toBe('magazine');

    expect({
      type: body._meta.type,
      count: body._meta.count,
      firstFiveKeys: Object.keys(body.settings).sort().slice(0, 5),
      lastFiveKeys: Object.keys(body.settings).sort().slice(-5),
    }).toMatchInlineSnapshot(`
      {
        "count": 32,
        "firstFiveKeys": [
          "BLOG_HTML_AFTER_LAST_PARAGRAPH",
          "BLOG_HTML_BEFORE_FIRST_PARAGRAPH",
          "BLOG_HTML_MIDDLE_OF_POST",
          "BLOG_LISTING_PAGE_SIZE",
          "BLOG_LISTING_STYLE",
        ],
        "lastFiveKeys": [
          "THEME_CUSTOM_HEAD",
          "THEME_CUSTOM_JS",
          "THEME_FOOTER_LINKS",
          "THEME_FOOTER_TEXT",
          "THEME_HEADER_LINKS",
        ],
        "type": "saasybase-theme",
      }
    `);
  });

  it('round-trips a theme export back through the import route', async () => {
    const exportResponse = await GET(new NextRequest('http://localhost/api/admin/theme/export'));
    const payload = JSON.parse(await exportResponse.text()) as { settings: Record<string, string> };

    const importResponse = await POST(
      new NextRequest('http://localhost/api/admin/theme/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
    const body = await importResponse.json();

    expect(importResponse.status).toBe(200);
    expect(body).toEqual({ imported: THEME_SETTING_KEYS.length, skipped: 0 });
    expect(prismaMock.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: SETTING_KEYS.THEME_FOOTER_TEXT },
        update: { value: 'Custom footer copy' },
      })
    );
    expect(prismaMock.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: SETTING_KEYS.HEADER_HEIGHT },
        update: { value: '72' },
      })
    );
    expect(prismaMock.setting.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: SETTING_KEYS.SITE_NAME } })
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/', 'layout');
    expect(recordAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'theme.import',
        details: expect.objectContaining({ skipped: 0 }),
      })
    );
  });
});