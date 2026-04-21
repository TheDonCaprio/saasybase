'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import { faCalendarDays, faChevronDown, faCoins, faCrown } from '@fortawesome/free-solid-svg-icons';
import { AuthOrganizationSwitcher } from '@/lib/auth-provider/client';
import { getOrganizationSwitcherAppearance } from '@/lib/auth-provider/client/clerk-appearance';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { TransientNavLink } from '@/components/ui/TransientNavLink';
import type { SharedUserProfile } from '@/components/UserProfileProvider';
import type { ReactNode } from 'react';

type AccountShortcut = {
  href: string;
  label: string;
  icon?: IconProp;
};

interface SharedDrawerAccountSectionProps {
  profile: SharedUserProfile | null;
  loading?: boolean;
  detailsExpanded: boolean;
  currentPath: string;
  onToggleDetails: () => void;
  onClose: () => void;
  roleBadge?: ReactNode;
  accountShortcuts?: AccountShortcut[];
}

export function SharedDrawerAccountSection({
  profile,
  loading,
  detailsExpanded,
  currentPath,
  onToggleDetails,
  onClose,
  roleBadge,
  accountShortcuts = [],
}: SharedDrawerAccountSectionProps) {
  if (loading) {
    return (
      <div className="space-y-2.5 p-3.5">
        <div className="h-4 rounded bg-neutral-200 animate-pulse dark:bg-neutral-800" />
        <div className="h-4 w-3/4 rounded bg-neutral-200 animate-pulse dark:bg-neutral-800" />
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const personalTokenCount = profile.subscription?.tokens.remaining ?? profile.paidTokens?.remaining ?? null;
  const personalTokenName = profile.subscription?.tokenName ?? profile.paidTokens?.tokenName ?? null;
  const hasUnlimitedPersonalTokens = Boolean(profile.subscription?.tokens.isUnlimited || profile.paidTokens?.isUnlimited);
  const personalTokenDisplay = hasUnlimitedPersonalTokens
    ? 'Unlimited'
    : personalTokenCount != null
      ? personalTokenCount.toLocaleString()
      : null;
  const isOrganizationContext = profile.planSource === 'ORGANIZATION';
  const isPersonalContext = profile.planSource === 'PERSONAL';
  const activePlanName = isOrganizationContext
    ? profile.organization?.planName || 'Workspace Plan'
    : isPersonalContext
      ? profile.subscription?.planName || 'Free Plan'
      : 'Free Plan';
  const shouldShowPersonalTokens = Boolean(isPersonalContext && personalTokenName && (hasUnlimitedPersonalTokens || personalTokenCount != null));
  const shouldShowSharedTokens = Boolean(isOrganizationContext && profile.sharedTokens);
  const shouldShowFreeTokens = Boolean(!isOrganizationContext && profile.freeTokens);
  const billingDateValue = isOrganizationContext
    ? profile.organization?.expiresAt ?? profile.subscription?.expiresAt ?? null
    : profile.subscription?.expiresAt ?? null;
  const billingDateLabel = isOrganizationContext
    ? profile.organization?.billingDateLabel ?? profile.subscription?.billingDateLabel ?? 'Expires'
    : profile.subscription?.billingDateLabel ?? 'Expires';
  const billingDateDisplayLabel = isOrganizationContext && profile.organization?.role === 'MEMBER'
    ? billingDateLabel === 'Renews'
      ? 'Managed renewal'
      : billingDateLabel === 'Cancels'
        ? 'Managed cancellation'
        : 'Managed expiry'
    : billingDateLabel;

  return (
    <div className="space-y-2.5 p-3.5">
      <button
        type="button"
        onClick={onToggleDetails}
        className="flex w-full items-start justify-between gap-3 rounded-xl px-0 py-0 text-left transition"
        aria-expanded={detailsExpanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-neutral-100">
              {profile.user.name}
            </p>
            {roleBadge}
          </div>
          <p className="truncate text-xs text-neutral-400">
            {profile.user.email}
          </p>
          {profile.organization && (
            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
              {profile.organization.name} · {profile.organization.role === 'OWNER' ? 'Owner' : 'Member'}
            </p>
          )}
        </div>
        <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--accent-primary-rgb))] text-[color:#fff] shadow-sm transition hover:opacity-90">
          <FontAwesomeIcon icon={faChevronDown} className={`h-3 w-3 transition-transform ${detailsExpanded ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {detailsExpanded ? (
        <div className="space-y-2 rounded-xl py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faCrown} className="h-4 w-4 text-amber-500" />
            <span className="text-neutral-300">{activePlanName}</span>
          </div>

          {shouldShowPersonalTokens && personalTokenDisplay && personalTokenName && (
            <div className="flex items-center gap-2 text-sm">
              <FontAwesomeIcon icon={faCoins} className="h-4 w-4 text-emerald-500" />
              <span className="text-neutral-300">
                {personalTokenDisplay} {personalTokenName} (Personal)
              </span>
            </div>
          )}

          {shouldShowSharedTokens && profile.sharedTokens && (
            <div className="flex items-start gap-2 text-sm">
              <FontAwesomeIcon icon={faCoins} className="h-4 w-4 text-[rgb(var(--accent-primary-rgb))]" />
              <div>
                <span className="text-neutral-300">
                  {profile.sharedTokens.remaining.toLocaleString()} {profile.sharedTokens.tokenName}
                  {profile.organization ? ` (${profile.organization.name})` : ''}
                </span>
                <p className="text-[11px] text-neutral-400">
                  {profile.organization?.tokenPoolStrategy === 'ALLOCATED_PER_MEMBER'
                    ? 'Allocated to you in this workspace'
                    : profile.sharedTokens.cap != null
                    ? `Cap: ${profile.sharedTokens.cap.toLocaleString()} ${profile.sharedTokens.tokenName} (${(profile.sharedTokens.strategy || 'SOFT').toLowerCase()} mode)`
                    : profile.sharedTokens.strategy === 'DISABLED'
                    ? 'Member caps disabled'
                    : ''}
                </p>
              </div>
            </div>
          )}

          {shouldShowFreeTokens && profile.freeTokens && (
            <div className="flex items-center gap-2 text-sm">
              <FontAwesomeIcon icon={faCoins} className="h-4 w-4 text-sky-500" />
              <span className="text-neutral-300">
                {profile.freeTokens.remaining.toLocaleString()} {profile.freeTokens.tokenName || 'tokens'} (Free)
              </span>
            </div>
          )}

          {billingDateValue && (
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <FontAwesomeIcon icon={faCalendarDays} className="h-4 w-4" />
              <span>{billingDateDisplayLabel}: {billingDateValue}</span>
            </div>
          )}

          {profile.planSource === 'FREE' && (
            <TransientNavLink
              href="/pricing"
              className="block text-sm text-[rgb(var(--accent-primary-rgb))] hover:text-[rgb(var(--accent-hover-rgb))]"
              onClick={onClose}
            >
              Upgrade to Pro →
            </TransientNavLink>
          )}

          {accountShortcuts.length > 0 && (
            <div className="space-y-1.5 border-t border-[color:rgb(var(--border-primary))] pt-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Account</p>
              {accountShortcuts.map((item) => {
                const active = item.href === '/dashboard'
                  ? currentPath === '/dashboard'
                  : currentPath === item.href || currentPath.startsWith(`${item.href}/`);

                return (
                  <TransientNavLink
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`group flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                      active
                        ? 'border-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.35))] bg-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.14))] text-neutral-100 shadow-sm'
                        : 'border-transparent text-neutral-300 hover:border-[color:rgb(var(--border-primary))] hover:bg-neutral-900/60'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {item.icon && (
                        <FontAwesomeIcon
                          icon={item.icon}
                          className={`h-4 w-4 transition ${
                            active
                              ? 'text-[rgb(var(--accent-primary-rgb))]'
                              : 'text-neutral-500 group-hover:text-neutral-200'
                          }`}
                        />
                      )}
                      <span className="font-medium tracking-tight text-current">{item.label}</span>
                    </span>
                  </TransientNavLink>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Workspace</p>
        <ClientOnly fallback={<div className="h-10 rounded-xl border border-neutral-800" aria-hidden="true" />}>
          <AuthOrganizationSwitcher
            hidePersonal={false}
            appearance={getOrganizationSwitcherAppearance({
              variant: 'drawer',
              canCreateOrganization: profile.canCreateOrganization,
            })}
          />
        </ClientOnly>
      </div>
    </div>
  );
}