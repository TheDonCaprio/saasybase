import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../lib/auth';
import { adminRateLimit } from '../../../../lib/rateLimit';
import { Logger } from '../../../../lib/logger';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']);
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

export async function POST(request: NextRequest) {
  // Ensure caller is an authenticated admin
  let adminAuth: { userId: string } | undefined;
  try {
    adminAuth = { userId: await requireAdmin() };
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await adminRateLimit(adminAuth?.userId ?? null, request, 'admin-upload:legacy-form-data', {
    limit: 20,
    windowMs: 120_000
  });
  if (!rl.success && !rl.allowed) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable. Please retry shortly.' },
      { status: 503 }
    );
  }
  if (!rl.allowed) {
    const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB.' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const ext = EXTENSIONS[file.type] ?? '.jpg';
    const filename = `${timestamp}-${randomUUID().slice(0, 8)}${ext}`;

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'public', 'uploads');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // Write file to disk
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filePath = join(uploadsDir, filename);
    
    await writeFile(filePath, buffer);

    // Return the public URL
    const url = `/uploads/${filename}`;

    return NextResponse.json({
      url,
      filename,
      size: file.size,
      type: file.type,
    });

  } catch (error) {
    Logger.error('Upload error', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}