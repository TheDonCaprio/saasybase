import { Logger } from '../logger';
import { getOrganizationPlanContext } from '../user-plan-context';
import { toError } from '../runtime-guards';

export function resolveActiveClerkOrgIdFromMetadata(
    metadata?: Record<string, unknown> | null
): string | null {
    if (!metadata) return null;
    const candidates = [
        metadata.activeClerkOrgId,
        metadata.clerkOrgId,
        metadata.orgId,
        metadata.active_org_id,
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