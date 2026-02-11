import { SignIn } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
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
  const { userId } = await auth();

  if (userId) {
    redirect(redirectPath);
  }

  const signUpUrl = `/sign-up?redirect_url=${encodeURIComponent(redirectPath)}`;

  return (
    <div className="flex justify-center px-4 py-10 sm:px-6 lg:px-8">
  <div className="max-w-md w-full space-y-8 mt-6">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-white">
            Sign in to your account
          </h2>
          <p className="mt-2 text-sm text-neutral-400">
            Access your dashboard and manage your subscription
          </p>
        </div>
        <div className="flex justify-center">
          <SignIn 
            routing="path"
            path="/sign-in"
            appearance={{
              elements: {
                formButtonPrimary: 
                  "bg-blue-600 hover:bg-blue-700 text-sm normal-case",
                // card: light in light mode, dark in dark mode
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
                alternativeMethodsBlockButton: "bg-neutral-800 border border-neutral-700 text-white hover:bg-neutral-700",
                alternativeMethodsBlockButtonText: "text-white",
                alternativeMethodsBlockButtonArrow: "text-white",
                formResendCodeLink: "text-blue-400 hover:text-blue-300",
                formFieldSuccessText: "text-emerald-400",
                formFieldErrorText: "text-red-400",
                formFieldWarningText: "text-amber-400",
                // container: hide any overflowing/ghost elements and match the card bg
                // add horizontal padding so inputs don't touch container sides; keep overflow-hidden/isolation to hide ghosts
                // show focus border via inset shadow (keeps overflow hidden so ghosts stay clipped)
                otpCodeFieldInputs: "flex relative justify-center gap-1 overflow-hidden rounded-md bg-neutral-900 isolation-isolate px-3 py-1 focus-within:[box-shadow:inset_0_0_0_3px_rgba(59,130,246,0.15)]",
                // inputs: increase vertical space, add padding, subtle shadow and focus transform
                otpCodeFieldInput: "relative block h-14 w-12 min-w-[2.5rem] rounded-xl border border-neutral-600 bg-neutral-800 text-center text-2xl font-mono font-semibold tracking-wide leading-[2.1rem] z-[9999] text-neutral-900 dark:text-white ring-0 focus:ring-0 focus:outline-none shadow-md hover:shadow-lg transition-transform duration-150 transform-gpu appearance-none caret-transparent",
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
            signUpUrl={signUpUrl}
          />
        </div>
      </div>
    </div>
  );
}
