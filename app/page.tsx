import Link from 'next/link';
import type { Metadata } from 'next';
import { getAuthSafe } from '../lib/auth';
export const dynamic = 'force-dynamic';
import { getSiteName, SETTING_DEFAULTS, SETTING_KEYS } from '../lib/settings';

const FALLBACK_SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME];

export async function generateMetadata(): Promise<Metadata> {
  const siteName = (await getSiteName().catch(() => FALLBACK_SITE_NAME)).trim() || FALLBACK_SITE_NAME;
  const title = `Craft cinematic 3D screenshots | ${siteName}`;
  const description = 'Design, customize, and export depth-rich screenshots with pro-grade controls for teams that care about presentation.';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
    twitter: {
      title,
      description,
    },
  } satisfies Metadata;
}

export default async function HomePage() {
  const auth = await getAuthSafe();
  
  return (
    <div className="space-y-10">
      <section className="text-center space-y-4">
        <h1 className="text-4xl md:text-6xl font-bold leading-tight">Elevate Your <span className="gradient-text">3D Screenshots</span></h1>
        <p className="text-neutral-400 max-w-2xl mx-auto">Manipulate, customize & export gorgeous layered 3D screenshots. Upgrade for advanced depth, precision controls, HQ edges and high-scale exports.</p>
        <div className="flex gap-4 justify-center">
          {auth?.userId ? (
            <>
              <Link href="/dashboard" className="px-5 py-3 bg-brand text-white rounded-md font-medium">Go to Dashboard</Link>
              {/* Add admin link if user is admin */}
              <Link href="/dashboard/profile" className="px-5 py-3 border border-neutral-700 rounded-md font-medium">My Profile</Link>
            </>
          ) : (
            <>
              <Link href="/sign-up" className="px-5 py-3 bg-brand text-white rounded-md font-medium">Get Started</Link>
              <Link href="/sign-in" className="px-5 py-3 border border-neutral-700 rounded-md font-medium">Sign In</Link>
            </>
          )}
          <Link href="/pricing" className="px-5 py-3 border border-neutral-700 rounded-md font-medium">View Pricing</Link>
        </div>
      </section>
      <section className="grid md:grid-cols-3 gap-6">
        {['Depth Controls','Premium Exports','Customization'].map(f => (
          <div key={f} className="rounded-lg border border-neutral-800 p-5 bg-neutral-900/40">
            <h3 className="font-semibold mb-2">{f}</h3>
            <p className="text-xs text-neutral-400">Lorem ipsum dolor sit amet consectetur adipisicing elit.</p>
          </div>
        ))}
      </section>
    </div>
  );
}
