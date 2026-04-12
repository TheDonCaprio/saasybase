const LOGO_SCOPE = 'logo';
const FILE_SCOPE = 'file';

function buildKey(filename, scope = FILE_SCOPE) {
  if (scope === LOGO_SCOPE) {
    return `logo/${filename}`;
  }
  
  const now = new Date();
  const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  return `files/${folder}/${filename}`;
}

export async function saveLogo({ buffer, filename, mimetype }) {
  return saveAsset({ buffer, filename, mimetype, scope: LOGO_SCOPE });
}

export async function saveAdminFile({ buffer, filename, mimetype, scope = FILE_SCOPE }) {
  return saveAsset({ buffer, filename, mimetype, scope });
}

function buildPublicUrl({ key, bucket, region, endpoint, cdn }) {
  if (cdn) {
    if (cdn.startsWith('http')) return `${cdn.replace(/\/$/, '')}/${key}`;
    return `https://${cdn.replace(/\/$/, '')}/${key}`;
  }

  if (endpoint) {
    return `${endpoint.replace(/\/$/, '')}/${key}`;
  }

  if (bucket.includes('.')) {
    return `https://s3.${region}.amazonaws.com/${bucket}/${key}`;
  }

  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

function encodeFsCursor(index) {
  return Buffer.from(String(index), 'utf8').toString('base64');
}

function decodeFsCursor(cursor) {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(String(cursor), 'base64').toString('utf8');
    const value = parseInt(decoded, 10);
    if (Number.isFinite(value) && value >= 0) {
      return value;
    }
  } catch {
    // ignore invalid cursor
  }
  return 0;
}

export async function listAdminFiles({ limit = 20, cursor = null, search = null, scope = FILE_SCOPE } = {}) {
  const storage = process.env.LOGO_STORAGE || 'fs';
  const safeLimit = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 20, 100));
  const normalizedSearch = typeof search === 'string' && search.trim() ? search.trim().toLowerCase() : null;

  if (storage === 's3') {
    return listAdminFilesFromS3({ limit: safeLimit, cursor, search: normalizedSearch, scope });
  }

  return listAdminFilesFromFs({ limit: safeLimit, cursor, search: normalizedSearch, scope });
}

export async function deleteAdminFile({ key }) {
  if (!key || typeof key !== 'string') {
    throw new Error('File key is required');
  }

  const normalizedKey = key.trim();
  const validPrefixes = ['files/', 'logo/', 'blog/'];
  if (!validPrefixes.some(prefix => normalizedKey.startsWith(prefix))) {
    throw new Error('Invalid file key');
  }

  const storage = process.env.LOGO_STORAGE || 'fs';
  if (storage === 's3') {
    return deleteAdminFileFromS3(normalizedKey);
  }

  return deleteAdminFileFromFs(normalizedKey);
}

async function listAdminFilesFromS3({ limit, cursor, search, scope = FILE_SCOPE }) {
  const bucket = process.env.LOGO_S3_BUCKET;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!bucket || !region) {
    throw new Error('S3 not configured (LOGO_S3_BUCKET or AWS_REGION missing)');
  }

  const endpoint = process.env.LOGO_S3_ENDPOINT || undefined;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const forcePathStyle = !!endpoint || bucket.includes('.');

  const clientOptions = { region, forcePathStyle };
  if (endpoint) clientOptions.endpoint = endpoint;
  if (accessKeyId && secretAccessKey) {
    clientOptions.credentials = { accessKeyId, secretAccessKey };
  }

  const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
  const client = new S3Client(clientOptions);

  const searchTerm = search || null;
  const startIndex = decodeFsCursor(cursor);
  const allMatches = [];

  const buildInfo = (key, size, uploadedAt) => ({
    key,
    url: buildPublicUrl({
      key,
      bucket,
      region,
      endpoint,
      cdn: process.env.LOGO_CDN_DOMAIN || null,
    }),
    filename: key.split('/').pop() || key,
    size: typeof size === 'number' ? size : undefined,
    uploadedAt: uploadedAt || undefined,
  });

  let continuationToken = null;

  const filterMatch = (item) => {
    if (!item || typeof item.Key !== 'string' || item.Key.endsWith('/')) return false;
    if (!searchTerm) return true;
    return item.Key.toLowerCase().includes(searchTerm);
  };

  let prefixToUse = 'files/';
  if (scope === LOGO_SCOPE) prefixToUse = 'logo/';

  while (true) {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefixToUse,
      ContinuationToken: continuationToken || undefined,
      MaxKeys: 1000,
    }));

    const contents = Array.isArray(response.Contents) ? response.Contents : [];
    for (const item of contents) {
      if (!filterMatch(item)) {
        continue;
      }

      const uploadedAt = item.LastModified instanceof Date
        ? item.LastModified.toISOString()
        : (item.LastModified ? new Date(item.LastModified).toISOString() : undefined);

      allMatches.push(buildInfo(
        item.Key,
        typeof item.Size === 'number' ? item.Size : undefined,
        uploadedAt,
      ));
    }

    continuationToken = response.NextContinuationToken || null;
    if (!(response.IsTruncated === true && continuationToken)) {
      break;
    }
  }

  allMatches.sort((a, b) => {
    const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    return tb - ta;
  });

  const normalizedStart = startIndex >= 0 && startIndex < allMatches.length ? startIndex : 0;
  const files = allMatches.slice(normalizedStart, normalizedStart + limit);
  const nextIndex = normalizedStart + files.length;
  const hasMore = nextIndex < allMatches.length;

  return {
    files,
    nextCursor: hasMore ? encodeFsCursor(nextIndex) : null,
    hasMore,
    total: allMatches.length,
  };
}

async function listAdminFilesFromFs({ limit, cursor, search, scope = FILE_SCOPE }) {
  const { access, readdir, stat } = await import('fs/promises');
  const path = await import('path');

  const uploadsDir = path.join(process.cwd(), 'public', '_uploads');
  let subdir = 'files';
  if (scope === LOGO_SCOPE) subdir = 'logo';
  
  const filesDir = path.join(uploadsDir, subdir);

  try {
    await access(filesDir);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { files: [], nextCursor: null, hasMore: false, total: 0 };
    }
    throw error;
  }

  const collected = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const stats = await stat(fullPath);
        const relativeKey = path.relative(uploadsDir, fullPath).split(path.sep).join('/');
        collected.push({
          key: relativeKey,
          stats,
        });
      }
    }
  }

  await walk(filesDir);

  collected.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);

  const filtered = search
    ? collected.filter(({ key }) => key.toLowerCase().includes(search))
    : collected;

  const total = filtered.length;
  const startIndex = decodeFsCursor(cursor);
  const normalizedStart = startIndex >= 0 && startIndex < total ? startIndex : 0;
  const slice = filtered.slice(normalizedStart, normalizedStart + limit);
  const nextIndex = normalizedStart + slice.length;
  const hasMore = nextIndex < total;

  const files = slice.map(({ key, stats }) => ({
    key,
    url: `/_uploads/${key}`,
    filename: key.split('/').pop() || key,
    size: stats.size,
    uploadedAt: stats.mtime instanceof Date ? stats.mtime.toISOString() : undefined,
  }));

  return {
    files,
    nextCursor: hasMore ? encodeFsCursor(nextIndex) : null,
    hasMore,
    total,
  };
}

async function deleteAdminFileFromS3(key) {
  const bucket = process.env.LOGO_S3_BUCKET;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!bucket || !region) {
    throw new Error('S3 not configured (LOGO_S3_BUCKET or AWS_REGION missing)');
  }

  const endpoint = process.env.LOGO_S3_ENDPOINT || undefined;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const forcePathStyle = !!endpoint || bucket.includes('.');

  const clientOptions = { region, forcePathStyle };
  if (endpoint) clientOptions.endpoint = endpoint;
  if (accessKeyId && secretAccessKey) {
    clientOptions.credentials = { accessKeyId, secretAccessKey };
  }

  const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(clientOptions);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

  return true;
}

async function deleteAdminFileFromFs(key) {
  const { access, unlink, readdir, rm } = await import('fs/promises');
  const path = await import('path');

  const uploadsDir = path.join(process.cwd(), 'public', '_uploads');
  const targetPath = path.join(uploadsDir, key);

  try {
    await access(targetPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return true;
    }
    throw error;
  }

  try {
    await unlink(targetPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return true;
    }
    throw error;
  }

  const filesRoot = path.join(uploadsDir, 'files');
  const blogRoot = path.join(uploadsDir, 'blog');
  const logoRoot = path.join(uploadsDir, 'logo');
  let directory = path.dirname(targetPath);

  // Helper to determine if a directory is within one of our upload roots
  const isWithinRoot = (dir) => {
    return (dir.startsWith(filesRoot) && dir.length >= filesRoot.length) ||
           (dir.startsWith(blogRoot) && dir.length >= blogRoot.length) || 
           (dir.startsWith(logoRoot) && dir.length >= logoRoot.length);
  };
  
  // Helper to determine if a directory is EXACTLY one of our upload roots
  const isExactlyRoot = (dir) => {
    return dir === filesRoot || dir === blogRoot || dir === logoRoot;
  };

  while (isWithinRoot(directory)) {
    if (isExactlyRoot(directory)) {
      break;
    }

    let entries;
    try {
      entries = await readdir(directory);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        break;
      }
      throw error;
    }

    if (entries.length > 0) {
      break;
    }

    await rm(directory, { recursive: false, force: true });
    directory = path.dirname(directory);
  }

  return true;
}

async function saveAsset({ buffer, filename, mimetype, scope = FILE_SCOPE }) {
  const storage = process.env.LOGO_STORAGE || 'fs';
  const key = buildKey(filename, scope);

  if (storage === 's3') {
    // S3 mode - dynamic import so this module is optional during install
    const bucket = process.env.LOGO_S3_BUCKET;
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
    if (!bucket || !region) {
      throw new Error('S3 not configured (LOGO_S3_BUCKET or AWS_REGION missing)');
    }

    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

    // Support optional custom S3 endpoint (for S3-compatible providers) and
    // handle dotted bucket names (which break virtual-hosted style TLS).
    const endpoint = process.env.LOGO_S3_ENDPOINT || undefined;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    const forcePathStyle = !!endpoint || (bucket && bucket.includes('.'));

    const clientOptions = { region, forcePathStyle };
    if (endpoint) clientOptions.endpoint = endpoint;
    if (accessKeyId && secretAccessKey) {
      clientOptions.credentials = { accessKeyId, secretAccessKey };
    }

    const client = new S3Client(clientOptions);
    try {
      // Do not set ACLs. Use CloudFront + Origin Access Identity or bucket policy
      // to control public access. Setting ACLs may be blocked by S3 Block Public Access.
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      }));

      const cdn = process.env.LOGO_CDN_DOMAIN || null;
      return buildPublicUrl({ key, bucket, region, endpoint, cdn });
    } catch (err) {
      // Log detailed error for debugging (do NOT leak secrets to client responses)
      console.error('S3 upload error', {
        message: err && err.message,
        code: err && err.name,
        stack: err && err.stack ? err.stack.split('\n').slice(0,3).join('\n') : undefined,
      });
      throw new Error('S3 upload failed');
    }
  }

  // Default: save to local filesystem under public/_uploads
  const { mkdir, writeFile } = await import('fs/promises');
  const path = await import('path');
  const uploadsDir = path.join(process.cwd(), 'public', '_uploads');
  const outPath = path.join(uploadsDir, key);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, buffer);
  return `/_uploads/${key}`;
}
