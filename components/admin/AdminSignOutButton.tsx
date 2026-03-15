'use client';

import React from 'react';
import { AuthSignOutButton } from '@/lib/auth-provider/client';

export function AdminSignOutButton() {
  if (typeof document === 'undefined') return null;

  return (
    <AuthSignOutButton>
      <button className="text-sm text-neutral-400 hover:text-white">Sign Out</button>
    </AuthSignOutButton>
  );
}
