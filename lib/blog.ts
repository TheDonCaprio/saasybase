import { BlogCategory, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  buildSitePageMetadata,
  createSitePage,
  deleteSitePage,
  getPageById,
  getPublishedPageBySlug,
  listSitePagesPaginated,
  normalizeSlug,
  permanentlyDeleteSitePages,
  restoreSitePages,
  SitePageCollection,
  SitePageQueryOptions,
  SitePageRecord,
  toSitePageDTO,
  trashSitePages,
  updateSitePage,
  type ListSitePagesPaginatedOptions,
  type ListSitePagesPaginatedResult,
  type UpsertSitePageInput
} from './sitePages';

export const BLOG_COLLECTION: SitePageCollection = 'blog';

const BLOG_COLLECTION_OPTIONS: SitePageQueryOptions = { collection: BLOG_COLLECTION };

type SitePageDTO = ReturnType<typeof toSitePageDTO>;

type HydratedBlogPost = SitePageRecord & { categories: BlogCategory[] };

export interface BlogCategoryDTO {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  postCount: number;
}

export interface BlogPostDTO extends SitePageDTO {
  categories: BlogCategoryDTO[];
}

export interface CreateBlogPostInput extends UpsertSitePageInput {
  slug: string;
  categoryIds?: string[];
}

export interface UpdateBlogPostInput extends Partial<UpsertSitePageInput> {
  slug?: string;
  categoryIds?: string[];
}

export interface ListBlogPostsPaginatedOptions
  extends Omit<ListSitePagesPaginatedOptions, 'collection'> {
  includeCategories?: boolean;
}

export interface ListBlogPostsPaginatedResult
  extends Omit<ListSitePagesPaginatedResult, 'pages'> {
  posts: HydratedBlogPost[];
}

export interface PublicBlogListOptions {
  page?: number;
  limit?: number;
  categorySlug?: string;
}

export interface PublicBlogListResult {
  posts: HydratedBlogPost[];
  page: number;
  pageSize: number;
  totalCount: number;
}

function withBlogCollection<T extends object>(
  options?: T
): T & { collection: SitePageCollection } {
  const base = (options ?? {}) as T;
  return { ...base, collection: BLOG_COLLECTION };
}

function toBlogCategoryDTO(record: BlogCategory, postCount = 0): BlogCategoryDTO {
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    description: record.description,
    postCount
  };
}

export function toBlogPostDTO(record: HydratedBlogPost): BlogPostDTO {
  const base = toSitePageDTO(record);
  return {
    ...base,
    categories: record.categories.map((category) => toBlogCategoryDTO(category))
  };
}

async function hydrateBlogPosts(pages: SitePageRecord[]): Promise<HydratedBlogPost[]> {
  if (!pages.length) return [];
  const postIds = pages.map((page) => page.id);
  const rows = await prisma.blogPostCategory.findMany({
    where: { postId: { in: postIds } },
    include: { category: true },
    orderBy: { category: { title: 'asc' } }
  });

  const categoriesByPost = new Map<string, BlogCategory[]>();
  for (const row of rows) {
    const current = categoriesByPost.get(row.postId) ?? [];
    current.push(row.category);
    categoriesByPost.set(row.postId, current);
  }

  return pages.map((page) => ({
    ...page,
    categories: categoriesByPost.get(page.id) ?? []
  }));
}

async function syncPostCategories(postId: string, categoryIds: string[] = []): Promise<void> {
  const uniqueIds = Array.from(new Set(categoryIds.filter(Boolean)));
  if (!uniqueIds.length) {
    await prisma.blogPostCategory.deleteMany({ where: { postId } });
    return;
  }

  const categories = await prisma.blogCategory.findMany({
    where: {
      OR: [
        { id: { in: uniqueIds } },
        { slug: { in: uniqueIds } }
      ]
    },
    select: { id: true, slug: true }
  });

  const resolutionMap = new Map<string, string>();
  for (const category of categories) {
    resolutionMap.set(category.id, category.id);
    if (category.slug) {
      resolutionMap.set(category.slug, category.id);
    }
  }

  const resolvedIds = uniqueIds
    .map((value) => resolutionMap.get(value))
    .filter((value): value is string => Boolean(value));

  if (resolvedIds.length !== uniqueIds.length) {
    throw new Error('One or more categories do not exist.');
  }

  const normalizedCategoryIds = Array.from(new Set(resolvedIds));

  const existing = await prisma.blogPostCategory.findMany({
    where: { postId },
    select: { id: true, categoryId: true }
  });

  // Ensure the target post actually exists before attempting to assign categories.
  const postExists = await prisma.sitePage.findUnique({ where: { id: postId } });
  if (!postExists) {
    throw new Error('Post not found; cannot assign categories.');
  }
  const existingIds = new Set(existing.map((row) => row.categoryId));
  const toRemove = existing
    .filter((row) => !normalizedCategoryIds.includes(row.categoryId))
    .map((row) => row.id);
  const toAdd = normalizedCategoryIds.filter((id) => !existingIds.has(id));

  const tx: Prisma.PrismaPromise<unknown>[] = [];
  if (toRemove.length) {
    tx.push(prisma.blogPostCategory.deleteMany({ where: { id: { in: toRemove } } }));
  }
  for (const categoryId of toAdd) {
    tx.push(
      prisma.blogPostCategory.create({
        data: {
          postId,
          categoryId
        }
      })
    );
  }

  if (tx.length) {
    await prisma.$transaction(tx);
  }
}

export async function createBlogPost(input: CreateBlogPostInput): Promise<HydratedBlogPost> {
  const { categoryIds = [], ...pageInput } = input;
  const post = await createSitePage(pageInput, BLOG_COLLECTION_OPTIONS);
  await syncPostCategories(post.id, categoryIds);
  const [hydrated] = await hydrateBlogPosts([post]);
  if (!hydrated) {
    throw new Error('Failed to load created blog post');
  }
  return hydrated;
}

export async function updateBlogPost(
  id: string,
  input: UpdateBlogPostInput
): Promise<HydratedBlogPost> {
  const { categoryIds, ...pageInput } = input;
  const post = await updateSitePage(id, pageInput, BLOG_COLLECTION_OPTIONS);
  if (categoryIds !== undefined) {
    await syncPostCategories(id, categoryIds);
  }
  const [hydrated] = await hydrateBlogPosts([post]);
  if (!hydrated) {
    throw new Error('Failed to load updated blog post');
  }
  return hydrated;
}

export async function getBlogPostById(id: string): Promise<HydratedBlogPost | null> {
  const record = await getPageById(id, BLOG_COLLECTION_OPTIONS);
  if (!record) return null;
  const [hydrated] = await hydrateBlogPosts([record]);
  return hydrated ?? null;
}

export async function listBlogPostsPaginated(
  options: ListBlogPostsPaginatedOptions = {}
): Promise<ListBlogPostsPaginatedResult> {
  const includeCategories = options.includeCategories !== false;
  const baseResult = await listSitePagesPaginated(withBlogCollection(options));
  const posts = includeCategories
    ? await hydrateBlogPosts(baseResult.pages)
    : baseResult.pages.map((page) => ({ ...page, categories: [] }));

  const { pages: _pages, ...rest } = baseResult;
  void _pages;
  return {
    ...rest,
    posts
  };
}

export async function trashBlogPosts(ids: string[]): Promise<number> {
  return trashSitePages(ids, BLOG_COLLECTION_OPTIONS);
}

export async function restoreBlogPosts(ids: string[]): Promise<number> {
  return restoreSitePages(ids, BLOG_COLLECTION_OPTIONS);
}

export async function permanentlyDeleteBlogPosts(ids: string[]): Promise<number> {
  return permanentlyDeleteSitePages(ids, BLOG_COLLECTION_OPTIONS);
}

export async function deleteBlogPost(id: string): Promise<void> {
  await deleteSitePage(id, BLOG_COLLECTION_OPTIONS);
}

export async function getPublishedBlogBySlug(slug: string): Promise<HydratedBlogPost | null> {
  const record = await getPublishedPageBySlug(slug, BLOG_COLLECTION_OPTIONS);
  if (!record) return null;
  const [hydrated] = await hydrateBlogPosts([record]);
  return hydrated ?? null;
}

export function buildBlogMetadata(slug: string) {
  return buildSitePageMetadata(slug, BLOG_COLLECTION_OPTIONS);
}

export async function listBlogCategories(): Promise<BlogCategoryDTO[]> {
  const [categories, assignments]: [BlogCategory[], { categoryId: string }[]] = await Promise.all([
    prisma.blogCategory.findMany({ orderBy: { title: 'asc' } }),
    prisma.blogPostCategory.findMany({
      where: {
        post: {
          collection: BLOG_COLLECTION,
          trashedAt: null
        }
      },
      select: { categoryId: true }
    })
  ]);

  const countMap = new Map<string, number>();
  for (const row of assignments) {
    countMap.set(row.categoryId, (countMap.get(row.categoryId) ?? 0) + 1);
  }

  return categories.map((category) => toBlogCategoryDTO(category, countMap.get(category.id) ?? 0));
}

export async function createBlogCategory(input: {
  title: string;
  slug?: string;
  description?: string | null;
}): Promise<BlogCategoryDTO> {
  const title = input.title.trim();
  if (!title) {
    throw new Error('Title is required');
  }
  const slugSource = input.slug?.trim().length ? input.slug : title;
  const slug = normalizeSlug(slugSource);
  if (!slug) {
    throw new Error('Slug is required');
  }

  const category = await prisma.blogCategory.create({
    data: {
      title,
      slug,
      description: input.description ?? null
    }
  });
  return toBlogCategoryDTO(category, 0);
}

export async function updateBlogCategory(
  id: string,
  input: {
    title?: string;
    slug?: string;
    description?: string | null;
  }
): Promise<BlogCategoryDTO> {
  const data: Prisma.BlogCategoryUpdateInput = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) {
      throw new Error('Title cannot be empty');
    }
    data.title = title;
  }
  if (input.slug !== undefined) {
    const slug = normalizeSlug(input.slug);
    if (!slug) {
      throw new Error('Slug cannot be empty');
    }
    data.slug = slug;
  }
  if (input.description !== undefined) {
    data.description = input.description ?? null;
  }

  const category = await prisma.blogCategory.update({ where: { id }, data });
  const postCount = await prisma.blogPostCategory.count({
    where: {
      categoryId: id,
      post: {
        collection: BLOG_COLLECTION,
        trashedAt: null
      }
    }
  });
  return toBlogCategoryDTO(category, postCount);
}

export async function deleteBlogCategory(id: string): Promise<void> {
  await prisma.blogCategory.delete({ where: { id } });
}

export async function getBlogCategoryBySlug(slug: string): Promise<BlogCategoryDTO | null> {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  const category = await prisma.blogCategory.findUnique({ where: { slug: normalized } });
  if (!category) return null;
  const postCount = await prisma.blogPostCategory.count({
    where: {
      categoryId: category.id,
      post: {
        collection: BLOG_COLLECTION,
        published: true,
        trashedAt: null
      }
    }
  });
  return toBlogCategoryDTO(category, postCount);
}

export async function listPublishedBlogPosts(
  options: PublicBlogListOptions = {}
): Promise<PublicBlogListResult> {
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(options.limit) || 10)));
  const skip = (page - 1) * pageSize;

  const where = {
    collection: BLOG_COLLECTION,
    published: true,
    trashedAt: null
  } as unknown as Prisma.SitePageWhereInput;

  if (options.categorySlug) {
    const normalized = normalizeSlug(options.categorySlug);
    if (normalized) {
      (where as Record<string, unknown>).categories = {
        some: {
          category: {
            slug: normalized
          }
        }
      };
    }
  }

  const [posts, totalCount] = await Promise.all([
    prisma.sitePage.findMany({
      where,
      orderBy: [
        { publishedAt: 'desc' },
        { updatedAt: 'desc' }
      ],
      skip,
      take: pageSize
    }),
    prisma.sitePage.count({ where })
  ]);

  const hydrated = await hydrateBlogPosts(posts);
  return {
    posts: hydrated,
    page,
    pageSize,
    totalCount
  };
}
