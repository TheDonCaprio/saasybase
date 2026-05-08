import { NextResponse } from 'next/server';

function isConfigured(value: string | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}

export async function GET() {
  const authProvider = process.env.AUTH_PROVIDER || process.env.NEXT_PUBLIC_AUTH_PROVIDER || 'betterauth';

  if (authProvider !== 'betterauth') {
    return NextResponse.json({
      authProvider,
      github: false,
      google: false,
    });
  }

  return NextResponse.json({
    authProvider,
    github: isConfigured(process.env.GITHUB_CLIENT_ID) && isConfigured(process.env.GITHUB_CLIENT_SECRET),
    google: isConfigured(process.env.GOOGLE_CLIENT_ID) && isConfigured(process.env.GOOGLE_CLIENT_SECRET),
  });
}