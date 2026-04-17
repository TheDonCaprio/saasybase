import { prisma } from './prisma';

export type CheckoutWorkspaceContext = {
  organizationId: string;
  providerOrganizationId: string | null;
  role: 'OWNER' | 'MEMBER';
};

export async function resolveCheckoutWorkspaceContext(
  userId: string,
  activeOrganizationRef?: string | null,
): Promise<CheckoutWorkspaceContext | null> {
  if (typeof activeOrganizationRef !== 'string' || activeOrganizationRef.trim().length === 0) {
    return null;
  }

  const organizationRef = activeOrganizationRef.trim();

  const ownedOrganization = await prisma.organization.findFirst({
    where: {
      ownerUserId: userId,
      OR: [
        { id: organizationRef },
        { clerkOrganizationId: organizationRef },
      ],
    },
    select: {
      id: true,
      clerkOrganizationId: true,
    },
  });

  if (ownedOrganization) {
    return {
      organizationId: ownedOrganization.id,
      providerOrganizationId: ownedOrganization.clerkOrganizationId,
      role: 'OWNER',
    };
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      organization: {
        OR: [
          { id: organizationRef },
          { clerkOrganizationId: organizationRef },
        ],
      },
    },
    select: {
      organization: {
        select: {
          id: true,
          clerkOrganizationId: true,
        },
      },
    },
  });

  if (!membership?.organization) {
    return null;
  }

  return {
    organizationId: membership.organization.id,
    providerOrganizationId: membership.organization.clerkOrganizationId,
    role: 'MEMBER',
  };
}