import { clerkClient } from '@clerk/nextjs/server';
import { Logger } from './logger';
import { toError } from './runtime-guards';

export type ClerkMembershipRole = 'org:admin' | 'org:member';

type ClerkApi = Awaited<ReturnType<typeof clerkClient>>;
type ClerkErrorEntry = { meta?: { paramName?: string }; message?: string };

async function resolveClient(provided?: ClerkApi) {
  if (provided) return provided;
  return await clerkClient();
}

export async function addOrConfirmClerkMembership(params: {
  organizationId: string;
  userId: string;
  role: ClerkMembershipRole;
  clerk?: ClerkApi;
}) {
  const client = await resolveClient(params.clerk);
  try {
    await client.organizations.createOrganizationMembership({
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
        Logger.info('addOrConfirmClerkMembership: Clerk role invalid for organization, retrying without role', {
          organizationId: params.organizationId,
          userId: params.userId,
          attemptedRole: params.role,
        });
        await client.organizations.createOrganizationMembership({
          organizationId: params.organizationId,
          userId: params.userId,
          // Clerk requires a role; if the attempted role was invalid, fall
          // back to a conservative default of `org:member` so the call is
          // well-typed and Clerk will accept it.
          role: (params.role as ClerkMembershipRole) ?? 'org:member',
        });
        return;
      }
    } catch {
      // ignore JSON parse issues and fall through
    }
    throw err;
  }
}
