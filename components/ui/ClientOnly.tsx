'use client';

import React, { useSyncExternalStore } from 'react';

function subscribe() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export function ClientOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const hasMounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  return hasMounted ? <>{children}</> : <>{fallback}</>;
}