import React from 'react';
export const dynamic = 'force-dynamic';
import { requireAdminAuth } from '../../../lib/route-guards';
import { toError } from '../../../lib/runtime-guards';
import {
  getThemeHeaderLinks,
  getThemeFooterLinks,
  getThemeFooterTextRaw,
  getThemeCustomCss,
  getThemeCustomHeadSnippet,
  getThemeCustomBodySnippet,
  getThemeCustomSnippet,
  getThemeColorPalette,
  getThemeColorPresets,
  getSiteName,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  getPricingSettings,
  getBlogListingStyle,
  getBlogListingPageSize,
  getBlogSidebarSettings,
  getRelatedPostsEnabled
  ,getBlogHtmlSnippets
} from '../../../lib/settings';
import { ThemeSettingsTabs } from '../../../components/admin/theme/ThemeSettingsTabs';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Theme',
    description: 'Curate how visitors experience your brand across navigation, footers, and custom snippets without leaving the admin console.',
    audience: 'admin',
  });
}

export default async function AdminThemePage() {
  await requireAdminAuth('/admin/theme');

  try {
    await requireAdminAuth('/admin/theme');
  } catch (err: unknown) {
    const e = toError(err);
    console.warn('Admin theme: requireAdmin check failed or redirected', e?.message);
  }

  const [siteName, headerLinks, footerLinks, footerText, customCss, customHead, customBody, legacyBody, pricingSettings, blogListingStyle, blogListingPageSize, blogSidebarSettings, relatedPostsEnabled, blogHtmlSnippets, colorPalette] = await Promise.all([
    getSiteName().catch(() => process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME]),
    getThemeHeaderLinks(),
    getThemeFooterLinks(),
    getThemeFooterTextRaw(),
    getThemeCustomCss(),
    getThemeCustomHeadSnippet(),
    getThemeCustomBodySnippet(),
    getThemeCustomSnippet(),
    getPricingSettings(),
    getBlogListingStyle(),
    getBlogListingPageSize(),
    getBlogSidebarSettings(),
    getRelatedPostsEnabled()
    ,getBlogHtmlSnippets(),
    getThemeColorPalette()
  ]);

  const colorPresets = await getThemeColorPresets();

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        eyebrow="Theme designer"
        title="Theme & Navigation"
      />

      <ThemeSettingsTabs
        initialHeaderLinks={headerLinks}
        initialFooterLinks={footerLinks}
        initialFooterText={footerText}
        initialCustomCss={customCss}
        initialCustomHead={customHead}
        initialCustomBody={customBody || legacyBody}
        initialColorPalette={colorPalette}
        initialColorPresets={colorPresets}
        initialPricingSettings={pricingSettings}
        initialBlogListingStyle={blogListingStyle}
        initialBlogListingPageSize={blogListingPageSize}
        initialBlogSidebarSettings={blogSidebarSettings}
        initialRelatedPostsEnabled={relatedPostsEnabled}
        initialBlogHtmlBeforeFirst={blogHtmlSnippets.beforeFirst}
        initialBlogHtmlMiddle={blogHtmlSnippets.middle}
        initialBlogHtmlAfterLast={blogHtmlSnippets.afterLast}
      />
    </div>
  );
}
