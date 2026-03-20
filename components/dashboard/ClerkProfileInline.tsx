'use client';

import { AuthUserProfile } from '@/lib/auth-provider/client';
import { getUserProfileAppearance } from '@/lib/auth-provider/client/clerk-appearance';

interface ClerkProfileInlineProps {
  mode?: 'profile' | 'security' | 'account';
}

export function ClerkProfileInline({ mode = 'profile' }: ClerkProfileInlineProps) {
  void mode; // Reserved for future multi-tab support
  
  // Check if document root has .light class for theme detection
  const isLight = typeof document !== 'undefined' && document.documentElement.classList.contains('light');

  return (
    <div className="w-full">
      <AuthUserProfile
        appearance={getUserProfileAppearance(isLight, 'inline')}
        routing="virtual"
      />
    </div>
  );
}
