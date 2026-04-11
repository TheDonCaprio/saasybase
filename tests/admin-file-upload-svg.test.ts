import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAdminPageAccessMock = vi.hoisted(() => vi.fn(async () => ({ userId: 'admin_1' })));
const toAuthGuardErrorResponseMock = vi.hoisted(() => vi.fn(() => null));
const recordAdminActionMock = vi.hoisted(() => vi.fn(async () => undefined));
const saveAdminFileMock = vi.hoisted(() => vi.fn(async () => '/uploads/test.svg'));
const saveLogoMock = vi.hoisted(() => vi.fn(async () => '/logos/test.svg'));
const adminRateLimitMock = vi.hoisted(() => vi.fn(async () => ({ success: true, allowed: true, reset: Date.now() + 60_000 })));
const fileTypeFromBufferMock = vi.hoisted(() => vi.fn(async () => ({ mime: 'application/xml' })));
const sanitizeMock = vi.hoisted(() => vi.fn((input: string) => input));

vi.mock('../lib/route-guards', () => ({
  requireAdminPageAccess: requireAdminPageAccessMock,
}));

vi.mock('../lib/auth', () => ({
  toAuthGuardErrorResponse: toAuthGuardErrorResponseMock,
}));

vi.mock('../lib/admin-actions', () => ({
  recordAdminAction: recordAdminActionMock,
}));

vi.mock('../lib/logoStorage', () => ({
  saveAdminFile: saveAdminFileMock,
  saveLogo: saveLogoMock,
}));

vi.mock('../lib/rateLimit', () => ({
  adminRateLimit: adminRateLimitMock,
}));

vi.mock('file-type', () => ({
  fileTypeFromBuffer: fileTypeFromBufferMock,
}));

vi.mock('jsdom', () => ({
  JSDOM: class {
    window = {} as Window & typeof globalThis;
  },
}));

vi.mock('dompurify', () => ({
  default: vi.fn(() => ({
    sanitize: sanitizeMock,
  })),
}));

import { POST } from '../app/api/admin/file/upload/route';

describe('POST /api/admin/file/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminPageAccessMock.mockResolvedValue({ userId: 'admin_1' });
    toAuthGuardErrorResponseMock.mockReturnValue(null);
    adminRateLimitMock.mockResolvedValue({ success: true, allowed: true, reset: Date.now() + 60_000 });
    fileTypeFromBufferMock.mockResolvedValue({ mime: 'application/xml' });
    saveAdminFileMock.mockResolvedValue('/uploads/test.svg');
    sanitizeMock.mockImplementation((input: string) => input);
  });

  it('accepts XML-prefixed SVG uploads when file-type reports XML', async () => {
    const svg = '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" /></svg>';

    const request = new NextRequest('http://localhost/api/admin/file/upload', {
      method: 'POST',
      headers: {
        'x-filename': 'logo.svg',
        'x-mimetype': 'image/svg+xml',
        'x-upload-scope': 'file',
      },
      body: svg,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ url: '/uploads/test.svg' });
    expect(fileTypeFromBufferMock).toHaveBeenCalledOnce();
    expect(sanitizeMock).toHaveBeenCalledWith(
      svg,
      expect.objectContaining({
        USE_PROFILES: { svg: true, svgFilters: true },
      }),
    );
    expect(saveAdminFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mimetype: 'image/svg+xml',
      }),
    );
    expect(recordAdminActionMock).toHaveBeenCalledOnce();
  });
});