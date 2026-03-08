import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { ensureTeamOrganization } from '../../../../lib/organization-access';
import { fetchTeamDashboardState } from '../../../../lib/team-dashboard';
import { Logger } from '../../../../lib/logger';
import { toError } from '../../../../lib/runtime-guards';

export async function POST(request: NextRequest) {
  const { userId, orgId } = await authService.getSession();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let requestedName: string | undefined;
  try {
    const body = (await request.json?.()) ?? {};
    if (body && typeof body.name === 'string' && body.name.trim().length > 0) {
      requestedName = body.name.trim();
    }
  } catch {
    // ignore non-JSON or empty body
  }

  try {
    // Validate provided name (server-side) to ensure constraints are enforced.
    if (requestedName) {
      const name = requestedName.trim();
      const ORG_NAME_MAX = 30;
      const ORG_NAME_RE = /^[A-Za-z0-9\-\.\s,']+$/;
      if (name.length === 0 || name.length > ORG_NAME_MAX || !ORG_NAME_RE.test(name)) {
        return NextResponse.json({ ok: false, error: `Invalid organization name. Must be 1-${ORG_NAME_MAX} characters and only letters, numbers, dash (-), dot (.), space, comma, and apostrophe (') are allowed.` }, { status: 400 });
      }
    }

    await ensureTeamOrganization(userId, requestedName);
    const state = await fetchTeamDashboardState(userId, {
      forceSync: true,
      activeClerkOrgId: orgId ?? null,
    });
    return NextResponse.json({ ok: true, ...state });
  } catch (err: unknown) {
    const error = toError(err);
    Logger.error('team provision failed', { userId, error: error.message });
    return NextResponse.json({ ok: false, error: error.message || 'Failed to provision team workspace' }, { status: 400 });
  }
}
