import { Prisma, SitePage } from '@prisma/client';
import { prisma } from './prisma';
import { Logger } from './logger';
import { sanitizeRichText, summarizePlainText } from './htmlSanitizer';
import { getSiteName, getSupportEmail, SETTING_DEFAULTS, SETTING_KEYS } from './settings';
import { buildStringContainsFilter, sanitizeWhereForInsensitiveSearch } from './queryUtils';

export type SitePageRecord = SitePage;

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const CORE_PAGES: Array<{
  slug: string;
  title: string;
  description: string;
  content: string;
}> = [
  {
    slug: 'terms',
    title: 'Terms and Conditions',
    description: 'Understand the rules that govern access to {{siteName}}.',
    content: `<h1>Terms and Conditions</h1>
  <p>These terms outline the agreement between you and {{siteName}}. Please review them carefully before using the service.</p>
<h2>Using the service</h2>
<p>By accessing or using {{siteName}}, you agree to comply with all applicable laws and respect the intellectual property of others.</p>
<h2>Subscriptions and billing</h2>
<p>Subscriptions renew based on the plan you select. You may cancel at any time to prevent future renewals.</p>
<h2>Acceptable use</h2>
<p>You may not attempt to reverse engineer the service, disrupt other users, or upload malicious code.</p>
`
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    description: 'Learn how your data is collected, stored, and protected.',
    content: `<h1>Privacy Policy</h1>
  <p>Your privacy matters. This policy explains what data {{siteName}} collects and how it is used.</p>
<h2>Information we collect</h2>
<p>We collect account details, usage metrics, and optional profile information you provide.</p>
<h2>How we use information</h2>
<p>Data is used to personalize your experience, support the product, and improve performance.</p>
<h2>Contact</h2>
<p>If you have any privacy questions, contact our team at {{supportEmail}}.</p>
`
  },
  {
    slug: 'refund-policy',
    title: 'Refund Policy',
    description: 'Clear expectations on refunds, prorations, and dispute handling.',
    content: `<h1>Refund Policy</h1>
  <p>We want you to love {{siteName}}. This policy describes when refunds are available.</p>
<h2>Subscriptions</h2>
<p>Refunds are evaluated case-by-case within 14 days of purchase. Contact support with your order ID.</p>
<h2>One-time purchases</h2>
<p>Non-subscription purchases are refundable within 7 days if the item was not downloaded or used.</p>
<h2>Charge disputes</h2>
<p>Please reach out to our support team before filing a dispute so we can help resolve the issue quickly.</p>
`
  },
  {
    slug: 'contact',
    title: 'Contact Us',
    description: 'Reach the {{siteName}} team for support, sales, or partnership inquiries.',
    content: `<h1>Contact {{siteName}}</h1>
<p>Need help or want to partner with us? We would love to hear from you.</p>
<h2>Support</h2>
<p>Email <a href="mailto:{{supportEmail}}">{{supportEmail}}</a> for billing or technical help.</p>
<h2>Partnerships</h2>
<p>Interested in collaborating? Contact <a href="mailto:{{partnersEmail}}">{{partnersEmail}}</a>.</p>
<h2>Community</h2>
<p>Join the conversation on our community forum to share feedback and ideas.</p>
`
  }
];

const CORE_PAGE_LOOKUP = new Map(CORE_PAGES.map((page) => [page.slug, page] as const));

export const SITE_PAGE_SLUG_REGEX = /^[a-z0-9][a-z0-9\-]{1,63}$/;

const DEFAULT_COLLECTION = 'page';

export type SitePageCollection = 'page' | 'blog' | (string & {});

function resolveCollection(collection?: string | null): SitePageCollection {
  const normalized = (collection ?? DEFAULT_COLLECTION).trim().toLowerCase();
  if (!normalized) return DEFAULT_COLLECTION;
  return normalized as SitePageCollection;
}

function shouldEnsureCorePages(collection: SitePageCollection): boolean {
  return collection === DEFAULT_COLLECTION;
}

async function ensureCorePagesIfNeeded(collection: SitePageCollection): Promise<void> {
  if (shouldEnsureCorePages(collection)) {
    await ensureCorePages();
  }
}

export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function clampDescription(description: string | null | undefined, fallbackContent: string): string {
  if (description && description.trim()) {
    return summarizePlainText(description, 280);
  }

  return summarizePlainText(fallbackContent, 280);
}

export async function purgeExpiredTrashedPages(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);
  const result = await prisma.sitePage.deleteMany({
    where: {
      trashedAt: {
        not: null,
        lt: cutoff
      }
    } as unknown as Prisma.SitePageWhereInput
  });
  if (result.count > 0) {
    Logger.info('Purged expired trashed pages', { removed: result.count });
  }
  return result.count;
}

async function assertPagesAreNotSystem(ids: string[], collection?: SitePageCollection): Promise<void> {
  if (!ids.length) return;
  const records = await prisma.sitePage.findMany({
    where: {
      id: { in: ids },
      ...(collection ? { collection } : {})
    } as unknown as Prisma.SitePageWhereInput,
    select: { id: true, system: true, slug: true }
  });
  const systemPages = records.filter((record) => record.system || CORE_PAGE_LOOKUP.has(record.slug));
  if (systemPages.length > 0) {
    throw new Error('System pages cannot be moved to trash or deleted.');
  }
}

export async function trashSitePages(ids: string[], options: SitePageQueryOptions = {}): Promise<number> {
  if (!ids.length) return 0;
  const collection = resolveCollection(options.collection);
  await assertPagesAreNotSystem(ids, collection);
  const now = new Date();
  const result = await prisma.sitePage.updateMany({
    where: {
      id: { in: ids },
      collection
    } as unknown as Prisma.SitePageWhereInput,
    data: {
      trashedAt: now,
      published: false,
      publishedAt: null
    } as unknown as Prisma.SitePageUpdateManyMutationInput
  });
  return result.count;
}

export async function restoreSitePages(ids: string[], options: SitePageQueryOptions = {}): Promise<number> {
  if (!ids.length) return 0;
  const collection = resolveCollection(options.collection);
  const result = await prisma.sitePage.updateMany({
    where: {
      id: { in: ids },
      collection
    } as unknown as Prisma.SitePageWhereInput,
    data: {
      trashedAt: null
    } as unknown as Prisma.SitePageUpdateManyMutationInput
  });
  return result.count;
}

export async function permanentlyDeleteSitePages(
  ids: string[],
  options: SitePageQueryOptions = {}
): Promise<number> {
  if (!ids.length) return 0;
  const collection = resolveCollection(options.collection);
  await assertPagesAreNotSystem(ids, collection);
  const result = await prisma.sitePage.deleteMany({
    where: {
      id: { in: ids },
      collection
    } as unknown as Prisma.SitePageWhereInput
  });
  return result.count;
}

export async function ensureCorePages(): Promise<void> {
  for (const definition of CORE_PAGES) {
    const existing = await prisma.sitePage.findFirst({
      where: {
        collection: DEFAULT_COLLECTION,
        slug: definition.slug
      } as unknown as Prisma.SitePageWhereInput
    });
    if (!existing) {
      // Replace known hardcoded support/partner addresses in the static
      // core page definitions with the current support email from
      // settings (fall back to env/defaults). This keeps seeded/static
      // content consistent with the admin-configured SUPPORT_EMAIL.
      const supportEmail = await getSupportEmail().catch(() => process.env.SUPPORT_EMAIL || 'support@saasybase.com');
      const partnersEmail = process.env.PARTNERS_EMAIL || 'partners@saasybase.com';
      const siteName = await getSiteName().catch(() => process.env.NEXT_PUBLIC_SITE_NAME || 'SaaSyBase');

      const contentWithEmails = String(definition.content)
        .replace(/support@saasybase\.com/gi, supportEmail)
        .replace(/partners@saasybase\.com/gi, partnersEmail)
        .replace(/SaaSyBase Pro/gi, siteName)
        .replace(/\{\{siteName\}\}/g, siteName)
        .replace(/\{\{supportEmail\}\}/g, supportEmail)
        .replace(/\{\{partnersEmail\}\}/g, partnersEmail);

      const sanitizedContent = await sanitizeRichText(contentWithEmails);
      const description = clampDescription((definition.description || '').replace(/SaaSyBase Pro/gi, siteName).replace(/\{\{siteName\}\}/g, siteName), sanitizedContent);
      await prisma.sitePage.create({
        data: {
          collection: DEFAULT_COLLECTION,
          slug: definition.slug,
          title: definition.title,
          description,
          content: sanitizedContent,
          system: true,
          published: true,
          publishedAt: new Date()
        } as unknown as Prisma.SitePageCreateInput
      });
      continue;
    }

    if (!existing.system || !existing.published) {
      await prisma.sitePage.update({
        where: { id: existing.id },
        data: {
          system: true,
          published: true,
          publishedAt: existing.publishedAt ?? new Date()
        }
      });
    }
  }
}

export interface SitePageQueryOptions {
  collection?: SitePageCollection;
}

export async function getPublishedPageBySlug(
  slug: string,
  options: SitePageQueryOptions = {}
): Promise<SitePageRecord | null> {
  const normalized = normalizeSlug(slug);
  const collection = resolveCollection(options.collection);
  await ensureCorePagesIfNeeded(collection);
  const page = await prisma.sitePage.findFirst({
    where: {
      slug: normalized,
      collection,
      trashedAt: null,
      OR: [
        { published: true },
        { system: true }
      ]
    } as unknown as Prisma.SitePageWhereInput,
    orderBy: { updatedAt: 'desc' }
  });
  return page as SitePageRecord | null;
}

export async function buildSitePageMetadata(
  slug: string,
  options: SitePageQueryOptions = {}
) {
  const page = await getPublishedPageBySlug(slug, options);
  if (!page) {
    return {
      title: 'Page not found'
    } as const;
  }

  const siteName = await getSiteName().catch(() => process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME]);
  const description = page.description ?? undefined;
  const title = `${page.title} | ${siteName}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description
    },
    twitter: {
      title,
      description
    }
  } as const;
}

export async function getPageById(
  id: string,
  options: SitePageQueryOptions = {}
): Promise<SitePageRecord | null> {
  const collection = resolveCollection(options.collection);
  await ensureCorePagesIfNeeded(collection);
  const page = await prisma.sitePage.findFirst({
    where: { id, collection } as unknown as Prisma.SitePageWhereInput
  });
  return page as SitePageRecord | null;
}

export async function listAllPages(options: SitePageQueryOptions = {}): Promise<SitePageRecord[]> {
  const collection = resolveCollection(options.collection);
  await ensureCorePagesIfNeeded(collection);
  const pages = await prisma.sitePage.findMany({
    orderBy: [
      { system: 'desc' },
      { title: 'asc' }
    ],
    where: {
      trashedAt: null,
      collection
    } as unknown as Prisma.SitePageWhereInput
  });
  return pages as SitePageRecord[];
}

export interface ListSitePagesPaginatedOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'all' | 'published' | 'draft' | 'trashed' | 'system';
  sortBy?: 'publishedAt' | 'updatedAt' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  includeStatusTotals?: boolean;
  collection?: SitePageCollection;
}

export interface ListSitePagesPaginatedResult {
  pages: SitePageRecord[];
  page: number;
  pageSize: number;
  totalCount: number;
  overallTotals?: {
    total: number;
    published: number;
    draft: number;
    trashed: number;
    system: number;
  };
}

export async function listSitePagesPaginated(
  options: ListSitePagesPaginatedOptions = {}
): Promise<ListSitePagesPaginatedResult> {
  const collection = resolveCollection(options.collection);
  await ensureCorePagesIfNeeded(collection);
  await purgeExpiredTrashedPages();

  const rawPage = Number.isFinite(options.page) ? Number(options.page) : 1;
  const rawLimit = Number.isFinite(options.limit) ? Number(options.limit) : 20;

  const page = Math.max(1, Math.floor(rawPage));
  const pageSize = Math.min(100, Math.max(1, Math.floor(rawLimit)));
  const skip = (page - 1) * pageSize;

  const dbUrl = process.env.DATABASE_URL || '';
  const where: Record<string, unknown> = {
    collection
  };
  if (options.status === 'trashed') {
    where.trashedAt = {
      not: null
    };
  } else {
    where.trashedAt = null;
    if (options.status === 'published') {
      where.published = true;
    } else if (options.status === 'draft') {
      where.published = false;
    } else if (options.status === 'system') {
      where.system = true;
    }
  }

  const searchTerm = options.search?.trim();
  if (searchTerm) {
    where.OR = [
      { title: buildStringContainsFilter(searchTerm, dbUrl) },
      { slug: buildStringContainsFilter(searchTerm, dbUrl) },
      { description: buildStringContainsFilter(searchTerm, dbUrl) }
    ];
  }

  const sanitizedWhere = sanitizeWhereForInsensitiveSearch(where, dbUrl) as Prisma.SitePageWhereInput;

  // Build order by based on sortBy option and status
  let orderBy: Prisma.SitePageOrderByWithRelationInput[];
  if (options.status === 'trashed') {
    orderBy = [
      { title: 'asc' }
    ];
  } else {
    const sortBy = options.sortBy || 'publishedAt';
    const sortOrder = options.sortOrder || 'desc';
    if (sortBy === 'publishedAt') {
      orderBy = [
        { publishedAt: sortOrder },
        { title: 'asc' }
      ];
    } else if (sortBy === 'createdAt') {
      orderBy = [
        { createdAt: sortOrder },
        { title: 'asc' }
      ];
    } else { // updatedAt
      orderBy = [
        { updatedAt: sortOrder },
        { title: 'asc' }
      ];
    }
  }

  const [pages, totalCount] = await Promise.all([
    prisma.sitePage.findMany({
      where: sanitizedWhere,
      skip,
      take: pageSize,
      orderBy
    }),
    prisma.sitePage.count({ where: sanitizedWhere })
  ]);

  let overallTotals: ListSitePagesPaginatedResult['overallTotals'];
  if (options.includeStatusTotals) {
    const [activeTotal, published, trashed, system] = await Promise.all([
      prisma.sitePage.count({
        where: { trashedAt: null, collection } as unknown as Prisma.SitePageWhereInput
      }),
      prisma.sitePage.count({
        where: { trashedAt: null, published: true, collection } as unknown as Prisma.SitePageWhereInput
      }),
      prisma.sitePage.count({
        where: { trashedAt: { not: null }, collection } as unknown as Prisma.SitePageWhereInput
      }),
      prisma.sitePage.count({
        where: { trashedAt: null, system: true, collection } as unknown as Prisma.SitePageWhereInput
      })
    ]);
    overallTotals = {
      total: activeTotal,
      published,
      draft: Math.max(activeTotal - published, 0),
      trashed,
      system
    };
  }

  return {
    pages: pages as SitePageRecord[],
    page,
    pageSize,
    totalCount,
    overallTotals
  };
}

export interface UpsertSitePageInput {
  title: string;
  description?: string | null;
  content: string;
  published?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  noIndex?: boolean;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
}

export async function createSitePage(
  payload: UpsertSitePageInput & { slug: string },
  options: SitePageQueryOptions = {}
): Promise<SitePageRecord> {
  const slug = normalizeSlug(payload.slug);
  const collection = resolveCollection(options.collection);
  if (!SITE_PAGE_SLUG_REGEX.test(slug)) {
    throw new Error('Slug must contain only lowercase letters, numbers, or hyphens and be at least 2 characters long.');
  }

  const existingCore = shouldEnsureCorePages(collection) ? CORE_PAGE_LOOKUP.get(slug) : undefined;
  if (existingCore) {
    throw new Error('Slug conflicts with a protected system page.');
  }

  const duplicate = await prisma.sitePage.findFirst({
    where: { slug, collection } as unknown as Prisma.SitePageWhereInput,
    select: { id: true }
  });
  if (duplicate) {
    throw new Error('Slug is already in use for this collection.');
  }

  const sanitizedContent = await sanitizeRichText(payload.content);
  const description = clampDescription(payload.description, sanitizedContent);
  const now = new Date();
  const published = payload.published !== undefined ? Boolean(payload.published) : true;

  const record = await prisma.sitePage.create({
    data: {
      collection,
      slug,
      title: payload.title.trim(),
      description,
      content: sanitizedContent,
      published,
      publishedAt: published ? now : null,
      system: false,
      metaTitle: payload.metaTitle ?? null,
      metaDescription: payload.metaDescription ?? null,
      canonicalUrl: payload.canonicalUrl || null,
      noIndex: payload.noIndex ?? false,
      ogTitle: payload.ogTitle ?? null,
      ogDescription: payload.ogDescription ?? null,
      ogImage: payload.ogImage || null,
    } as unknown as Prisma.SitePageCreateInput
  });
  return record as SitePageRecord;
}

export async function updateSitePage(
  id: string,
  payload: Partial<UpsertSitePageInput> & { slug?: string },
  options: SitePageQueryOptions = {}
): Promise<SitePageRecord> {
  const existing = await prisma.sitePage.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('Page not found');
  }

  const existingRecord = existing as SitePageRecord & { collection?: SitePageCollection };
  const currentCollection = resolveCollection(existingRecord.collection ?? DEFAULT_COLLECTION);
  const targetCollection = resolveCollection(options.collection ?? currentCollection);
  if (currentCollection !== targetCollection) {
    throw new Error('Page not found');
  }

  const nextSlug = payload.slug ? normalizeSlug(payload.slug) : existing.slug;
  if (nextSlug !== existing.slug) {
    if (!SITE_PAGE_SLUG_REGEX.test(nextSlug)) {
      throw new Error('Slug must contain only lowercase letters, numbers, or hyphens and be at least 2 characters long.');
    }

    if (existing.system || CORE_PAGE_LOOKUP.has(existing.slug)) {
      throw new Error('System pages cannot change their slug.');
    }

    const slugConflict = await prisma.sitePage.findFirst({
      where: { slug: nextSlug, collection: targetCollection } as unknown as Prisma.SitePageWhereInput
    });
    if (slugConflict && slugConflict.id !== existing.id) {
      throw new Error('Slug is already in use.');
    }
  }

  const sanitizedContent = payload.content ? await sanitizeRichText(payload.content) : existing.content;
  const description = clampDescription(payload.description ?? existing.description, sanitizedContent);
  const wantsPublished = payload.published === undefined ? existing.published : Boolean(payload.published);
  const publishedAt = wantsPublished && !existing.published ? new Date() : existing.publishedAt;

  const record = await prisma.sitePage.update({
    where: { id },
    data: {
      slug: nextSlug,
      title: payload.title ? payload.title.trim() : existing.title,
      description,
      content: sanitizedContent,
      published: wantsPublished,
      publishedAt: wantsPublished ? publishedAt ?? new Date() : null,
      metaTitle: payload.metaTitle !== undefined ? (payload.metaTitle || null) : existing.metaTitle,
      metaDescription: payload.metaDescription !== undefined ? (payload.metaDescription || null) : existing.metaDescription,
      canonicalUrl: payload.canonicalUrl !== undefined ? (payload.canonicalUrl || null) : existing.canonicalUrl,
      noIndex: payload.noIndex !== undefined ? payload.noIndex : existing.noIndex,
      ogTitle: payload.ogTitle !== undefined ? (payload.ogTitle || null) : existing.ogTitle,
      ogDescription: payload.ogDescription !== undefined ? (payload.ogDescription || null) : existing.ogDescription,
      ogImage: payload.ogImage !== undefined ? (payload.ogImage || null) : existing.ogImage,
    } as unknown as Prisma.SitePageUpdateInput
  });
  return record as SitePageRecord;
}

export async function deleteSitePage(id: string, options: SitePageQueryOptions = {}): Promise<void> {
  const collection = resolveCollection(options.collection);
  const existing = await prisma.sitePage.findFirst({
    where: { id, collection } as unknown as Prisma.SitePageWhereInput
  });
  if (!existing) return;
  if (existing.system || CORE_PAGE_LOOKUP.has(existing.slug)) {
    throw new Error('System pages cannot be deleted.');
  }

  await prisma.sitePage.delete({ where: { id } });
}

export function toSitePageDTO(record: SitePageRecord) {
  const trashedAtValue = (record as SitePageRecord & { trashedAt?: Date | null }).trashedAt ?? null;
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    description: record.description,
    content: record.content,
    published: record.published,
    system: record.system,
    publishedAt: record.publishedAt ? record.publishedAt.toISOString() : null,
    trashedAt: trashedAtValue ? trashedAtValue.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    metaTitle: record.metaTitle,
    metaDescription: record.metaDescription,
    canonicalUrl: record.canonicalUrl,
    noIndex: record.noIndex,
    ogTitle: record.ogTitle,
    ogDescription: record.ogDescription,
    ogImage: record.ogImage,
  };
}

export async function getPublicPagesIndex(options: SitePageQueryOptions = {}) {
  const collection = resolveCollection(options.collection);
  await ensureCorePagesIfNeeded(collection);
  const pages = await prisma.sitePage.findMany({
    where: { published: true, trashedAt: null, collection } as unknown as Prisma.SitePageWhereInput,
    orderBy: [
      { system: 'desc' },
      { title: 'asc' }
    ],
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      updatedAt: true
    }
  });

  return pages.map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    description: page.description,
    updatedAt: page.updatedAt
  }));
}

export async function refreshCorePageContent(slug: string): Promise<void> {
  const definition = CORE_PAGE_LOOKUP.get(slug);
  if (!definition) return;
  try {
    const sanitizedContent = await sanitizeRichText(definition.content);
    const description = clampDescription(definition.description, sanitizedContent);
    await prisma.sitePage.updateMany({
      where: { slug },
      data: {
        title: definition.title,
        description,
        content: sanitizedContent,
        system: true
      }
    });
  } catch (error) {
    Logger.warn('Failed to refresh core page content', {
      slug,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
