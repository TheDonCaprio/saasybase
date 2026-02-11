import React from 'react';
import { FeatureId, isProFeature } from './features';
import { getAuthSafe } from './auth';
import { prisma } from './prisma';
import Link from 'next/link';
import { getOrganizationAccessSummary } from './organization-access';

async function userHasActiveSubscription(userId: string) {
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
    select: { id: true }
  });
  return !!sub;
}

export async function FeatureGate({ feature, children }: { feature: FeatureId; children: React.ReactNode }) {
  const auth = await getAuthSafe();
  const userId = auth?.userId || null;
  const proNeeded = isProFeature(feature);
  if (!proNeeded) return <>{children}</>;
  if (!userId) {
    return <GateMessage message="Sign in to unlock this feature." />;
  }
  // Allow if user has an active personal subscription OR is an owner/member
  // of an organization with a team subscription that supports organizations.
  const hasSub = await userHasActiveSubscription(userId);
  let orgAccessAllowed = false;
  try {
    const orgAccess = await getOrganizationAccessSummary(userId);
    orgAccessAllowed = !!(orgAccess && orgAccess.allowed === true);
  } catch {
    // If organization access check fails, default to subscription-only gating.
    orgAccessAllowed = false;
  }

  const allowed = hasSub || orgAccessAllowed;
  if (!allowed) {
    return <GateMessage message="Pro required for this feature." />;
  }
  return <>{children}</>;
}

function GateMessage({ message }: { message: string }) {
  return (
    <div className="rounded border border-dashed border-yellow-500 p-4 text-sm flex items-center justify-between gap-4 bg-yellow-950/30">
      <span>{message}</span>
      <Link href="/pricing" className="underline text-yellow-300">Upgrade</Link>
    </div>
  );
}
