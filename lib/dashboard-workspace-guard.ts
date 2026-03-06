import { redirect } from 'next/navigation';
import { prisma } from './prisma';
import { getActiveTeamSubscription } from './organization-access';

export async function enforceTeamWorkspaceProvisioningGuard(userId: string) {
  const activeTeamSubscription = await getActiveTeamSubscription(userId, { includeGrace: true });
  if (!activeTeamSubscription) {
    return;
  }

  const ownedWorkspace = await prisma.organization.findFirst({
    where: { ownerUserId: userId },
    select: { id: true },
  });

  if (!ownedWorkspace) {
    redirect('/dashboard/team?fromCheckout=1&provision=1');
  }
}
