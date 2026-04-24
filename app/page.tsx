import type { Metadata } from 'next';
import { getAuthSafe } from '../lib/auth';
import LandingClientAlt from '../components/LandingClientAlt';
export const dynamic = 'force-dynamic';
import { getSiteName, SETTING_DEFAULTS, SETTING_KEYS } from '../lib/settings';

const FALLBACK_SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME];

export async function generateMetadata(): Promise<Metadata> {
  const siteName = (await getSiteName().catch(() => FALLBACK_SITE_NAME)).trim() || FALLBACK_SITE_NAME;
  const title = `${siteName} — The complete Next.js SaaS boilerplate`;
  const description = 'Three auth providers, four payment processors, subscriptions, teams, admin dashboard, optional Infisical or Doppler bootstrap, and 90+ automated tests plus manual regression coverage - all wired up.';

  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description },
  } satisfies Metadata;
}

export default async function HomePage() {
  const auth = await getAuthSafe();
  return <LandingClientAlt isSignedIn={Boolean(auth?.userId)} />;
}
