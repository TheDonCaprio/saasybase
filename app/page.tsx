import type { Metadata } from 'next';
import { getAuthSafe } from '../lib/auth';
import LandingClientAlt from '../components/LandingClientAlt';
export const dynamic = 'force-dynamic';
import JsonLd from '@/components/seo/JsonLd';
import { buildOrganizationSchema, buildSoftwareApplicationSchema } from '@/lib/schema';
import { getSiteLogo, getSiteName, SETTING_DEFAULTS, SETTING_KEYS } from '../lib/settings';
import { getSeoSettings } from '../lib/seo';

const FALLBACK_SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME];

export async function generateMetadata(): Promise<Metadata> {
  const [siteName, seoSettings] = await Promise.all([
    getSiteName().catch(() => FALLBACK_SITE_NAME),
    getSeoSettings().catch(() => null),
  ]);

  const trimmedSiteName = siteName.trim() || FALLBACK_SITE_NAME;
  const title = seoSettings?.homeMetaTitle.trim() || `${trimmedSiteName} — The complete Next.js SaaS boilerplate`;
  const description = seoSettings?.homeMetaDescription.trim() || 'Three auth providers, four payment processors, subscriptions, teams, admin dashboard, optional Infisical or Doppler bootstrap, and 500+ automated tests across 140+ files plus manual regression coverage - all wired up.';
  const ogTitle = seoSettings?.homeOgTitle?.trim() || seoSettings?.defaultOgTitle?.trim() || title;
  const ogDescription = seoSettings?.homeOgDescription?.trim() || seoSettings?.defaultOgDescription?.trim() || description;
  const ogImage = seoSettings?.resolvedHomeOgImageUrl || seoSettings?.resolvedDefaultOgImageUrl;
  const canonical = seoSettings?.resolvedHomeCanonicalUrl;

  return {
    title: { absolute: title },
    description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      images: ogImage ? [{ url: ogImage }] : undefined,
      type: 'website',
    },
    twitter: {
      title: ogTitle,
      description: ogDescription,
      images: ogImage ? [ogImage] : undefined,
      card: ogImage ? 'summary_large_image' : 'summary',
    },
  } satisfies Metadata;
}

export default async function HomePage() {
  const [auth, siteName, seoSettings, siteLogo] = await Promise.all([
    getAuthSafe(),
    getSiteName().catch(() => FALLBACK_SITE_NAME),
    getSeoSettings().catch(() => null),
    getSiteLogo().catch(() => ''),
  ]);

  const trimmedSiteName = siteName.trim() || FALLBACK_SITE_NAME;
  const description = seoSettings?.homeMetaDescription.trim() || 'Three auth providers, four payment processors, subscriptions, teams, admin dashboard, optional Infisical or Doppler bootstrap, and 500+ automated tests across 140+ files plus manual regression coverage - all wired up.';

  return (
    <>
      <JsonLd
        data={[
          buildOrganizationSchema({
            siteName: trimmedSiteName,
            siteUrl: seoSettings?.siteUrl,
            logoUrl: siteLogo,
          }),
          buildSoftwareApplicationSchema({
            siteName: trimmedSiteName,
            siteUrl: seoSettings?.siteUrl,
            description,
          }),
        ]}
      />
      <LandingClientAlt isSignedIn={Boolean(auth?.userId)} />
    </>
  );
}
