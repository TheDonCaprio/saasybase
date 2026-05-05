import { AuthSignIn } from '@/lib/auth-provider/client';
import { getAuthFormAppearance } from '@/lib/auth-provider/client/clerk-appearance';
import { AuthLoadingSkeleton } from '@/components/ui/AuthLoadingSkeleton';
import { AuthFormWrapper } from '@/components/ui/AuthFormWrapper';
import { authService } from '@/lib/auth-provider';
import { sanitizeReturnPath } from '@/lib/route-guards';
import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined> | undefined;

function normalizeRedirect(searchParams: SearchParams): string {
  const rawParam = searchParams?.redirect_url ?? searchParams?.returnBackUrl ?? searchParams?.redirectUrl;
  const pick = Array.isArray(rawParam) ? rawParam[0] : rawParam;

  return sanitizeReturnPath(pick, '/dashboard');
}

interface SignInPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const pageCardClass = 'w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl shadow-black/10 dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-black/40';

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const resolvedSearchParams = await searchParams;
  const redirectPath = normalizeRedirect(resolvedSearchParams);
  const { userId } = await authService.getSession();
  const isNextAuth = (process.env.AUTH_PROVIDER || 'clerk').toLowerCase() === 'nextauth';

  if (userId) {
    redirect(redirectPath);
  }

  const signUpUrl = `/sign-up?redirect_url=${encodeURIComponent(redirectPath)}`;

  return (
    <div className="flex justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full max-w-[28rem] space-y-8 mt-6">
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
            <div className={isNextAuth ? pageCardClass : 'w-full'}>
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
          </div>
        </AuthFormWrapper>
      </div>
    </div>
  );
}
