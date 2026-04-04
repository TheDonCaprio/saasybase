import React from 'react';
export const dynamic = 'force-dynamic';
import { requireAdminAuth } from '../../../../lib/route-guards';
import { toError } from '../../../../lib/runtime-guards';
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
  getPricingSettings,
  getHeaderLayoutSettings,
  getBlogListingStyle,
  getBlogListingPageSize,
  getBlogSidebarSettings,
  getRelatedPostsEnabled
  ,getBlogHtmlSnippets
} from '../../../../lib/settings';
import { ThemeSettingsTabs } from '../../../../components/admin/theme/ThemeSettingsTabs';
import { buildDashboardMetadata } from '../../../../lib/dashboardMetadata';
import { DashboardPageHeader } from '../../../../components/dashboard/DashboardPageHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPalette } from '@fortawesome/free-solid-svg-icons';

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

  const [headerLinks, footerLinks, footerText, customCss, customHead, customBody, legacyBody, pricingSettings, headerLayoutSettings, blogListingStyle, blogListingPageSize, blogSidebarSettings, relatedPostsEnabled, blogHtmlSnippets, colorPalette] = await Promise.all([
    getThemeHeaderLinks(),
    getThemeFooterLinks(),
    getThemeFooterTextRaw(),
    getThemeCustomCss(),
    getThemeCustomHeadSnippet(),
    getThemeCustomBodySnippet(),
    getThemeCustomSnippet(),
    getPricingSettings(),
    getHeaderLayoutSettings(),
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
        eyebrowIcon={<FontAwesomeIcon icon={faPalette} />}
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
        initialHeaderLayoutSettings={headerLayoutSettings}
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
