import { prisma } from './prisma';
import { getOrganizationReferenceWhere } from './organization-reference';

function getProviderOrganizationId(value: { providerOrganizationId?: string | null }) {
  return value.providerOrganizationId ?? null;
}

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
      OR: getOrganizationReferenceWhere(organizationRef),
    },
    select: {
      id: true,
      providerOrganizationId: true,
    },
  });

  if (ownedOrganization) {
    return {
      organizationId: ownedOrganization.id,
      providerOrganizationId: getProviderOrganizationId({ providerOrganizationId: ownedOrganization.providerOrganizationId }),
      role: 'OWNER',
    };
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      organization: {
        OR: getOrganizationReferenceWhere(organizationRef),
      },
    },
    select: {
      organization: {
        select: {
          id: true,
          providerOrganizationId: true,
        },
      },
    },
  });

  if (!membership?.organization) {
    return null;
  }

  return {
    organizationId: membership.organization.id,
    providerOrganizationId: getProviderOrganizationId({ providerOrganizationId: membership.organization.providerOrganizationId }),
    role: 'MEMBER',
  };
}