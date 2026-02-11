'use client';

import { UserProfile } from '@clerk/nextjs';

interface ClerkProfileInlineProps {
  mode?: 'profile' | 'security' | 'account';
}

export function ClerkProfileInline({ mode = 'profile' }: ClerkProfileInlineProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void mode; // Reserved for future multi-tab support
  
  // Check if document root has .light class for theme detection
  const isLight = typeof document !== 'undefined' && document.documentElement.classList.contains('light');

  const appearance = isLight
    ? {
        elements: {
          card: 'bg-white border border-slate-200 shadow-sm rounded-2xl',
          navbar: 'bg-white border-b border-slate-200',
          navbarButton: 'text-slate-700 hover:text-slate-900 hover:bg-slate-50',
          navbarButtonActive: 'text-blue-600 bg-blue-50 border-blue-200',
          headerTitle: 'text-slate-900',
          headerSubtitle: 'text-slate-600',
          socialButtonsBlockButton: 'bg-slate-50 border border-slate-200 text-slate-900 hover:bg-slate-100',
          formButtonPrimary: 'bg-blue-600 hover:bg-blue-700 text-white',
          formFieldInput: 'bg-white border border-slate-300 text-slate-900',
          formFieldLabel: 'text-slate-900',
          identityPreviewText: 'text-slate-900',
          identityPreviewEditButton: 'text-blue-600 hover:text-blue-500',
          footerActionText: 'text-slate-600',
          footerActionLink: 'text-blue-600 hover:text-blue-500',
          dividerText: 'text-slate-500',
          dividerLine: 'border-slate-200',
          formResendCodeLink: 'text-blue-600 hover:text-blue-500',
          formFieldSuccessText: 'text-emerald-600',
          formFieldErrorText: 'text-red-600',
          formFieldWarningText: 'text-amber-600',
          pageScrollBox: 'bg-white',
          page: 'bg-white'
        },
        variables: {
          colorPrimary: '#3b82f6',
          colorBackground: '#ffffff',
          colorInputBackground: '#ffffff',
          colorInputText: '#111827',
          colorText: '#111827',
          colorTextSecondary: '#4b5563',
          colorTextOnPrimaryBackground: '#ffffff',
          borderRadius: '0.75rem'
        }
      }
    : {
        elements: {
          card: 'bg-neutral-900 border border-neutral-700 shadow-sm rounded-2xl',
          navbar: 'bg-neutral-900 border-b border-neutral-700',
          navbarButton: 'text-neutral-300 hover:text-white hover:bg-neutral-800',
          navbarButtonActive: 'text-blue-400 bg-neutral-800 border-neutral-600',
          headerTitle: 'text-white',
          headerSubtitle: 'text-neutral-400',
          socialButtonsBlockButton: 'bg-neutral-800 border border-neutral-700 text-white hover:bg-neutral-700',
          formButtonPrimary: 'bg-blue-600 hover:bg-blue-700 text-white',
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
          formFieldWarningText: 'text-amber-400',
          pageScrollBox: 'bg-neutral-900',
          page: 'bg-neutral-900'
        },
        variables: {
          colorPrimary: '#3b82f6',
          colorBackground: '#171717',
          colorInputBackground: '#262626',
          colorInputText: '#ffffff',
          colorText: '#ffffff',
          colorTextSecondary: '#a3a3a3',
          colorTextOnPrimaryBackground: '#ffffff',
          borderRadius: '0.75rem'
        }
      };

  return (
    <div className="w-full">
      <UserProfile
        appearance={appearance}
        routing="virtual"
      />
    </div>
  );
}
