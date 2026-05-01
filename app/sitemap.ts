import type { MetadataRoute } from 'next';
import { prisma } from '../lib/prisma';
import { getSeoSettings } from '../lib/seo';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seoSettings = await getSeoSettings();
  const excludedUrls = new Set(seoSettings.excludedSitemapUrls);
  const [sitePages, blogPosts] = await Promise.all([
    prisma.sitePage.findMany({
      where: {
        collection: 'page',
        published: true,
        trashedAt: null,
      },
      select: {
        slug: true,
        updatedAt: true,
        publishedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
    }),
    prisma.sitePage.findMany({
      where: {
        collection: 'blog',
        published: true,
        trashedAt: null,
      },
      select: {
        slug: true,
        updatedAt: true,
        publishedAt: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
    }),
  ]);

  const entries = new Map<string, MetadataRoute.Sitemap[number]>();
  const addEntry = (url: string, lastModified?: Date | null) => {
    if (excludedUrls.has(url)) return;
    entries.set(url, {
      url,
      lastModified: lastModified ?? new Date(),
    });
  };

  addEntry(seoSettings.siteUrl);
  addEntry(new URL('/blog', `${seoSettings.siteUrl}/`).toString());

  for (const page of sitePages) {
    addEntry(new URL(`/${page.slug}`, `${seoSettings.siteUrl}/`).toString(), page.updatedAt ?? page.publishedAt ?? undefined);
  }

  for (const post of blogPosts) {
    addEntry(new URL(`/blog/${post.slug}`, `${seoSettings.siteUrl}/`).toString(), post.updatedAt ?? post.publishedAt ?? undefined);
  }

  for (const customUrl of seoSettings.customSitemapUrls) {
    addEntry(customUrl);
  }

  return Array.from(entries.values());
}