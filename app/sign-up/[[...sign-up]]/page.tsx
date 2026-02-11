import { SignUp } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
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
  const { userId } = await auth();

  if (userId) {
    redirect(redirectPath);
  }

  const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(redirectPath)}`;

  return (
    <div className="flex justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 mt-6">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-white">
            Create your account
          </h2>
          <p className="mt-2 text-sm text-neutral-400">
            Start your journey with our platform
          </p>
        </div>
        <div className="flex justify-center">
          <SignUp 
            routing="path"
            path="/sign-up"
            appearance={{
              elements: {
                formButtonPrimary: "bg-blue-600 hover:bg-blue-700 text-sm normal-case",
                cardBox: "bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-xl",
                card: "bg-white dark:bg-neutral-900 border-0",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                formFieldInput: "bg-neutral-800 border border-neutral-600 text-white",
                formFieldLabel: "text-white",
                identityPreviewText: "text-white",
                identityPreviewEditButton: "text-blue-400 hover:text-blue-300",
                footer: "bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700",
                footerItem: "text-neutral-600 dark:text-neutral-400",
                footerActionText: "text-neutral-600 dark:text-neutral-400",
                footerActionLink: "text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300",
                dividerText: "text-neutral-400",
                dividerLine: "border-neutral-700",
                socialButtonsBlockButton: "bg-neutral-800 border border-neutral-700 text-white hover:bg-neutral-700",
                socialButtonsBlockButtonText: "text-white",
                formResendCodeLink: "text-blue-400 hover:text-blue-300",
                formFieldSuccessText: "text-emerald-400",
                formFieldErrorText: "text-red-400",
                formFieldWarningText: "text-amber-400",
                alternativeMethodsBlockButton: "bg-neutral-800 border border-neutral-700 text-white hover:bg-neutral-700",
                alternativeMethodsBlockButtonText: "text-white",
                alternativeMethodsBlockButtonArrow: "text-white",
              },
              variables: {
                colorPrimary: '#3b82f6',
                colorBackground: '#171717',
                colorInputBackground: '#262626',
                colorInputText: '#ffffff',
                colorText: '#ffffff',
                colorTextSecondary: '#a3a3a3',
                colorTextOnPrimaryBackground: '#ffffff',
                borderRadius: '0.375rem'
              }
            }}
            fallbackRedirectUrl={redirectPath}
            forceRedirectUrl={redirectPath}
            signInUrl={signInUrl}
          />
        </div>
      </div>
    </div>
  );
}
