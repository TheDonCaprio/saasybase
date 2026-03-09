import { Logger } from './logger';
import { toError } from './runtime-guards';
import { workspaceService } from './workspace-service';

export type ClerkMembershipRole = 'org:admin' | 'org:member';

type ClerkErrorEntry = { meta?: { paramName?: string }; message?: string };

export async function addOrConfirmClerkMembership(params: {
  organizationId: string;
  userId: string;
  role: ClerkMembershipRole;
  clerk?: unknown;
}) {
  try {
    await workspaceService.createProviderMembership({
      organizationId: params.organizationId,
      userId: params.userId,
      role: params.role,
    });
  } catch (err: unknown) {
    const error = toError(err);
    const message = error.message?.toLowerCase() ?? '';
    if (message.includes('already') && message.includes('member')) {
      Logger.info('addOrConfirmClerkMembership: user already member, continuing', {
        organizationId: params.organizationId,
        userId: params.userId,
      });
      return;
    }
    try {
      const raw = JSON.parse(JSON.stringify(err)) as { errors?: ClerkErrorEntry[] } | null;
      const roleProblem = Array.isArray(raw?.errors) && raw.errors.some((entry) => entry?.meta?.paramName === 'role' || String(entry?.message ?? '').toLowerCase().includes('role'));
      if (roleProblem) {
        Logger.info('addOrConfirmClerkMembership: role invalid for organization, retrying without role', {
          organizationId: params.organizationId,
          userId: params.userId,
          attemptedRole: params.role,
        });
        await workspaceService.createProviderMembership({
          organizationId: params.organizationId,
          userId: params.userId,
          role: 'org:member',
        });
        return;
      }
    } catch {
      // ignore JSON parse issues and fall through
    }
    throw err;
  }
}
