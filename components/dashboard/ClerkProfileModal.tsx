'use client';

import { useAuthInstance } from '@/lib/auth-provider/client';

interface ClerkProfileModalProps {
  trigger: React.ReactNode;
  mode?: 'profile' | 'security' | 'account';
}

export function ClerkProfileModal({ trigger, mode = 'profile' }: ClerkProfileModalProps) {
  const { openUserProfile } = useAuthInstance();

  const handleOpenProfile = () => {
    // If document root has .light we want Clerk to render a light card background
    const isLight = typeof document !== 'undefined' && document.documentElement.classList.contains('light');

    const appearance = isLight
      ? {
          elements: {
            rootBox: 'z-50',
            card: 'bg-white border border-neutral-200 shadow-xl',
            headerTitle: 'text-neutral-900',
            headerSubtitle: 'text-neutral-600',
            socialButtonsBlockButton: 'bg-neutral-100 border border-neutral-200 text-neutral-900 hover:bg-neutral-50',
            formButtonPrimary: 'bg-blue-600 hover:bg-blue-700',
            formFieldInput: 'bg-white border border-neutral-300 text-neutral-900',
            formFieldLabel: 'text-neutral-900',
            identityPreviewText: 'text-neutral-900',
            identityPreviewEditButton: 'text-blue-600 hover:text-blue-500',
            footerActionText: 'text-neutral-600',
            footerActionLink: 'text-blue-600 hover:text-blue-500',
            dividerText: 'text-neutral-500',
            dividerLine: 'border-neutral-200',
            formResendCodeLink: 'text-blue-600 hover:text-blue-500',
            formFieldSuccessText: 'text-emerald-600',
            formFieldErrorText: 'text-red-600',
            formFieldWarningText: 'text-amber-600'
          },
          variables: {
            colorPrimary: '#3b82f6',
            colorBackground: '#ffffff',
            colorInputBackground: '#ffffff',
            colorInputText: '#111827',
            colorText: '#111827',
            colorTextSecondary: '#4b5563',
            colorTextOnPrimaryBackground: '#ffffff',
            borderRadius: '0.375rem'
          }
        }
      : {
          elements: {
            rootBox: 'z-50',
            card: 'bg-neutral-900 border border-neutral-700 shadow-xl',
            headerTitle: 'text-white',
            headerSubtitle: 'text-neutral-400',
            socialButtonsBlockButton: 'bg-neutral-800 border border-neutral-700 text-white hover:bg-neutral-700',
            formButtonPrimary: 'bg-blue-600 hover:bg-blue-700',
            formFieldInput: 'bg-neutral-800 border border-neutral-600 text-white',
            formFieldLabel: 'text-white',
            identityPreviewText: 'text-white',
            identityPreviewEditButton: 'text-blue-400 hover:text-blue-300',
            footerActionText: 'text-neutral-400',
            footerActionLink: 'text-blue-400 hover:text-blue-300',
            dividerText: 'text-neutral-400',
            dividerLine: 'border-neutral-700',
            formResendCodeLink: 'text-blue-400 hover:text-blue-300',
            formFieldSuccessText: 'text-emerald-400',
            formFieldErrorText: 'text-red-400',
            formFieldWarningText: 'text-amber-400'
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
        };

    // Forward the desired initial tab using __experimental_startPath
    // Map mode to the correct path: 
    // 'profile' → undefined/empty (default first tab)
    // 'security' → '/security'
    const startPath = mode === 'security' ? '/security' : undefined;
    
    openUserProfile({ 
      appearance,
      ...(startPath && { __experimental_startPath: startPath })
    });
  };

  return (
    <div onClick={handleOpenProfile} className="cursor-pointer">
      {trigger}
    </div>
  );
}
