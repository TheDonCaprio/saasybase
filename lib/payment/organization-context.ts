import { Logger } from '../logger';
import { getOrganizationPlanContext } from '../user-plan-context';
import { toError } from '../runtime-guards';

export async function resolveOrganizationContext(userId: string) {
    try {
        return await getOrganizationPlanContext(userId);
    } catch (err) {
        Logger.warn('Failed to resolve organization context', { userId, error: toError(err).message });
        return null;
    }
}