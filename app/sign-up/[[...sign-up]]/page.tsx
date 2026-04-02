import { AuthSignUp } from '@/lib/auth-provider/client';
import { getAuthFormAppearance } from '@/lib/auth-provider/client/clerk-appearance';
import { AuthLoadingSkeleton } from '@/components/ui/AuthLoadingSkeleton';
import { AuthFormWrapper } from '@/components/ui/AuthFormWrapper';
import { authService } from '@/lib/auth-provider';
import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined> | undefined;

function normalizeRedirect(searchParams: SearchParams): string {
  const rawParam = searchParams?.redirect_url ?? searchParams?.returnBackUrl ?? searchParams?.redirectUrl;
  const pick = Array.isArray(rawParam) ? rawParam[0] : rawParam;

  if (!pick || typeof pick !== 'string') {
    return '/dashboard/onboarding';
  }

  let candidate = pick.trim();
  if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
    try {
      const url = new URL(candidate);
      candidate = `${url.pathname}${url.search}` || '/dashboard/onboarding';
    } catch {
      return '/dashboard/onboarding';
    }
  }

  if (!candidate.startsWith('/')) {
    return '/dashboard/onboarding';
  }

  return candidate === '/sign-up' ? '/dashboard/onboarding' : candidate;
}

interface SignUpPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const resolvedSearchParams = await searchParams;
  const redirectPath = normalizeRedirect(resolvedSearchParams);
  const { userId } = await authService.getSession();

  if (userId) {
    redirect(redirectPath);
  }

  const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(redirectPath)}`;

  return (
    <div className="flex justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-lg w-full space-y-8 mt-6">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-white">
            Create your account
          </h2>
          <p className="mt-2 text-sm text-neutral-400">
            Start your journey with our platform
          </p>
        </div>
        <AuthFormWrapper fallback={<AuthLoadingSkeleton />}>
          <div className="flex justify-center">
            <AuthSignUp 
              routing="path"
              path="/sign-up"
              fallback={<AuthLoadingSkeleton />}
              appearance={getAuthFormAppearance('page')}
              fallbackRedirectUrl={redirectPath}
              forceRedirectUrl={redirectPath}
              signInUrl={signInUrl}
            />
          </div>
        </AuthFormWrapper>
      </div>
    </div>
  );
}
