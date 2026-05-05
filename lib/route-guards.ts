import { redirect } from 'next/navigation';
import {
  getAuthSafe,
  isAuthGuardError,
  requireAdmin,
  requireAdminOrModerator,
  type AdminOrModeratorContext,
} from './auth';
import { ModeratorSection } from './moderator';
import { normalizeAppRedirectPath } from './url-security';

const DEFAULT_USER_RETURN_PATH = '/dashboard';
const DEFAULT_ADMIN_RETURN_PATH = '/admin';

export type RouteSearchParams = Record<string, string | string[] | undefined>;

export function sanitizeReturnPath(returnPath?: string | null, fallbackPath: string = DEFAULT_USER_RETURN_PATH): string {
  return normalizeAppRedirectPath(returnPath, {
    fallbackPath,
    disallowedPaths: ['/sign-in', '/sign-up'],
    disallowedPathPrefixes: ['/sign-in', '/sign-up'],
  });
}

function buildSignInRedirect(returnPath?: string | null) {
  const sanitized = sanitizeReturnPath(returnPath, DEFAULT_USER_RETURN_PATH);
  const params = new URLSearchParams({ redirect_url: sanitized });
  return `/sign-in?${params.toString()}`;
}

export function buildSignInRedirectUrl(returnPath?: string | null) {
  return buildSignInRedirect(returnPath);
}

function ensureBasePath(basePath: string | undefined): string {
  if (!basePath || typeof basePath !== 'string') {
    return DEFAULT_USER_RETURN_PATH;
  }

  const trimmed = basePath.trim();
  if (!trimmed) {
    return DEFAULT_USER_RETURN_PATH;
  }

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  return `/${trimmed.replace(/^\/+/, '')}`;
}

export function buildReturnPath(basePath: string, searchParams?: RouteSearchParams) {
  const normalizedBase = ensureBasePath(basePath);

  if (!searchParams || Object.keys(searchParams).length === 0) {
    return sanitizeReturnPath(normalizedBase, DEFAULT_USER_RETURN_PATH);
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') {
          params.append(key, entry);
        }
      }
    }
  }

  const query = params.toString();
  const fullPath = query ? `${normalizedBase}?${query}` : normalizedBase;
  return sanitizeReturnPath(fullPath, DEFAULT_USER_RETURN_PATH);
}

export async function requireAuth(returnPath?: string): Promise<{ userId: string; orgId?: string | null }> {
  const auth = await getAuthSafe();
  if (!auth?.userId) {
    redirect(buildSignInRedirect(returnPath ?? DEFAULT_USER_RETURN_PATH));
  }
  return { userId: auth.userId, orgId: auth.orgId };
}

// Page-only admin guard: redirects instead of returning structured auth errors.
export async function requireAdminPageAccess(returnPath?: string): Promise<{ userId: string }> {
  try {
    const userId = await requireAdmin();
    return { userId };
  } catch (error) {
    if (isAuthGuardError(error) && error.code === 'UNAUTHENTICATED') {
      redirect(buildSignInRedirect(returnPath ?? DEFAULT_ADMIN_RETURN_PATH));
    }

    redirect('/access-denied');
  }
}

// Page-only moderator/admin guard for section-gated admin screens.
export async function requireAdminSectionAccess(section: ModeratorSection): Promise<AdminOrModeratorContext> {
  try {
    return await requireAdminOrModerator(section);
  } catch {
    redirect('/access-denied');
  }
}

// Page-only moderator/admin guard for shared admin areas without section scoping.
export async function requireAdminAreaActor(): Promise<AdminOrModeratorContext> {
  try {
    return await requireAdminOrModerator();
  } catch {
    redirect('/access-denied');
  }
}
