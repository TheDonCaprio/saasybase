import { NextResponse } from 'next/server';
import { getSiteName, getDefaultTokenLabel } from '@/lib/settings';

export async function GET() {
  try {
    const [siteName, defaultTokenLabel] = await Promise.all([
      getSiteName(),
      getDefaultTokenLabel()
    ]);

    return NextResponse.json({
      siteName: siteName || process.env.NEXT_PUBLIC_SITE_NAME || 'SaaSyBase',
      tokenLabel: defaultTokenLabel
    });
  } catch (error) {
    console.error('Failed to fetch site info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch site info' },
      { status: 500 }
    );
  }
}