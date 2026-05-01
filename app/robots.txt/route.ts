import { getSeoSettings } from '../../lib/seo';
import { buildRobotsTxtContent } from '../../lib/seo-shared';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const seoSettings = await getSeoSettings();
  const content = buildRobotsTxtContent({
    siteUrl: seoSettings.siteUrl,
    sitemapUrl: seoSettings.sitemapUrl,
    noIndexSite: seoSettings.noIndexSite,
    customContent: seoSettings.robotsTxtCustom,
  });

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}