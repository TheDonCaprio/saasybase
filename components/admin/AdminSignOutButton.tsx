'use client';

import React, { useEffect, useState } from 'react';
import { SignOutButton } from '@clerk/nextjs';

export function AdminSignOutButton() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <SignOutButton>
      <button className="text-sm text-neutral-400 hover:text-white">Sign Out</button>
    </SignOutButton>
  );
}
