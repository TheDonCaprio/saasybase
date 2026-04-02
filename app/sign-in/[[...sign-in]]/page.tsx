import { AuthSignIn } from '@/lib/auth-provider/client';
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
    return '/dashboard';
  }

  let candidate = pick.trim();
  if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
    try {
      const url = new URL(candidate);
      candidate = `${url.pathname}${url.search}` || '/dashboard';
    } catch {
      return '/dashboard';
    }
  }

  if (!candidate.startsWith('/')) {
    return '/dashboard';
  }

  return candidate === '/sign-in' ? '/dashboard' : candidate;
}

interface SignInPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const resolvedSearchParams = await searchParams;
  const redirectPath = normalizeRedirect(resolvedSearchParams);
  const { userId } = await authService.getSession();

  if (userId) {
    redirect(redirectPath);
  }

  const signUpUrl = `/sign-up?redirect_url=${encodeURIComponent(redirectPath)}`;

  return (
    <div className="flex justify-center px-4 py-10 sm:px-6 lg:px-8">
  <div className="max-w-lg w-full space-y-8 mt-6">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-white">
            Sign in to your account
          </h2>
          <p className="mt-2 text-sm text-neutral-400">
            Access your dashboard and manage your subscription
          </p>
        </div>
        <AuthFormWrapper fallback={<AuthLoadingSkeleton />}>
          <div className="flex justify-center">
          <AuthSignIn 
            routing="path"
            path="/sign-in"
            fallback={<AuthLoadingSkeleton />}
            appearance={getAuthFormAppearance('page')}
            fallbackRedirectUrl={redirectPath}
            forceRedirectUrl={redirectPath}
            signUpUrl={signUpUrl}
          />
          </div>
        </AuthFormWrapper>
      </div>
    </div>
  );
}
