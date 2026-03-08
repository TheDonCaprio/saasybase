'use client';

import { useAuthUser } from '@/lib/auth-provider/client';
import { ClerkProfileModal } from './ClerkProfileModal';
import { formatDate } from '../../lib/formatDate';
import { useFormatSettings } from '../FormatSettingsProvider';

interface ProfileHeaderProps {
  user?: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: Date;
  };
  subscription?: {
    plan: {
      name: string;
    };
  } | null;
}

export function ProfileHeader({ user: dbUser, subscription }: ProfileHeaderProps) {
  const { user: clerkUser, isLoaded } = useAuthUser();
  const settings = useFormatSettings();

  if (!isLoaded) {
    return (
      <div className="border border-neutral-700 rounded p-6">
        <div className="flex items-start gap-6">
          <div className="w-16 h-16 bg-neutral-700 rounded-full animate-pulse"></div>
          <div className="flex-1 space-y-3">
            <div className="h-6 bg-neutral-700 rounded animate-pulse w-48"></div>
            <div className="h-4 bg-neutral-700 rounded animate-pulse w-32"></div>
          </div>
        </div>
      </div>
    );
  }

  const fullName = clerkUser?.fullName || clerkUser?.firstName || 'Anonymous User';

  return (
    <div className="border border-neutral-700 rounded p-6">
      <div className="flex items-start gap-6">
        <div className="w-16 h-16 bg-neutral-700 rounded-full flex items-center justify-center">
          {clerkUser?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clerkUser.imageUrl} alt="Profile" className="w-16 h-16 rounded-full" />
          ) : (
            <span className="text-xl font-bold">
              {(fullName || clerkUser?.emailAddresses?.[0]?.emailAddress || 'U').charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-lg font-medium">{fullName}</div>
            <ClerkProfileModal
              trigger={
                <button className="text-sm text-blue-400 hover:text-blue-300 px-2 py-1 rounded border border-neutral-700 hover:border-neutral-600 transition-colors">
                  Edit Name
                </button>
              }
            />
          </div>
          <div className="text-neutral-400">{clerkUser?.emailAddresses?.[0]?.emailAddress}</div>
          
          {dbUser && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-neutral-500">Member Since</div>
                <div className="font-medium">{formatDate(dbUser.createdAt, { mode: settings.mode, timezone: settings.timezone })}</div>
              </div>
              <div>
                <div className="text-neutral-500">Account Type</div>
                <div className={`font-medium ${dbUser.role === 'ADMIN' ? 'text-purple-400' : 'text-neutral-300'}`}>
                  {dbUser.role === 'ADMIN' ? 'Administrator' : 'User'}
                </div>
              </div>
              <div>
                <div className="text-neutral-500">Current Plan</div>
                <div className={`font-medium ${subscription ? 'text-emerald-400' : 'text-neutral-400'}`}>
                  {subscription ? subscription.plan.name : 'Free Tier'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
