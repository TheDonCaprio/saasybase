'use client';

import React, { useEffect, useState } from 'react';
import { AuthSignOutButton } from '@/lib/auth-provider/client';

export function AdminSignOutButton() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <AuthSignOutButton>
      <button className="text-sm text-neutral-400 hover:text-white">Sign Out</button>
    </AuthSignOutButton>
  );
}
