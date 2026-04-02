import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAdminAuth } from '../../../../../lib/route-guards';
import { toAuthGuardErrorResponse } from '../../../../../lib/auth';
import { recordAdminAction } from '../../../../../lib/admin-actions';
import { saveAdminFile, saveLogo } from '../../../../../lib/logoStorage';
import { adminRateLimit } from '../../../../../lib/rateLimit';

const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']);
const EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
};

const LOGO_SCOPE = 'logo';
const FILE_SCOPE = 'file';
const BLOG_SCOPE = 'blog';

type UploadScope = typeof LOGO_SCOPE | typeof FILE_SCOPE | typeof BLOG_SCOPE;

type DomPurifyLike = {
  sanitize: (input: string, options?: Record<string, unknown>) => string;
};

let cachedDomPurify: DomPurifyLike | null = null;

const XML_MIME_CANDIDATES = new Set(['application/xml', 'text/xml']);

function looksLikeSvg(buffer: Buffer): boolean {
  const head = buffer.slice(0, 4096).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  return /<svg(?:\s|>)/i.test(head) || /<svg(?:\s|>)/i.test(head.replace(/<\?xml[^>]*\?>/i, '').trimStart());
}

async function detectMime(buffer: Buffer): Promise<string | null> {
  try {
    const mod = await import('file-type');
    const fn = (mod as unknown as { fileTypeFromBuffer?: (input: Buffer) => Promise<{ mime: string } | undefined> }).fileTypeFromBuffer;
    if (typeof fn === 'function') {
      const detected = await fn(buffer);
      if (detected?.mime) return detected.mime;
    }
  } catch (error) {
    // Detection failure is non-fatal; fall back to header hint below.
    console.warn('file-type detection failed', error);
  }
  if (looksLikeSvg(buffer)) {
    return 'image/svg+xml';
  }
  return null;
}

function resolveEffectiveMime(detectedMime: string | null, hintedMime: string, buffer: Buffer): string | null {
  if (detectedMime && ALLOWED_MIMES.has(detectedMime)) {
    return detectedMime;
  }

  if (looksLikeSvg(buffer) && (hintedMime === 'image/svg+xml' || (detectedMime ? XML_MIME_CANDIDATES.has(detectedMime) : false))) {
    return 'image/svg+xml';
  }

  if (hintedMime && ALLOWED_MIMES.has(hintedMime)) {
    return hintedMime;
  }

  return detectedMime;
}

async function getDomPurify(): Promise<DomPurifyLike> {
  if (cachedDomPurify) return cachedDomPurify;

  const [{ JSDOM }, createDOMPurify] = await Promise.all([
    import('jsdom'),
    import('dompurify')
  ]);

  const { window } = new JSDOM('');
  const DOMPurify = (createDOMPurify as unknown as { default: (win: Window & typeof globalThis) => DomPurifyLike }).default(window as unknown as Window & typeof globalThis);
  cachedDomPurify = DOMPurify;
  return DOMPurify;
}

async function sanitizeSvg(buffer: Buffer): Promise<Buffer> {
  const svgText = buffer.toString('utf8');
  const domPurify = await getDomPurify();
  const sanitized = domPurify.sanitize(svgText, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_URI_SAFE_ATTR: ['href', 'xlink:href'],
    FORBID_TAGS: ['script', 'foreignObject'],
    FORBID_ATTR: ['onload', 'onerror', 'onmouseover', 'onclick']
  });

  if (!sanitized || typeof sanitized !== 'string') {
    throw new Error('Failed to sanitize SVG upload');
  }

  return Buffer.from(sanitized, 'utf8');
}

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

function resolveScope(req: NextRequest): UploadScope {
  const url = new URL(req.url);
  const queryScope = (url.searchParams.get('scope') || '').toLowerCase();
  const headerScope = (req.headers.get('x-upload-scope') || '').toLowerCase();
  const detected = headerScope || queryScope;
  if (detected === LOGO_SCOPE) return LOGO_SCOPE;
  if (detected === BLOG_SCOPE) return BLOG_SCOPE;
  return FILE_SCOPE;
}

function sanitizeBaseName(input: string): string {
  const withoutExtension = input.replace(/\.[^.]+$/, '');
  const slug = withoutExtension.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug) return slug.slice(0, 64);
  return 'asset';
}

function deriveStoredFilename(scope: UploadScope, originalName: string | null, ext: string): string {
  if (scope === LOGO_SCOPE) {
    return `logo-${Date.now()}${ext}`;
  }
  const safeBase = sanitizeBaseName(originalName ?? '');
  const unique = randomUUID().slice(0, 8);
  return `${safeBase}-${unique}${ext}`;
}

export async function POST(req: NextRequest) {
  // Ensure caller is an authenticated admin
  let adminAuth;
  try {
    adminAuth = await requireAdminAuth();
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scope = resolveScope(req);
  const rateKey = `admin-upload:${scope}`;
  const rl = await adminRateLimit(adminAuth?.userId ?? null, req, rateKey, { limit: 20, windowMs: 120_000 });
  if (!rl.success && !rl.allowed) {
    return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
  }
  if (!rl.allowed) {
    const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
  }

  try {
    const hintedMime = (req.headers.get('x-mimetype') || '').toLowerCase();
    const originalName = req.headers.get('x-filename') || null;
    const arrayBuffer = await req.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer) as Buffer;

    const detectedMime = await detectMime(buffer);
    const effectiveMime = resolveEffectiveMime(detectedMime, hintedMime, buffer);

    if (!effectiveMime || !ALLOWED_MIMES.has(effectiveMime)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    // basic size guard (2MB)
    const MAX_BYTES = 2 * 1024 * 1024;
    if (buffer.length > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 2MB)' }, { status: 413 });
    }

    if (effectiveMime === 'image/svg+xml') {
      buffer = (await sanitizeSvg(buffer as Buffer)) as Buffer;
    }

    const ext = EXTENSIONS[effectiveMime];
    if (!ext) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const safeName = deriveStoredFilename(scope, originalName, ext);
    let url;
    if (scope === LOGO_SCOPE) {
      url = await saveLogo({ buffer, filename: safeName, mimetype: effectiveMime });
    } else {
      url = await saveAdminFile({ buffer, filename: safeName, mimetype: effectiveMime, scope });
    }

    await recordAdminAction({
      actorId: adminAuth?.userId ?? 'unknown',
      actorRole: 'ADMIN',
      action: 'file.upload',
      targetType: 'file',
      details: { scope, filename: safeName },
    });
    return NextResponse.json({ url });
  } catch (error: unknown) {
    console.error('file upload error', toErrorMessage(error));
    if (process.env.NODE_ENV !== 'production') {
      const message = toErrorMessage(error);
      return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 });
    }

    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
