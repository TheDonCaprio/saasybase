import type { Metadata } from 'next';
import { getSiteName, SETTING_DEFAULTS, SETTING_KEYS } from './settings';

interface DashboardMetadataOptions {
  page: string;
  description: string;
  audience?: 'user' | 'admin';
}

const FALLBACK_SITE_NAME = SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME] ?? 'YourApp';

export async function buildDashboardMetadata({ page, description, audience = 'user' }: DashboardMetadataOptions): Promise<Metadata> {
  const rawSiteName = await getSiteName().catch(() => FALLBACK_SITE_NAME);
  const siteName = rawSiteName?.trim() || FALLBACK_SITE_NAME;
  const middleSegment = audience === 'admin' ? 'Admin' : 'Dashboard';
  const title = `${page} | ${middleSegment}`;
  const shareTitle = `${title} | ${siteName}`;
  const trimmedDescription = description.trim();

  return {
    title,
    description: trimmedDescription,
    openGraph: {
      title: shareTitle,
      description: trimmedDescription,
    },
    twitter: {
      title: shareTitle,
      description: trimmedDescription,
    },
  } satisfies Metadata;
}
