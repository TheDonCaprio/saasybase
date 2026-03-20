'use client';

import { useAuthInstance } from '@/lib/auth-provider/client';
import { getUserProfileAppearance } from '@/lib/auth-provider/client/clerk-appearance';

interface ClerkProfileModalProps {
  trigger: React.ReactNode;
  mode?: 'profile' | 'security' | 'account';
}

export function ClerkProfileModal({ trigger, mode = 'profile' }: ClerkProfileModalProps) {
  const { openUserProfile } = useAuthInstance();

  const handleOpenProfile = () => {
    // If document root has .light we want Clerk to render a light card background
    const isLight = typeof document !== 'undefined' && document.documentElement.classList.contains('light');

    // Forward the desired initial tab using __experimental_startPath
    // Map mode to the correct path: 
    // 'profile' → undefined/empty (default first tab)
    // 'security' → '/security'
    const startPath = mode === 'security' ? '/security' : undefined;
    
    openUserProfile({ 
      appearance: getUserProfileAppearance(isLight, 'modal'),
      ...(startPath && { __experimental_startPath: startPath })
    });
  };

  return (
    <div onClick={handleOpenProfile} className="cursor-pointer">
      {trigger}
    </div>
  );
}
