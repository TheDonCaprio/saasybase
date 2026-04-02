import { dark as authDarkTheme } from '@clerk/themes';

type ClerkAppearance = Record<string, unknown>;

type OrganizationSwitcherVariant = 'account-menu' | 'sidebar' | 'drawer';
type AuthFormVariant = 'page' | 'modal';
type ProfileVariant = 'inline' | 'modal';

type OrganizationSwitcherAppearanceOptions = {
  variant: OrganizationSwitcherVariant;
  canCreateOrganization?: boolean;
};

export function getAuthProviderAppearance(isDark: boolean): ClerkAppearance {
  return {
    baseTheme: isDark ? authDarkTheme : undefined,
    variables: {
      colorPrimary: '#7c3aed',
      colorBackground: isDark ? '#0a0a0a' : '#ffffff',
      colorText: isDark ? '#fafafa' : '#0a0a0a',
      colorInputBackground: isDark ? '#171717' : '#ffffff',
      colorInputText: isDark ? '#fafafa' : '#0a0a0a',
    },
    elements: {
      modalBackdrop: 'bg-black/60 backdrop-blur-sm',
      formButtonPrimary: 'bg-violet-600 hover:bg-violet-700 text-white',
      card: isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200',
      headerTitle: isDark ? 'text-neutral-100' : 'text-neutral-900',
      headerSubtitle: isDark ? 'text-neutral-400' : 'text-neutral-600',
      socialButtonsBlockButton: isDark
        ? 'border-neutral-700 hover:bg-neutral-800 text-neutral-200'
        : 'border-neutral-200 hover:bg-neutral-50 text-neutral-900',
      formFieldLabel: isDark ? 'text-neutral-300' : 'text-neutral-700',
      formFieldInput: isDark
        ? 'bg-neutral-800 border-neutral-700 text-neutral-100'
        : 'bg-white border-neutral-300 text-neutral-900',
      footerActionLink: 'text-violet-600 hover:text-violet-700',
    },
  };
}

export function getOrganizationSwitcherAppearance(options: OrganizationSwitcherAppearanceOptions): ClerkAppearance {
  const hideCreateOrganization = options.canCreateOrganization === false ? 'hidden' : '';
  const sharedElements: Record<string, string> = {
    organizationSwitcherTriggerIcon: 'text-neutral-400 transition-transform group-data-[open=true]:rotate-180 dark:text-neutral-500',
    organizationSwitcherPopoverMain: 'overflow-hidden bg-transparent',
    organizationSwitcherPopoverActions: 'border-t border-neutral-200 bg-neutral-50/80 dark:border-neutral-700 dark:bg-neutral-950/50',
    organizationSwitcherPopoverActionButtonIconBox: 'text-neutral-500 dark:text-neutral-400',
    organizationSwitcherPopoverFooter: 'border-t border-neutral-200 bg-neutral-50/70 dark:border-neutral-700 dark:bg-neutral-950/40',
    organizationListPreviewItems: 'gap-0',
    organizationListPreviewItemActionButton:
      'justify-center rounded-md border border-neutral-200 bg-transparent p-0 text-[0] shadow-none transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800',
    organizationPreviewMainIdentifier: 'text-neutral-900 dark:text-neutral-100',
    organizationPreviewSecondaryIdentifier: 'text-xs text-neutral-500 dark:text-neutral-400',
  };

  if (options.variant === 'sidebar') {
    return {
      elements: {
        ...sharedElements,
        rootBox: 'sidebar-org-switcher-root w-full',
        organizationSwitcherTrigger:
          'sidebar-org-switcher-trigger w-full !flex !items-center !justify-between !px-3 !py-2 !bg-white dark:!bg-neutral-900 !border !border-neutral-200 dark:!border-neutral-800 !rounded-lg !shadow-sm hover:!bg-neutral-50 dark:hover:!bg-neutral-800 !transition-colors !min-h-0',
        userPreviewMainIdentifier: '!text-sm !font-medium !text-neutral-900 dark:!text-neutral-100',
        userPreviewSecondaryIdentifier: '!text-xs !text-neutral-500',
        avatarBox: '!w-6 !h-6 !rounded-md',
        organizationSwitcherPopoverRootBox: 'sidebar-org-switcher-popover !left-0 !bottom-full !mb-2 !mt-0 !w-[16rem] !min-w-[16rem] !max-w-[16rem]',
        organizationSwitcherPopoverCard:
          '!w-[16rem] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl shadow-black/5 ring-1 ring-black/5 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-black/30 dark:ring-white/10',
        organizationSwitcherPopoverActionButton:
          'min-h-11 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
        organizationSwitcherPopoverActionButton__createOrganization: 'hidden',
        organizationSwitcherPreviewButton: 'min-h-12 rounded-none px-3 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/80',
        organizationListCreateOrganizationActionButton: 'hidden',
        organizationListPreviewItemActionButton:
          'h-8 w-8 min-w-8 max-w-8 justify-center rounded-md border border-neutral-200 bg-transparent p-0 text-[0] shadow-none transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800',
      },
    };
  }

  if (options.variant === 'drawer') {
    return {
      elements: {
        ...sharedElements,
        rootBox: 'relative w-full',
        organizationSwitcherTrigger:
          'w-full justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800',
        organizationSwitcherPopoverRootBox: '!left-0 !right-auto !top-full !mt-2 !z-[70010] !w-[17rem] !min-w-[17rem] !max-w-[17rem]',
        organizationSwitcherPopoverCard:
          '!z-[70011] !w-[17rem] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl shadow-black/5 ring-1 ring-black/5 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-black/30 dark:ring-white/10',
        organizationSwitcherPopoverActionButton:
          'min-h-9 px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
        organizationSwitcherPopoverActionButton__createOrganization: hideCreateOrganization,
        organizationSwitcherPreviewButton: 'min-h-10 rounded-none px-3 py-2 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/80',
        organizationListPreviewItem: 'border-b border-neutral-200/80 last:border-b-0 dark:border-neutral-700/80',
        organizationListPreviewButton: 'min-h-10 rounded-none px-3 py-2 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/80',
        organizationListCreateOrganizationActionButton:
          hideCreateOrganization || 'min-h-9 rounded-none px-3 py-2 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
        organizationListPreviewItemActionButton:
          'h-7 w-7 min-w-7 max-w-7 justify-center rounded-md border border-neutral-200 bg-transparent p-0 text-[0] shadow-none transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800',
      },
    };
  }

  return {
    elements: {
      ...sharedElements,
      rootBox: 'w-full',
      organizationSwitcherTrigger:
        'w-full justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800',
      organizationSwitcherPopoverRootBox: '!w-[16rem] !min-w-[16rem] !max-w-[16rem] pt-1.5',
      organizationSwitcherPopoverCard:
        '!w-[16rem] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl shadow-black/5 ring-1 ring-black/5 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-black/30 dark:ring-white/10',
      organizationSwitcherPopoverActionButton:
        'min-h-11 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
      organizationSwitcherPopoverActionButton__createOrganization: hideCreateOrganization,
      organizationSwitcherPreviewButton: 'min-h-12 rounded-none px-3 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/80',
      organizationListPreviewItem: 'border-b border-neutral-200/80 last:border-b-0 dark:border-neutral-700/80',
      organizationListPreviewButton: 'min-h-12 rounded-none px-3 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/80',
      organizationListCreateOrganizationActionButton:
        hideCreateOrganization || 'min-h-11 rounded-none px-3 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
      organizationListPreviewItemActionButton:
        'h-8 w-8 min-w-8 max-w-8 justify-center rounded-md border border-neutral-200 bg-transparent p-0 text-[0] shadow-none transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800',
    },
  };
}

export function getAuthFormAppearance(variant: AuthFormVariant): ClerkAppearance {
  const isModal = variant === 'modal';

  return {
    elements: {
      formButtonPrimary: 'bg-blue-600 hover:bg-blue-700 text-sm normal-case',
      cardBox: 'bg-white border border-neutral-200 shadow-xl dark:bg-neutral-900 dark:border-neutral-700',
      card: 'bg-white border-0 dark:bg-neutral-900',
      headerTitle: 'hidden',
      headerSubtitle: 'hidden',
      formFieldInput: isModal
        ? 'bg-white border border-neutral-300 text-neutral-900 dark:bg-neutral-800 dark:border-neutral-600 dark:text-white'
        : 'bg-neutral-800 border border-neutral-600 text-white',
      formFieldLabel: isModal ? 'text-neutral-700 dark:text-white' : 'text-white',
      identityPreviewText: isModal ? 'text-neutral-700 dark:text-white' : 'text-white',
      identityPreviewEditButton: isModal
        ? 'text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300'
        : 'text-blue-400 hover:text-blue-300',
      footer: 'bg-white border-t border-neutral-200 dark:bg-neutral-900 dark:border-neutral-700',
      footerItem: 'text-neutral-600 dark:text-neutral-400',
      footerActionText: 'text-neutral-600 dark:text-neutral-400',
      footerActionLink: isModal
        ? 'text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300'
        : 'text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300',
      dividerText: 'text-neutral-400',
      dividerLine: isModal ? 'border-neutral-200 dark:border-neutral-700' : 'border-neutral-700',
      socialButtonsBlockButton: isModal
        ? 'bg-neutral-100 border border-neutral-200 text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:hover:bg-neutral-700'
        : 'bg-neutral-800 border border-neutral-700 text-white hover:bg-neutral-700',
      socialButtonsBlockButtonText: isModal ? 'text-neutral-800 dark:text-white' : 'text-white',
      alternativeMethodsBlockButton: isModal
        ? 'bg-neutral-100 border border-neutral-200 text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:hover:bg-neutral-700'
        : 'bg-neutral-800 border border-neutral-700 text-white hover:bg-neutral-700',
      alternativeMethodsBlockButtonText: isModal ? 'text-neutral-800 dark:text-white' : 'text-white',
      alternativeMethodsBlockButtonArrow: isModal ? 'text-neutral-500 dark:text-white' : 'text-white',
      formResendCodeLink: isModal
        ? 'text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300'
        : 'text-blue-400 hover:text-blue-300',
      formFieldSuccessText: isModal ? 'text-emerald-500 dark:text-emerald-400' : 'text-emerald-400',
      formFieldErrorText: isModal ? 'text-red-500 dark:text-red-400' : 'text-red-400',
      formFieldWarningText: isModal ? 'text-amber-500 dark:text-amber-400' : 'text-amber-400',
      otpCodeFieldInputs:
        'flex relative justify-center gap-1 overflow-hidden rounded-md bg-neutral-900 isolation-isolate px-3 py-1 focus-within:[box-shadow:inset_0_0_0_3px_rgba(59,130,246,0.15)]',
      otpCodeFieldInput:
        'relative block h-14 w-12 min-w-[2.5rem] rounded-xl border border-neutral-600 bg-neutral-800 text-center text-2xl font-mono font-semibold tracking-wide leading-[2.1rem] z-[9999] text-neutral-900 dark:text-white ring-0 focus:ring-0 focus:outline-none shadow-md hover:shadow-lg transition-transform duration-150 transform-gpu appearance-none caret-transparent',
    },
    variables: {
      colorPrimary: '#3b82f6',
      colorBackground: '#171717',
      colorInputBackground: '#262626',
      colorInputText: '#ffffff',
      colorText: '#ffffff',
      colorTextSecondary: '#a3a3a3',
      colorTextOnPrimaryBackground: '#ffffff',
      borderRadius: '0.375rem',
    },
  };
}

export function getUserProfileAppearance(isLight: boolean, variant: ProfileVariant): ClerkAppearance {
  const isInline = variant === 'inline';

  if (isLight) {
    return {
      elements: {
        rootBox: isInline ? '' : 'z-50',
        card: isInline ? 'bg-white border border-slate-200 shadow-sm rounded-2xl' : 'bg-white border border-neutral-200 shadow-xl',
        navbar: isInline ? 'bg-white border-b border-slate-200' : undefined,
        navbarButton: isInline ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-50' : undefined,
        navbarButtonActive: isInline ? 'text-blue-600 bg-blue-50 border-blue-200' : undefined,
        headerTitle: 'text-neutral-900',
        headerSubtitle: isInline ? 'text-slate-600' : 'text-neutral-600',
        socialButtonsBlockButton: isInline
          ? 'bg-slate-50 border border-slate-200 text-slate-900 hover:bg-slate-100'
          : 'bg-neutral-100 border border-neutral-200 text-neutral-900 hover:bg-neutral-50',
        formButtonPrimary: 'bg-blue-600 hover:bg-blue-700 text-white',
        formFieldInput: isInline ? 'bg-white border border-slate-300 text-slate-900' : 'bg-white border border-neutral-300 text-neutral-900',
        formFieldLabel: isInline ? 'text-slate-900' : 'text-neutral-900',
        identityPreviewText: isInline ? 'text-slate-900' : 'text-neutral-900',
        identityPreviewEditButton: 'text-blue-600 hover:text-blue-500',
        footerActionText: isInline ? 'text-slate-600' : 'text-neutral-600',
        footerActionLink: 'text-blue-600 hover:text-blue-500',
        dividerText: isInline ? 'text-slate-500' : 'text-neutral-500',
        dividerLine: isInline ? 'border-slate-200' : 'border-neutral-200',
        formResendCodeLink: 'text-blue-600 hover:text-blue-500',
        formFieldSuccessText: 'text-emerald-600',
        formFieldErrorText: 'text-red-600',
        formFieldWarningText: 'text-amber-600',
        pageScrollBox: isInline ? 'bg-white' : undefined,
        page: isInline ? 'bg-white' : undefined,
      },
      variables: {
        colorPrimary: '#3b82f6',
        colorBackground: '#ffffff',
        colorInputBackground: '#ffffff',
        colorInputText: '#111827',
        colorText: '#111827',
        colorTextSecondary: '#4b5563',
        colorTextOnPrimaryBackground: '#ffffff',
        borderRadius: isInline ? '0.75rem' : '0.375rem',
      },
    };
  }

  return {
    elements: {
      rootBox: isInline ? '' : 'z-50',
      card: isInline ? 'bg-neutral-900 border border-neutral-700 shadow-sm rounded-2xl' : 'bg-neutral-900 border border-neutral-700 shadow-xl',
      navbar: isInline ? 'bg-neutral-900 border-b border-neutral-700' : undefined,
      navbarButton: isInline ? 'text-neutral-300 hover:text-white hover:bg-neutral-800' : undefined,
      navbarButtonActive: isInline ? 'text-blue-400 bg-neutral-800 border-neutral-600' : undefined,
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
      formFieldWarningText: 'text-amber-400',
      pageScrollBox: isInline ? 'bg-neutral-900' : undefined,
      page: isInline ? 'bg-neutral-900' : undefined,
    },
    variables: {
      colorPrimary: '#3b82f6',
      colorBackground: '#171717',
      colorInputBackground: '#262626',
      colorInputText: '#ffffff',
      colorText: '#ffffff',
      colorTextSecondary: '#a3a3a3',
      colorTextOnPrimaryBackground: '#ffffff',
      borderRadius: isInline ? '0.75rem' : '0.375rem',
    },
  };
}