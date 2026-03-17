import { prisma } from './prisma';
import { workspaceService } from './workspace-service';
import { Logger } from './logger';
import { toError } from './runtime-guards';

export async function syncOrganizationBillingMetadata(params: {
  organizationId: string;
  planId: string;
  seatLimit?: number | null;
  tokenPoolStrategy?: string | null;
}) {
  const desiredSeatLimit = typeof params.seatLimit === 'number' ? params.seatLimit : null;
  const desiredStrategy = (params.tokenPoolStrategy || 'SHARED_FOR_ORG').toString().toUpperCase();

  const organization = await prisma.organization.findUnique({
    where: { id: params.organizationId },
    select: {
      id: true,
      clerkOrganizationId: true,
      planId: true,
      seatLimit: true,
      tokenPoolStrategy: true,
    },
  });

  if (!organization) {
    return;
  }

  const strategyChanged = (organization.tokenPoolStrategy || '').toUpperCase() !== desiredStrategy;
  const seatLimitChanged = (organization.seatLimit ?? null) !== desiredSeatLimit;
  const planChanged = organization.planId !== params.planId;

  if (planChanged || seatLimitChanged || strategyChanged) {
    await prisma.organization.update({
      where: { id: organization.id },
      data: {
        planId: params.planId,
        seatLimit: desiredSeatLimit,
        tokenPoolStrategy: desiredStrategy,
      },
    });
  }

  if (!organization.clerkOrganizationId) {
    return;
  }

  try {
    await workspaceService.updateProviderOrganization(organization.clerkOrganizationId, {
      maxAllowedMemberships: desiredSeatLimit ?? undefined,
      publicMetadata: {
        planId: params.planId,
        seatLimit: desiredSeatLimit,
        tokenPoolStrategy: desiredStrategy,
      },
    });
  } catch (error) {
    Logger.warn('Failed to sync auth provider organization billing metadata', {
      organizationId: organization.id,
      error: toError(error).message,
    });
  }
}