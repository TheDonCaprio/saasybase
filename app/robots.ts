import type { MetadataRoute } from 'next';
import { getSeoSettings } from '../lib/seo';

export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const seoSettings = await getSeoSettings();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: seoSettings.sitemapUrl,
    host: seoSettings.siteUrl,
  };
}