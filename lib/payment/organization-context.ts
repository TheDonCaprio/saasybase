import { Logger } from '../logger';
import { getOrganizationPlanContext } from '../user-plan-context';
import { toError } from '../runtime-guards';

export function resolveActiveOrganizationIdFromMetadata(
    metadata?: Record<string, unknown> | null
): string | null {
    if (!metadata) return null;
    const candidates = [
        metadata.activeOrganizationId,
        metadata.organizationId,
        metadata.localOrganizationId,
        metadata.active_org_id,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate.trim();
        }
    }
    return null;
}

export function resolveActiveClerkOrgIdFromMetadata(
    metadata?: Record<string, unknown> | null
): string | null {
    const localOrganizationId = resolveActiveOrganizationIdFromMetadata(metadata);
    if (localOrganizationId) {
        return localOrganizationId;
    }

    if (!metadata) return null;
    const candidates = [
        metadata.activeProviderOrganizationId,
        metadata.activeClerkOrgId,
        metadata.clerkOrgId,
        metadata.orgId,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate.trim();
        }
    }
    return null;
}

export async function resolveOrganizationContext(userId: string, activeClerkOrgId?: string | null) {
    try {
        return await getOrganizationPlanContext(userId, activeClerkOrgId ?? undefined);
    } catch (err) {
        Logger.warn('Failed to resolve organization context', {
            userId,
            activeClerkOrgId: activeClerkOrgId ?? null,
            error: toError(err).message,
        });
        return null;
    }
}