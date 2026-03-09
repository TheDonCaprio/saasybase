'use client';

import React from 'react';
import { useAuthUser } from '@/lib/auth-provider/client';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';
import ClerkProfileButtons from './ClerkProfileButtons';

interface ReactiveProfileHeaderProps {
  fallbackUser: {
    id: string;
    email: string | null;
    name: string | null;
    role: string;
    createdAt: Date;
    imageUrl?: string | null;
  };
  subscription?: {
    plan: {
      name: string;
    };
  } | null;
  preformattedCreatedAt?: string;
}

export function ReactiveProfileHeader({ fallbackUser, subscription, preformattedCreatedAt }: ReactiveProfileHeaderProps) {
  const { user: clerkUser, isLoaded } = useAuthUser();
  const settings = useFormatSettings();
  const isNextAuth = process.env.NEXT_PUBLIC_AUTH_PROVIDER === 'nextauth';

  // No debug instrumentation here; server preformatted strings are consumed directly in the markup.

  // Use Clerk user data when available, fallback to database user
  const displayName = !isNextAuth && isLoaded && clerkUser 
    ? (clerkUser.fullName || clerkUser.firstName || 'Anonymous User')
    : (fallbackUser.name || 'Anonymous User');

  const displayEmail = !isNextAuth && isLoaded && clerkUser
    ? clerkUser.emailAddresses?.[0]?.emailAddress
    : (fallbackUser.email || 'No email');

  const displayImage = !isNextAuth && isLoaded && clerkUser
    ? clerkUser.imageUrl
    : fallbackUser.imageUrl;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
      <div className="flex items-start gap-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 dark:bg-neutral-700">
          {displayImage ? (
            // Use raw <img> here; Image optimization isn't required for profile avatars.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayImage} alt="Profile" className="w-16 h-16 rounded-full" />
          ) : (
            <span className="text-xl font-bold">
              {(displayName || displayEmail || 'U').charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-lg font-medium text-slate-900 dark:text-neutral-100">
              {displayName}
            </div>
          </div>
          <div className="text-slate-500 dark:text-neutral-400">{displayEmail}</div>
          
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
            <div>
              <div className="text-slate-500 dark:text-neutral-500">Member Since</div>
                <div className="font-medium text-slate-800 dark:text-neutral-100">
                  {preformattedCreatedAt ?? formatDate(fallbackUser.createdAt, { mode: settings.mode, timezone: settings.timezone })}
                </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-neutral-500">Account Type</div>
              <div className={`font-medium ${fallbackUser.role === 'ADMIN' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-700 dark:text-neutral-300'}`}>
                {fallbackUser.role === 'ADMIN' ? 'Administrator' : 'User'}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-neutral-500">Current Plan</div>
              <div className={`font-medium ${subscription ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-neutral-400'}`}>
                {subscription ? subscription.plan.name : 'Free Tier'}
              </div>
            </div>
          </div>
          
          <div className="mt-4 flex items-center gap-3">
            <ClerkProfileButtons defaultName={fallbackUser.name} defaultEmail={fallbackUser.email} />
          </div>
        </div>
      </div>
    </div>
  );
}
